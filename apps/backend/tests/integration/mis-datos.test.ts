import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter, TextWriter, configure } from '@zip.js/zip.js';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, createTestClassroom, createTestSubject } from '../helpers';

/**
 * «DESCARGAR TODOS MIS DATOS» (19-oct-2026; `services/mis-datos.service.ts`)
 *
 * Cristian: pase lo que pase con Gestiedu, el liceo se queda con todo lo suyo,
 * sin pedírselo a nadie, y se abre sin Gestiedu.
 *
 *   MISDATOS-01 se arma de fondo y el ZIP trae, legible, lo del liceo: las personas,
 *               las notas (de actividad y del plan), la asistencia, las fotos y las facturas
 *   MISDATOS-02 sin la contraseña no se abre; con una mala, tampoco
 *   MISDATOS-03 solo el admin; contraseña corta, 400; dos a la vez, 409
 */

configure({ useWebWorkers: false });
const SLUG = 'test-institute';
const CLAVE = 'una-clave-larga-1';
const gId = () => `c${createId()}`;

describe('Descargar todos mis datos', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, ana: any;
    const tk: Record<string, string> = {};
    let zipBytes: Uint8Array;
    const api = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);

    beforeAll(async () => {
        process.env.MIS_DATOS_DIR = require('path').join(require('os').tmpdir(), `mis-datos-prueba-${Date.now()}`);
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Exportada' })).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');

        const ano = await prisma.academicYear.create({ data: { id: gId(), name: '2026-2027', startDate: new Date('2026-09-15'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE' as any, instituteId: 'institute' } });
        const lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: new Date('2026-09-15'), endDate: new Date('2026-12-15'), academicYearId: ano.id } });
        const seccion = await createTestClassroom(prisma, ano.id, 'institute');
        const materia = await createTestSubject(prisma, 'institute');
        await prisma.studentClassroom.create({ data: { studentId: ana.id, classroomId: seccion.id, academicYearId: ano.id } });
        await prisma.classActivity.create({ data: { classroomId: seccion.id, subjectId: materia.id, title: 'Exposición', target: 'CURRENT', scores: { [ana.id]: 18 } } as any });
        const act = await prisma.activity.create({
            data: { title: 'Prueba corta', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: new Date('2026-10-01'), maxGrade: 20, weight: 1, classroomId: seccion.id, subjectId: materia.id, periodId: lapso.id, lapso: '1', createdBy: profe.id, instituteId: 'institute' } as any,
        });
        await prisma.grade.create({ data: { studentId: ana.id, activityId: act.id, periodId: lapso.id, subjectId: materia.id, teacherId: profe.id, score: 15 } });
        await prisma.dailyAttendance.create({ data: { studentId: ana.id, classroomId: seccion.id, teacherId: profe.id, date: new Date('2026-10-02'), status: 'ABSENT' } as any });
        const foto = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3366cc' } }).webp().toBuffer();
        await prisma.userPhoto.create({ data: { userId: ana.id, data: new Uint8Array(foto), version: 'v1', size: foto.length } });
    }, 120000);

    afterAll(async () => {
        require('fs').rmSync(process.env.MIS_DATOS_DIR!, { recursive: true, force: true });
        await prisma?.$disconnect();
        await server?.close();
    });

    async function esperarLista(): Promise<any> {
        for (let i = 0; i < 120; i++) {
            const r = (await api(tk.admin)(request(server.server).get('/api/mis-datos'))).body.data;
            if (r?.estado !== 'ARMANDO') return r;
            await new Promise((ok) => setTimeout(ok, 250));
        }
        throw new Error('No terminó de armarse');
    }

    it('MISDATOS-01: se arma de fondo y trae, legible, lo del liceo', async () => {
        const t0 = Date.now();
        const pedido = await api(tk.admin)(request(server.server).post('/api/mis-datos')).send({ contrasena: CLAVE });
        expect(pedido.status).toBe(202);
        expect(Date.now() - t0).toBeLessThan(3000); // pedir no espera a que se arme
        const listo = await esperarLista();
        expect(listo.estado).toBe('LISTA');
        expect(listo.bytes).toBeGreaterThan(1000);
        expect(new Date(listo.caducaEn).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);

        const bajada = await api(tk.admin)(request(server.server).get(`/api/mis-datos/${listo.id}/archivo`)).buffer(true).parse((res, cb) => {
            const trozos: Buffer[] = [];
            res.on('data', (c: Buffer) => trozos.push(c));
            res.on('end', () => cb(null, Buffer.concat(trozos)));
        });
        expect(bajada.status).toBe(200);
        expect(bajada.headers['content-type']).toBe('application/zip');
        zipBytes = new Uint8Array(bajada.body as Buffer);

        const entradas = await new ZipReader(new Uint8ArrayReader(zipBytes)).getEntries();
        const nombres = entradas.map((e) => e.filename);
        expect(nombres).toEqual(expect.arrayContaining(['LEEME.txt', 'Personas.xlsx', '2026-2027/Estudiantes y notas.xlsx', '2026-2027/Asistencia y observaciones.xlsx', `fotos/${ana.id}.webp`]));
        expect(entradas.every((e) => e.encrypted)).toBe(true);

        const leer = async (nombre: string) => {
            const e = entradas.find((x) => x.filename === nombre)!;
            const libro = new ExcelJS.Workbook();
            await libro.xlsx.load(Buffer.from(await e.getData!(new Uint8ArrayWriter(), { password: CLAVE })) as any);
            return libro;
        };
        const filasDe = (libro: ExcelJS.Workbook, hoja: string) => {
            const salida: unknown[][] = [];
            libro.getWorksheet(hoja)!.eachRow((fila, n) => n > 1 && salida.push((fila.values as unknown[]).slice(1)));
            return salida;
        };
        const notas = await leer('2026-2027/Estudiantes y notas.xlsx');
        expect(filasDe(notas, 'Estudiantes')).toEqual([expect.arrayContaining([ana.id, 'Exportada, Ana'])]);
        expect(filasDe(notas, 'Notas de actividades')[0]).toEqual(expect.arrayContaining([ana.id, 'Exposición', 18]));
        expect(filasDe(notas, 'Notas del plan')[0]).toEqual(expect.arrayContaining([ana.id, 'Primer Lapso', 'Prueba corta', 15]));
        const asis = await leer('2026-2027/Asistencia y observaciones.xlsx');
        expect(filasDe(asis, 'Asistencia')[0]).toEqual(expect.arrayContaining([ana.id, '2026-10-02', 'Ausente']));
        const foto = entradas.find((e) => e.filename === `fotos/${ana.id}.webp`)!;
        expect((await foto.getData!(new Uint8ArrayWriter(), { password: CLAVE })).length).toBeGreaterThan(10);
        const leeme = entradas.find((e) => e.filename === 'LEEME.txt')!;
        expect(await leeme.getData!(new TextWriter(), { password: CLAVE })).toContain('Se abre sin Gestiedu');
    }, 120000);

    it('MISDATOS-02: sin la contraseña, o con una mala, no se abre', async () => {
        const [e] = await new ZipReader(new Uint8ArrayReader(zipBytes)).getEntries();
        await expect(e.getData!(new TextWriter())).rejects.toThrow();
        await expect(e.getData!(new TextWriter(), { password: 'otra-clave-cualquiera' })).rejects.toThrow(/password/i);
    });

    it('MISDATOS-03: solo el admin; la contraseña corta no; dos a la vez, no', async () => {
        expect((await api(tk.profe)(request(server.server).post('/api/mis-datos')).send({ contrasena: CLAVE })).status).toBe(403);
        expect((await api(tk.profe)(request(server.server).get('/api/mis-datos'))).status).toBe(403);
        expect((await api(tk.admin)(request(server.server).post('/api/mis-datos')).send({ contrasena: 'corta' })).body.code).toBe('CONTRASENA_CORTA');
        await api(tk.admin)(request(server.server).post('/api/mis-datos')).send({ contrasena: CLAVE }).expect(202);
        const otra = await api(tk.admin)(request(server.server).post('/api/mis-datos')).send({ contrasena: CLAVE });
        expect([otra.status, otra.body.code]).toEqual([409, 'YA_SE_ESTA_ARMANDO']);
        await esperarLista();
    }, 120000);
});
