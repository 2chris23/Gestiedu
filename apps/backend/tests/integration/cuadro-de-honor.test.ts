import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { sacarLaFoto, sacarLaFotoSiFalta } from '../../src/services/cuadro-de-honor.service';
import { RedisCache } from '../../src/config/redis';
import { conLiceo } from '../../src/config/ambito-del-liceo';

/**
 * EL CUADRO DE HONOR, DE PUNTA A PUNTA (CUADRO-04…08, 2026-10-04)
 *
 *   CUADRO-04  el promedio es el de la boleta; la asistencia, solo del período
 *   CUADRO-05  la foto es una por sábado, aunque se pida dos veces a la vez;
 *              y se pone al día si el sábado no se sacó
 *   CUADRO-06  «subió N puestos» compara con la foto anterior, en su año
 *   CUADRO-07  el alumno ve SU puntaje, sin puesto ni a nadie más; su
 *              representante, lo mismo; el profesor y otro alumno, 403
 *   CUADRO-08  el admin ve el top del liceo y el de un año; los pesos los pone el liceo
 *   CUADRO-09  una felicitación no resta; una observación fuera del período, tampoco
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('El cuadro de honor (CUADRO)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any, profe: any, tutor: any;
    let ana: any, beto: any, carla: any;
    let year: any, lapso1: any, s1: any, s2: any, mate: any;

    const como = (u: any, role: UserRole) => ({ Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`, 'X-Institute-Slug': SLUG });
    const get = (u: any, role: UserRole, url: string) => request(server.server).get(url).set(como(u, role));

    const nota = async (alumno: any, seccion: any, score: number) => {
        const act = await prisma.activity.create({
            data: {
                id: gId(), title: 'Evaluación', description: 'x', type: 'TAREA' as any, scope: 'CLASSROOM' as any,
                classroomId: seccion.id, subjectId: mate.id, periodId: lapso1.id, createdBy: profe.id, maxGrade: 20, weight: 1,
                startDate: new Date(), endDate: new Date(), dueDate: new Date(),
            } as any,
        });
        await prisma.grade.create({ data: { id: gId(), score, studentId: alumno.id, activityId: act.id, periodId: lapso1.id, subjectId: mate.id, teacherId: profe.id } });
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: { notaMinimaAprobatoria: 10 } } });
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        await prisma.academicYear.updateMany({ where: { status: 'ACTIVE' as any }, data: { status: 'COMPLETED' as any, isActive: false } });
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        lapso1 = await prisma.period.create({ data: { id: gId(), name: 'Primer Lapso', startDate: dia('2026-09-15'), endDate: dia('2026-12-15'), academicYearId: year.id } });
        await prisma.period.create({ data: { id: gId(), name: 'Segundo Lapso', startDate: dia('2027-01-07'), endDate: dia('2027-03-31'), academicYearId: year.id } });
        const aula = (grade: number) =>
            prisma.classroom.create({ data: { id: gId(), name: `${grade}.º A`, slug: `aula-${gId()}`, grade, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' } as any });
        s1 = await aula(1);
        s2 = await aula(2);
        mate = await prisma.subject.create({ data: { id: gId(), name: 'Matemática', code: `MAT-${gId().slice(0, 5)}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any });
        for (const s of [s1, s2]) await prisma.classroomSubject.create({ data: { classroomId: s.id, subjectId: mate.id, teacherId: profe.id } });
        ana = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Ana', lastName: 'Arias' })).user;
        beto = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Beto', lastName: 'Bravo' })).user;
        carla = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Carla', lastName: 'Cruz' })).user;
        for (const [a, s] of [[ana, s1], [beto, s1], [carla, s2]] as const) {
            await prisma.studentClassroom.create({ data: { id: gId(), studentId: a.id, classroomId: s.id, academicYearId: year.id, isActive: true } });
        }
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentTutor.create({ data: { studentId: ana.id, tutorId: tutor.id, relationship: 'Madre' } });

        await nota(ana, s1, 15);
        await nota(beto, s1, 18);
        await nota(carla, s2, 19);
        // Asistencia de Ana: 1 de 2 en el lapso, y una falta FUERA del ciclo que no cuenta.
        await prisma.dailyAttendance.createMany({
            data: [
                { studentId: ana.id, classroomId: s1.id, date: dia('2026-10-01'), status: 'PRESENT' as any, teacherId: profe.id },
                { studentId: ana.id, classroomId: s1.id, date: dia('2026-10-02'), status: 'ABSENT' as any, teacherId: profe.id },
                { studentId: ana.id, classroomId: s1.id, date: dia('2026-08-01'), status: 'ABSENT' as any, teacherId: profe.id },
            ],
        });
    }, 180000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma?.$disconnect();
        await server?.close();
    });

    const filasDe = (fecha: string, alcance: string) =>
        (prisma as any).puntajeDelCuadro.findMany({ where: { academicYearId: year.id, alcance, fecha: dia(fecha) } });

    it('CUADRO-04: el promedio es el de la boleta y la asistencia solo la del período', async () => {
        await sacarLaFoto(prisma, 'institute', '2026-10-03', '2026-10-05');
        const del1 = await filasDe('2026-10-03', lapso1.id);
        const deAna = del1.find((f: any) => f.studentId === ana.id);
        expect(Number(deAna.promedio)).toBe(15);
        expect(deAna.asistencia).toBe(50);
        // 80 × 15/20 + 20 × 50 % = 60 + 10.
        expect(Number(deAna.puntaje)).toBe(70);
        // El segundo lapso no ha empezado: no hay fila de él. El ciclo, sí.
        expect(new Set((await (prisma as any).puntajeDelCuadro.findMany({ where: { fecha: dia('2026-10-03') } })).map((f: any) => f.alcance)).size).toBe(2);
    }, 120000);

    it('CUADRO-05: una foto por sábado, aunque se pida dos veces a la vez; y se pone al día', async () => {
        const [x, y] = await Promise.all([
            sacarLaFotoSiFalta(prisma, 'institute', '2026-10-12'),
            sacarLaFotoSiFalta(prisma, 'institute', '2026-10-12'),
        ]);
        expect(x + y).toBeGreaterThan(0);
        const del10 = await filasDe('2026-10-10', 'CICLO');
        expect(del10).toHaveLength(3);
        // Ya está: no vuelve a calcular.
        expect(await sacarLaFotoSiFalta(prisma, 'institute', '2026-10-15')).toBe(0);
    }, 120000);

    it('CUADRO-06: «subió N puestos» compara con el sábado anterior, en su año', async () => {
        // Ana mejora en notas y en asistencia: ahora pasa a Beto en 1.er año
        // (Beto: 18 y sin faltas = 92; Ana: 19 y 9 de 10 días = 94).
        for (let i = 0; i < 4; i++) await nota(ana, s1, 20);
        await prisma.dailyAttendance.createMany({
            data: Array.from({ length: 8 }, (_, i) => ({
                studentId: ana.id, classroomId: s1.id, date: dia(`2026-10-${String(5 + i).padStart(2, '0')}`), status: 'PRESENT' as any, teacherId: profe.id,
            })),
        });
        // Las notas se crean aquí directo en la base, sin pasar por donde se
        // invalida lo guardado del promedio: se vacía a mano (como la boleta).
        await RedisCache.clearPattern('*').catch(() => undefined);
        await sacarLaFoto(prisma, 'institute', '2026-10-17', '2026-10-17');
        const r = await get(ana, UserRole.STUDENT, `/api/cuadro-de-honor/alumno/${ana.id}`).expect(200);
        const lapso = r.body.alcances.find((a: any) => a.alcance === lapso1.id);
        expect(r.body.fecha).toBe('2026-10-17');
        expect(lapso.subio).toBe(1);
        expect(lapso.puntaje).toBeGreaterThan(70);
    }, 120000);

    it('CUADRO-07: el alumno y su representante ven su puntaje y el puesto solo si es <= 10; el 10.º lo recibe, el 11.º no; profesor y otro alumno 403', async () => {
        const suyo = await get(ana, UserRole.STUDENT, `/api/cuadro-de-honor/alumno/${ana.id}`).expect(200);
        expect(suyo.body.alcances[0]).toHaveProperty('puestoAno');
        expect(suyo.body.alcances[0].puestoAno).toBeLessThanOrEqual(10);
        expect(JSON.stringify(suyo.body)).not.toContain(beto.id);

        // El 11.º NO recibe puestoAno ni puestoLiceo
        await (prisma as any).puntajeDelCuadro.updateMany({
            where: { studentId: beto.id },
            data: { puestoAno: 11, puestoLiceo: 11 },
        });
        await conLiceo('institute', () => RedisCache.clearPattern('*')).catch(() => undefined);
        const del11 = await get(beto, UserRole.STUDENT, `/api/cuadro-de-honor/alumno/${beto.id}`).expect(200);
        for (const a of del11.body.alcances) {
            expect(a).not.toHaveProperty('puestoAno');
            expect(a).not.toHaveProperty('puestoLiceo');
        }

        // El 10.º SÍ recibe puestoAno y puestoLiceo
        await (prisma as any).puntajeDelCuadro.updateMany({
            where: { studentId: beto.id },
            data: { puestoAno: 10, puestoLiceo: 10 },
        });
        await conLiceo('institute', () => RedisCache.clearPattern('*')).catch(() => undefined);
        const del10 = await get(beto, UserRole.STUDENT, `/api/cuadro-de-honor/alumno/${beto.id}`).expect(200);
        expect(del10.body.alcances[0]).toHaveProperty('puestoAno', 10);
        expect(del10.body.alcances[0]).toHaveProperty('puestoLiceo', 10);

        // El tutor de Ana ve el puesto de Ana (<= 10) pero no puede ver a Beto
        const delTutor = await get(tutor, UserRole.TUTOR, `/api/cuadro-de-honor/alumno/${ana.id}`).expect(200);
        expect(delTutor.body.alcances[0]).toHaveProperty('puestoAno');
        await get(tutor, UserRole.TUTOR, `/api/cuadro-de-honor/alumno/${beto.id}`).expect(403);
        await get(beto, UserRole.STUDENT, `/api/cuadro-de-honor/alumno/${ana.id}`).expect(403);
        await get(profe, UserRole.TEACHER, `/api/cuadro-de-honor/alumno/${ana.id}`).expect(403);
        for (const [u, rol] of [[ana, UserRole.STUDENT], [tutor, UserRole.TUTOR], [profe, UserRole.TEACHER]] as const) {
            expect([401, 403]).toContain((await get(u, rol, '/api/cuadro-de-honor')).status);
        }
        // El admin ve el puesto siempre, incluso si es el 11.º
        await (prisma as any).puntajeDelCuadro.updateMany({
            where: { studentId: beto.id },
            data: { puestoAno: 11, puestoLiceo: 11 },
        });
        await conLiceo('institute', () => RedisCache.clearPattern('*')).catch(() => undefined);
        const delAdmin = await get(admin, UserRole.ADMIN, `/api/cuadro-de-honor/alumno/${beto.id}`).expect(200);
        expect(delAdmin.body.alcances[0]).toHaveProperty('puestoAno', 11);
        expect(delAdmin.body.alcances[0]).toHaveProperty('puestoLiceo', 11);
    }, 120000);

    it('CUADRO-09: una felicitación no resta; una observación sí, y solo la del período', async () => {
        const obs = (type: string, ymd: string) =>
            prisma.observation.create({ data: { id: gId(), title: type, type, date: dia(ymd), studentId: beto.id, createdById: profe.id } });
        await obs('POSITIVE', '2026-10-14');
        await obs('OBSERVACION', '2026-10-14');
        await obs('OBSERVACION', '2026-08-01'); // antes del ciclo
        await sacarLaFoto(prisma, 'institute', '2026-10-19', '2026-10-19');
        const deBeto = (await filasDe('2026-10-19', lapso1.id)).find((f: any) => f.studentId === beto.id);
        expect(deBeto.observaciones).toBe(1);
        expect(Number(deBeto.resta)).toBe(5);
    }, 120000);

    it('CUADRO-08: el admin ve el top del liceo y el de un año; los pesos los pone el liceo', async () => {
        const liceo = await get(admin, UserRole.ADMIN, '/api/cuadro-de-honor?alcance=CICLO').expect(200);
        expect(liceo.body.filas[0].id).toBe(carla.id);
        expect(liceo.body.alcances.map((a: any) => a.id)).toContain('CICLO');
        const primero = await get(admin, UserRole.ADMIN, `/api/cuadro-de-honor?alcance=${lapso1.id}&ano=1`).expect(200);
        expect(primero.body.filas.every((f: any) => f.grado === 1)).toBe(true);
        expect(primero.body.filas[0].puesto).toBe(1);

        const mal = await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(como(admin, UserRole.ADMIN))
            .send({ cuadroDeHonor: { pesoNotas: 0, pesoAsistencia: 0, restaPorObservacion: 0 } });
        expect(mal.status).toBe(400);
        const bien = await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(como(admin, UserRole.ADMIN))
            .send({ cuadroDeHonor: { pesoNotas: 100, pesoAsistencia: 0, restaPorObservacion: 0 } });
        expect(bien.status).toBe(200);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await sacarLaFoto(prisma, 'institute', '2026-10-24', '2026-10-24');
        const deAna = (await filasDe('2026-10-24', 'CICLO')).find((f: any) => f.studentId === ana.id);
        // Solo notas: el puntaje es el promedio sobre 20, a base 100.
        expect(Number(deAna.puntaje)).toBe(Number(deAna.promedio) * 5);
    }, 120000);
});
