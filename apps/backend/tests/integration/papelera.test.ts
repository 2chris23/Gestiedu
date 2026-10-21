import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { platformPrisma } from '../../src/config/database';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, createTestClassroom, createTestSubject } from '../helpers';
import { tirarLoQueNoSirve } from '../../src/services/mantenimiento.service';

/**
 * LA PAPELERA DEL ADMIN (19-oct-2026; `services/papelera.service.ts`)
 *
 * Cristian: «imagina que eres el admin y borraste sin querer un estudiante y
 * lo quieres recuperar… claro, esto tendría un límite». Y: lo borrado no se
 * queda en la base para siempre.
 *
 *   PAPELERA-01 borrar un alumno y restaurarlo lo devuelve igual, tabla por tabla
 *               (sus notas, su asistencia, su sección, su representante)
 *   PAPELERA-02 la lista: de 20 en 20, qué se borró, quién y cuándo se va para siempre; solo el admin
 *   PAPELERA-03 si se volvió a crear con la misma cédula, 409 YA_EXISTE y no se toca nada;
 *               si se borró lo de arriba (su sección), 409 FALTA_LO_DE_ARRIBA
 *   PAPELERA-04 «Borrar para siempre» lo quita ya; pasado el plazo del liceo, la tarea
 *               diaria lo borra de la base; el plazo va de 7 a 90 y no borra el resto de la configuración
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('La papelera del admin', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any;
    const tk: Record<string, string> = {};
    let ano: any, seccion: any, materia: any, lapso: any;
    const api = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const papelera = (t = tk.admin, pagina = 1) => api(t)(request(server.server).get(`/api/papelera?pagina=${pagina}`));
    const restaurar = (op: string) => api(tk.admin)(request(server.server).post(`/api/papelera/${encodeURIComponent(op)}/restaurar`));

    /** Un alumno con todo lo suyo: sección, nota, asistencia, representante. */
    async function unAlumnoConTodo(nombre: string) {
        const alumno = (await createTestUser(prisma, UserRole.STUDENT, { firstName: nombre, lastName: 'Prueba' })).user;
        const madre = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentClassroom.create({ data: { studentId: alumno.id, classroomId: seccion.id, academicYearId: ano.id } });
        await prisma.studentTutor.create({ data: { studentId: alumno.id, tutorId: madre.id, relationship: 'Madre' } as any });
        const act = await prisma.activity.create({
            data: { title: `Prueba ${nombre}`, type: 'SUMATIVA', scope: 'CLASSROOM', startDate: new Date('2026-10-01'), maxGrade: 20, weight: 1, classroomId: seccion.id, subjectId: materia.id, periodId: lapso.id, lapso: '1', createdBy: profe.id, instituteId: 'institute' } as any,
        });
        await prisma.grade.create({ data: { studentId: alumno.id, activityId: act.id, periodId: lapso.id, subjectId: materia.id, teacherId: profe.id, score: 17 } });
        await prisma.dailyAttendance.create({ data: { studentId: alumno.id, classroomId: seccion.id, teacherId: profe.id, date: new Date('2026-10-02'), status: 'PRESENT' } as any });
        return alumno;
    }
    const loDe = async (id: string) => ({
        user: await prisma.user.findUnique({ where: { id } }),
        notas: await prisma.grade.findMany({ where: { studentId: id }, orderBy: { id: 'asc' } }),
        asistencia: await prisma.dailyAttendance.findMany({ where: { studentId: id }, orderBy: { id: 'asc' } }),
        seccion: await prisma.studentClassroom.findMany({ where: { studentId: id }, orderBy: { id: 'asc' } }),
        representante: await prisma.studentTutor.findMany({ where: { studentId: id }, orderBy: { id: 'asc' } }),
    });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN, { firstName: 'Directora', lastName: 'Admin' })).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        ano = await prisma.academicYear.create({ data: { id: gId(), name: `Pap-${gId().slice(0, 5)}`, startDate: new Date('2026-09-15'), endDate: new Date('2027-07-15'), isActive: true, status: 'ACTIVE' as any, instituteId: 'institute' } });
        lapso = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: new Date('2026-09-15'), endDate: new Date('2026-12-15'), academicYearId: ano.id } });
        seccion = await createTestClassroom(prisma, ano.id, 'institute');
        materia = await createTestSubject(prisma, 'institute');
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma?.$disconnect();
        await server?.close();
    });

    it('PAPELERA-01: borrar un alumno y restaurarlo lo devuelve igual, tabla por tabla', async () => {
        const ana = await unAlumnoConTodo('Ana');
        const antes = await loDe(ana.id);
        expect(antes.notas).toHaveLength(1);

        expect((await api(tk.admin)(request(server.server).delete(`/api/users/${ana.id}`))).status).toBe(200);
        expect((await loDe(ana.id)).user).toBeNull();

        const lista = (await papelera()).body.data;
        const suyo = lista.borrados.find((b: any) => b.que === 'Estudiante Ana Prueba');
        expect(suyo).toBeTruthy();
        // Un solo borrado: el alumno y lo que arrastró (nota, asistencia, sección, representante).
        expect(suyo.masCosas).toBeGreaterThanOrEqual(4);
        expect(suyo.borradoPor).toBe('Directora Admin');

        const r = await restaurar(suyo.operacion);
        expect(r.status).toBe(200);
        expect(r.body.data.que).toBe('Estudiante Ana Prueba');
        expect(await loDe(ana.id)).toEqual(antes);
        // Ya no está en la papelera, y restaurar dos veces no hace nada.
        expect((await papelera()).body.data.borrados.find((b: any) => b.operacion === suyo.operacion)).toBeUndefined();
        expect((await restaurar(suyo.operacion)).status).toBe(404);
    }, 90000);

    it('PAPELERA-02: la lista va de 20 en 20, dice cuándo se va para siempre, y solo la ve el admin', async () => {
        for (let i = 0; i < 22; i++) {
            const m = await prisma.subject.create({ data: { id: gId(), name: `Borrable ${i}`, code: `B${i}-${gId().slice(0, 4)}`, slug: `b-${gId()}`, instituteId: 'institute' } as any });
            expect((await api(tk.admin)(request(server.server).delete(`/api/subjects/${m.id}`))).status).toBeLessThan(300);
        }
        const p1 = (await papelera()).body.data;
        expect(p1.borrados).toHaveLength(20);
        expect(p1.total).toBeGreaterThanOrEqual(22);
        expect(p1.dias).toBe(30);
        const b = p1.borrados[0];
        expect(b.que).toMatch(/^Materia «Borrable \d+»$/);
        expect(new Date(b.seBorraEl).getTime() - new Date(b.cuando).getTime()).toBe(30 * 86_400_000);
        expect((await papelera(tk.admin, 2)).body.data.borrados.length).toBeGreaterThanOrEqual(2);
        expect((await papelera(tk.profe)).status).toBe(403);
        expect((await api(tk.profe)(request(server.server).post(`/api/papelera/${encodeURIComponent(b.operacion)}/restaurar`))).status).toBe(403);
    }, 120000);

    it('PAPELERA-03: lo que ya existe otra vez o lo que perdió a su padre no se restaura, y no se toca nada', async () => {
        // Se volvió a crear con la misma cédula.
        const beto = await unAlumnoConTodo('Beto');
        await api(tk.admin)(request(server.server).delete(`/api/users/${beto.id}`)).expect(200);
        const op = (await papelera()).body.data.borrados.find((x: any) => x.que === 'Estudiante Beto Prueba').operacion;
        await createTestUser(prisma, UserRole.STUDENT, { id: beto.id, firstName: 'Beto', lastName: 'Nuevo' });
        const r = await restaurar(op);
        expect([r.status, r.body.code]).toEqual([409, 'YA_EXISTE']);
        expect(await prisma.grade.count({ where: { studentId: beto.id } })).toBe(0); // no entró nada a medias
        expect((await papelera()).body.data.borrados.some((x: any) => x.operacion === op)).toBe(true); // sigue en la papelera

        // Se borró su sección después.
        const otra = await prisma.classroom.create({ data: { id: gId(), name: '1er Grado B', slug: `aula-${gId()}`, grade: 1, section: 'B', capacity: 30, academicYearId: ano.id, instituteId: 'institute' } as any });
        const caro = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Caro', lastName: 'Prueba' })).user;
        await prisma.studentClassroom.create({ data: { studentId: caro.id, classroomId: otra.id, academicYearId: ano.id } });
        await api(tk.admin)(request(server.server).delete(`/api/users/${caro.id}`)).expect(200);
        const opCaro = (await papelera()).body.data.borrados.find((x: any) => x.que === 'Estudiante Caro Prueba').operacion;
        await prisma.classroom.delete({ where: { id: otra.id } });
        const r2 = await restaurar(opCaro);
        expect([r2.status, r2.body.code]).toEqual([409, 'FALTA_LO_DE_ARRIBA']);
        expect(await prisma.user.findUnique({ where: { id: caro.id } })).toBeNull();
    }, 90000);

    it('PAPELERA-04: borrar para siempre, el plazo del liceo y la tarea diaria', async () => {
        const dani = await unAlumnoConTodo('Dani');
        await api(tk.admin)(request(server.server).delete(`/api/users/${dani.id}`)).expect(200);
        const op = (await papelera()).body.data.borrados.find((x: any) => x.que === 'Estudiante Dani Prueba').operacion;
        expect((await api(tk.admin)(request(server.server).delete(`/api/papelera/${encodeURIComponent(op)}`))).status).toBe(200);
        expect(await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE operacion = $1`, op)).toHaveLength(0);
        expect((await restaurar(op)).status).toBe(404);

        // El plazo: de 7 a 90, y guardarlo no borra el resto de la configuración.
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 12 } as any } });
        const poner = (dias: number) => api(tk.admin)(request(server.server).put('/api/papelera/ajustes')).send({ dias });
        expect((await poner(3)).body.code).toBe('PLAZO_INVALIDO');
        expect((await poner(120)).body.code).toBe('PLAZO_INVALIDO');
        expect((await poner(7)).status).toBe(200);
        expect((await api(tk.admin)(request(server.server).get('/api/papelera/ajustes'))).body.data.dias).toBe(7);
        const cfg = (await platformPrisma.institute.findUnique({ where: { id: 'institute' }, select: { academicConfig: true } }))!.academicConfig as any;
        expect(cfg).toMatchObject({ notaMinimaAprobatoria: 12, papelera: { dias: 7 } });

        // Pasado el plazo, la tarea diaria lo borra de la base para siempre.
        const eli = await unAlumnoConTodo('Eli');
        await api(tk.admin)(request(server.server).delete(`/api/users/${eli.id}`)).expect(200);
        await prisma.$executeRawUnsafe(`UPDATE registros_borrados SET "createdAt" = now() - interval '8 days' WHERE "registroId" = $1 OR "contenido"->>'studentId' = $1`, eli.id);
        const tirado = await tirarLoQueNoSirve(prisma, new Date(), 7);
        expect(tirado.papelera).toBeGreaterThanOrEqual(5);
        expect(await prisma.$queryRawUnsafe<any[]>(`SELECT 1 FROM registros_borrados WHERE "registroId" = $1 OR "contenido"->>'studentId' = $1`, eli.id)).toHaveLength(0);
    }, 90000);
});
