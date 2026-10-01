import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { generateKeyPairSync } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, cleanTestDatabase, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { RedisCache } from '../../src/config/redis';
import { gradesService } from '../../src/services/grades.service';
import { bulkSubjectAveragesConDatos } from '../../src/services/bulk-averages.service';

/**
 * EL TRASLADO Y EL RETIRO
 *
 *   TRAS-01  retirar: fecha y motivo en la inscripción, deja la sección, la
 *            cuenta se archiva; fecha futura o sin sección, no;
 *   TRAS-02  la hoja de notas parciales: cada lapso del año y la plantilla;
 *   TRAS-03  el archivo de traslado va firmado; tocado → FIRMA_INVALIDA;
 *   TRAS-04  importar: si la cédula ya existe aquí, 409;
 *   TRAS-05  importar en una sección: el alumno se crea con sus datos, sus
 *            años anteriores entran en la certificación, sus lapsos en sus
 *            promedios;
 *   TRAS-06  la nota traída cuenta en el lapso SOLO si aquí no tiene notas;
 *            la propia manda;
 *   TRAS-07  el mismo promedio por los dos caminos (uno a uno y en bloque);
 *   TRAS-08  todo es del admin.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El traslado y el retiro (TRAS-01…08)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, mama: any, ana: any;
    let year: any, lapsos: any[], seccion: any, otraSeccion: any, mate: any, caste: any, actividad: Record<string, string>;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const comoAdmin = () => como(admin, UserRole.ADMIN);
    const api = () => request(server.server);
    const nota = (studentId: string, subjectId: string, lapso: number, score: number) =>
        prisma.grade.create({ data: { studentId, subjectId, activityId: actividad[`${subjectId}|${lapso}`], periodId: lapsos[lapso].id, teacherId: profe.id, score } });

    beforeAll(async () => {
        const { privateKey } = generateKeyPairSync('ed25519');
        process.env.TRASLADO_LLAVE_PRIVADA = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        mama = (await createTestUser(prisma, UserRole.TUTOR, { firstName: 'Rosa', lastName: 'Páez' })).user;
        ana = (await createTestUser(prisma, UserRole.STUDENT, {
            firstName: 'Ana',
            lastName: 'Páez',
            gender: 'FEMENINO',
            birthDate: dia('2011-03-02'),
            lugarDeNacimiento: 'Maracay',
            entidadDeNacimiento: 'Aragua',
            nacionalidad: 'V',
        })).user;
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: mama.id, relationship: 'MADRE' } });
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-14'), endDate: dia('2027-07-31'), status: 'ACTIVE', isActive: true, instituteId: 'institute' } as any,
        });
        lapsos = [];
        for (const [i, [a, b]] of [['2026-09-14', '2026-12-18'], ['2027-01-11', '2027-04-09'], ['2027-04-19', '2027-07-31']].entries()) {
            lapsos[i + 1] = await prisma.period.create({ data: { name: ['Primer', 'Segundo', 'Tercer'][i] + ' Lapso', startDate: dia(a), endDate: dia(b), academicYearId: year.id } as any });
        }
        seccion = await prisma.classroom.create({ data: { id: gId(), name: '3º A', slug: `a-${gId()}`, grade: 3, section: 'A', academicYearId: year.id, instituteId: 'institute' } as any });
        otraSeccion = await prisma.classroom.create({ data: { id: gId(), name: '3º B', slug: `b-${gId()}`, grade: 3, section: 'B', academicYearId: year.id, instituteId: 'institute' } as any });
        mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: 'MA-01', slug: `ma-${gId()}`, instituteId: 'institute' } as any });
        caste = await prisma.subject.create({ data: { id: gId(), name: 'Castellano', code: 'CA-01', slug: `ca-${gId()}`, instituteId: 'institute' } as any });
        actividad = {};
        for (const aula of [seccion, otraSeccion]) {
            for (const m of [mate, caste]) {
                await prisma.classroomSubject.create({ data: { classroomId: aula.id, subjectId: m.id, teacherId: profe.id } as any });
            }
        }
        for (const m of [mate, caste]) {
            for (const l of [1, 2, 3]) {
                const act = await prisma.activity.create({
                    data: { title: `${m.name} ${l}`, type: 'SUMATIVA', scope: 'CLASSROOM', startDate: lapsos[l].startDate, maxGrade: 20, weight: 1, classroomId: seccion.id, subjectId: m.id, periodId: lapsos[l].id, lapso: String(l), createdBy: profe.id, instituteId: 'institute' } as any,
                });
                actividad[`${m.id}|${l}`] = act.id;
            }
        }
        await prisma.studentClassroom.create({ data: { studentId: ana.id, classroomId: seccion.id, academicYearId: year.id } });
        await nota(ana.id, mate.id, 1, 14);
        await nota(ana.id, caste.id, 1, 17);
    });

    const retirar = (body: any = { fecha: '2026-09-25', motivo: 'TRASLADO', detalle: 'U.E. Simón Rodríguez' }) =>
        api().post(`/api/students/${ana.id}/retiro`).set(comoAdmin()).send(body);

    it('TRAS-01: retirar deja la fecha y el motivo, saca de la sección y archiva', async () => {
        const futura = await retirar({ fecha: '2099-01-01', motivo: 'TRASLADO' });
        expect(futura.status).toBe(400);
        await retirar().expect(200);
        const inscripcion = await prisma.studentClassroom.findFirst({ where: { studentId: ana.id } });
        expect(inscripcion).toMatchObject({ isActive: false, motivoDeRetiro: 'Traslado a U.E. Simón Rodríguez' });
        expect(inscripcion!.retiradoEl!.toISOString().slice(0, 10)).toBe('2026-09-25');
        expect(await prisma.user.findUnique({ where: { id: ana.id }, select: { status: true, isActive: true } })).toEqual({ status: 'ARCHIVED', isActive: false });
        // Ya no está en ninguna sección: no se la puede retirar otra vez.
        expect((await retirar()).status).toBe(409);
        // La constancia de retiro sale con esa fecha.
        const c = await api().get(`/api/students/${ana.id}/constancia?tipo=RETIRO`).set(comoAdmin()).expect(200);
        expect(c.body.data.parrafos.join(' ')).toContain('se retiró del plantel el 25 de septiembre de 2026');
    });

    it('TRAS-02: la hoja de notas parciales', async () => {
        await retirar().expect(200);
        const h = (await api().get(`/api/students/${ana.id}/notas-parciales`).set(comoAdmin()).expect(200)).body.data;
        expect(h.titulo).toBe('Notas parciales');
        expect(h.parrafos[0]).toContain('cursó el 3er año, sección «A»');
        expect(h.lapsos.map((l: any) => l.numero)).toEqual([1, 2, 3]);
        const m = h.materias.find((x: any) => x.nombre === 'Matemática');
        expect(m.notas).toEqual({ '1': 14, '2': null, '3': null });
        expect(h.retiro).toEqual({ fecha: '2026-09-25', motivo: 'Traslado a U.E. Simón Rodríguez' });
    });

    it('TRAS-03/04: el archivo va firmado; tocado no entra; con la cédula ya aquí, 409', async () => {
        await retirar().expect(200);
        const r = await api().get(`/api/students/${ana.id}/traslado`).set(comoAdmin()).expect(200);
        expect(r.headers['content-disposition']).toContain('.gestiedu');
        const archivo = r.body;
        expect(archivo.formato).toBe('gestiedu-traslado');
        expect(archivo.datos.alumno).toMatchObject({ cedula: ana.id, nombres: 'Ana', lugarDeNacimiento: 'Maracay' });
        expect(archivo.datos.representantes).toEqual([expect.objectContaining({ nombres: 'Rosa', parentesco: 'MADRE' })]);

        const bien = await api().post('/api/traslados/revisar').set(comoAdmin()).send({ archivo, classroomId: otraSeccion.id }).expect(200);
        expect(bien.body.data).toMatchObject({ valido: true, yaExiste: true, emparejamiento: { Matemática: mate.id, Castellano: caste.id } });

        const tocado = JSON.parse(JSON.stringify(archivo));
        tocado.datos.anoEnCurso.materias[0].notas['1'] = 20;
        const mal = await api().post('/api/traslados/revisar').set(comoAdmin()).send({ archivo: tocado });
        expect(mal.status).toBe(400);
        expect(mal.body.code).toBe('FIRMA_INVALIDA');

        const repetida = await api().post('/api/traslados/importar').set(comoAdmin()).send({ archivo, classroomId: otraSeccion.id, password: 'Clave-segura-1' });
        expect(repetida.status).toBe(409);
        expect(repetida.body.code).toBe('CEDULA_EN_USO');
    });

    it('TRAS-05/06/07: se importa con sus datos, su certificación y sus lapsos, que cuentan solo sin notas propias', async () => {
        // Un año anterior en su certificación, que viaja en el archivo.
        await prisma.calificacionExterna.create({
            data: { studentId: ana.id, grado: 2, anoEscolar: '2025-2026', materia: 'Matemática', nota: 16, tipo: 'F', fecha: '07/2026', plantel: 'Escuela Anterior' },
        });
        await retirar().expect(200);
        const archivo = (await api().get(`/api/students/${ana.id}/traslado`).set(comoAdmin()).expect(200)).body;
        // Se va: en «el otro liceo» (esta misma base, para la prueba) ya no existe.
        await prisma.user.delete({ where: { id: ana.id } });

        const hecho = await api()
            .post('/api/traslados/importar')
            .set(comoAdmin())
            .send({ archivo, classroomId: otraSeccion.id, password: 'Clave-segura-1', email: `ana.${gId()}@nuevo.edu.ve` })
            .expect(201);
        expect(hecho.body.data).toMatchObject({ notasTraidas: 2, anosAnteriores: 1, seccion: { id: otraSeccion.id } });
        expect(hecho.body.data.representantes).toEqual([expect.objectContaining({ nombres: 'Rosa' })]);
        const nueva = await prisma.user.findUnique({ where: { id: ana.id } });
        expect(nueva).toMatchObject({ firstName: 'Ana', role: 'STUDENT', lugarDeNacimiento: 'Maracay', entidadDeNacimiento: 'Aragua', status: 'ACTIVE' });
        expect(await prisma.studentClassroom.findFirst({ where: { studentId: ana.id, isActive: true } })).toMatchObject({ classroomId: otraSeccion.id });

        const cert = (await api().get(`/api/students/${ana.id}/certificacion`).set(comoAdmin()).expect(200)).body.data;
        expect(cert.anos.find((a: any) => a.grado === 2)).toMatchObject({ fuente: 'OTRO_PLANTEL', plantel: 'Escuela Anterior' });

        // TRAS-06: el 1er lapso trae 14 en Matemática; sin notas aquí, cuenta.
        expect(await gradesService.promedioDelLapso(prisma as any, ana.id, mate.id, lapsos[1].id)).toEqual({ promedio: 14, conNotas: true });
        expect(await gradesService.promedioDelLapso(prisma as any, ana.id, mate.id, lapsos[2].id)).toEqual({ promedio: 0, conNotas: false });
        // Una nota propia en ese lapso manda sobre la traída.
        const act = await prisma.activity.create({
            data: { title: 'Prueba aquí', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: lapsos[1].startDate, maxGrade: 20, weight: 1, classroomId: otraSeccion.id, subjectId: caste.id, periodId: lapsos[1].id, lapso: '1', createdBy: profe.id, instituteId: 'institute' } as any,
        });
        await prisma.grade.create({ data: { studentId: ana.id, subjectId: caste.id, activityId: act.id, periodId: lapsos[1].id, teacherId: profe.id, score: 11 } });
        await RedisCache.clearPattern('*').catch(() => undefined);
        expect((await gradesService.promedioDelLapso(prisma as any, ana.id, caste.id, lapsos[1].id)).promedio).toBe(11);

        // TRAS-07: el mismo número uno a uno y en bloque.
        const enBloque = await bulkSubjectAveragesConDatos(prisma as any, { classroomId: otraSeccion.id, studentIds: [ana.id], subjectIds: [mate.id, caste.id] });
        for (const m of [mate, caste]) {
            const uno = await gradesService.promedioDeLaMateria(prisma as any, ana.id, m.id);
            expect(enBloque.get(ana.id)!.get(m.id)).toEqual(uno);
        }
        expect(enBloque.get(ana.id)!.get(mate.id)).toEqual({ promedio: 14, conNotas: true });

        // Las notas traídas se ven y se pueden quitar (con copia).
        const traidas = (await api().get(`/api/students/${ana.id}/notas-traidas`).set(comoAdmin()).expect(200)).body.data;
        expect(traidas).toHaveLength(2);
        await api().delete(`/api/students/${ana.id}/notas-traidas/${traidas[0].id}`).set(comoAdmin()).expect(200);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'notaDeOtroPlantel' } })).toBe(1);
    });

    it('TRAS-08: todo es del admin', async () => {
        await api().post(`/api/students/${ana.id}/retiro`).set(como(profe, UserRole.TEACHER)).send({ fecha: '2026-09-25', motivo: 'OTRO' }).expect(403);
        await api().get(`/api/students/${ana.id}/notas-parciales`).set(como(mama, UserRole.TUTOR)).expect(403);
        await api().get(`/api/students/${ana.id}/traslado`).set(como(ana, UserRole.STUDENT)).expect(403);
        await api().post('/api/traslados/revisar').set(como(profe, UserRole.TEACHER)).send({ archivo: { formato: 'x', datos: {}, firma: 'x' } }).expect(403);
    });
});
