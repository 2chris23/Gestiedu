import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { todayInTimezone } from '../../src/utils/school-time';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — EL DÍA A DÍA DE UN PROFESOR
 *
 * Pasar asistencia, corregirla, poner una nota y dejar una actividad para hoy y
 * para la próxima clase. Lo que se comprueba en cada paso es el efecto real:
 * que la asistencia queda como se marcó, que la nota se refleja en el promedio,
 * y que una actividad aparece el día que le toca y no otro.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — el día a día de un profesor', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let teacherToken: string;
    let teacherId: string;
    let adminToken: string;
    let year: any;
    let period: any;
    let classroom: any;
    let subject: any;
    let alumno1: any;
    let alumno2: any;

    const limpiar = { usuarios: [] as string[], secciones: [] as string[] };

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const comoProfesor = (req: request.Test) => auth(teacherToken)(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
        const teacher = await createTestUser(prisma, UserRole.TEACHER);
        teacherId = teacher.user.id;
        teacherToken = generateTestToken(teacherId, UserRole.TEACHER, 'institute');
        limpiar.usuarios.push(admin.user.id, teacherId);

        year = await createTestAcademicYear(prisma, 'institute');
        period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                academicYearId: year.id,
                startDate: new Date('2026-09-01'),
                endDate: new Date('2026-12-15'),
                isActive: true,
            },
        });

        classroom = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Día a día A',
                slug: `dia-${Date.now()}`,
                grade: 2,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId,
            },
        });
        limpiar.secciones.push(classroom.id);

        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId, weeklyBlocks: 3 },
        });

        for (const nombre of ['uno', 'dos']) {
            const a = await createTestUser(prisma, UserRole.STUDENT);
            limpiar.usuarios.push(a.user.id);
            await prisma.studentClassroom.create({
                data: { studentId: a.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            });
            if (nombre === 'uno') alumno1 = a.user;
            else alumno2 = a.user;
        }
    }, 180000);

    /**
     * Se vacía la copia guardada antes de cada caso.
     *
     * Estas pruebas meten datos **directamente en la base**, saltándose la API.
     * En el sistema de verdad eso no ocurre: todo cambio entra por la API, y la
     * API limpia la copia de quien corresponda al guardar. Pero aquí no hay
     * quien la limpie, así que un caso le pasaría al siguiente una respuesta
     * vieja y parecería un fallo del sistema cuando es de la prueba.
     */
    beforeEach(async () => {
        const { RedisCache } = await import('../../src/config/redis');
        // El liceo va dicho: lo guardado vive dentro de su apartado y desde
        // fuera de una petición no hay ninguno que suponer. Ver
        // `config/ambito-del-liceo.ts`.
        const { conLiceo } = await import('../../src/config/ambito-del-liceo');
        await conLiceo('institute', () => RedisCache.clearPattern('cache:institute:*')).catch(() => undefined);
    });

    afterAll(async () => {
        await prisma.classActivity.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.dailyAttendance.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.grade.deleteMany({ where: { studentId: { in: limpiar.usuarios } } }).catch(() => {});
        await prisma.classroomSubject.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.studentClassroom.deleteMany({ where: { classroomId: classroom.id } }).catch(() => {});
        await prisma.classroom.deleteMany({ where: { id: { in: limpiar.secciones } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: { in: limpiar.usuarios } } }).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('asistencia', () => {
        // Hoy en el liceo: el sistema no admite registrar días futuros, así que
        // una fecha fija se volvería inválida con el paso del tiempo.
        const FECHA = todayInTimezone('America/Caracas');

        it('se marca presente y ausente, y queda guardado así', async () => {
            const presente = await comoProfesor(request(server.server).post('/api/attendance')).send({
                studentId: alumno1.id,
                classroomId: classroom.id,
                date: FECHA,
                status: 'PRESENT',
            });
            expect([200, 201]).toContain(presente.status);

            const ausente = await comoProfesor(request(server.server).post('/api/attendance')).send({
                studentId: alumno2.id,
                classroomId: classroom.id,
                date: FECHA,
                status: 'ABSENT',
                comments: 'Sin justificar',
            });
            expect([200, 201]).toContain(ausente.status);

            const registros = await prisma.dailyAttendance.findMany({
                where: { classroomId: classroom.id, date: new Date(FECHA) },
            });
            expect(registros).toHaveLength(2);
            expect(registros.find((r) => r.studentId === alumno1.id)!.status).toBe('PRESENT');
            expect(registros.find((r) => r.studentId === alumno2.id)!.status).toBe('ABSENT');
        }, 60000);

        it('se consulta la asistencia de ese día de la sección', async () => {
            const res = await comoProfesor(
                request(server.server).get(`/api/attendance/classroom/${classroom.id}/date/${FECHA}`)
            );

            expect(res.status).toBe(200);
            const lista = res.body.attendances ?? res.body.attendance ?? res.body.data ?? [];
            expect(Array.isArray(lista) ? lista.length : 0).toBeGreaterThanOrEqual(2);
        }, 60000);

        it('se corrige una falta por presente y el cambio se guarda', async () => {
            const registro = await prisma.dailyAttendance.findFirst({
                where: { classroomId: classroom.id, studentId: alumno2.id, date: new Date(FECHA) },
            });

            const res = await comoProfesor(request(server.server).put(`/api/attendance/${registro!.id}`)).send({
                status: 'EXCUSED',
                comments: 'Trajo justificativo',
            });
            expect(res.status).toBe(200);

            const actualizado = await prisma.dailyAttendance.findUnique({ where: { id: registro!.id } });
            expect(actualizado!.status).toBe('EXCUSED');
            expect(actualizado!.comments).toBe('Trajo justificativo');
        }, 60000);

        it('no acepta un estado inventado', async () => {
            const res = await comoProfesor(request(server.server).post('/api/attendance')).send({
                studentId: alumno1.id,
                classroomId: classroom.id,
                date: FECHA,
                status: 'DE_PASEO',
            });
            expect(res.status).toBe(400);
        }, 60000);

        it('no deja pasar asistencia de un estudiante que no existe', async () => {
            const res = await comoProfesor(request(server.server).post('/api/attendance')).send({
                studentId: 'V00000000',
                classroomId: classroom.id,
                date: FECHA,
                status: 'PRESENT',
            });
            expect(res.status).toBe(404);
        }, 60000);
    });

    describe('actividades de clase', () => {
        it('una actividad para HOY aparece en la clase de hoy', async () => {
            const hoy = '2026-09-15';
            await prisma.classActivity.create({
                data: {
                    classroomId: classroom.id,
                    subjectId: subject.id,
                    title: 'Taller en clase',
                    type: 'TAREA',
                    target: 'CURRENT',
                    dueDate: new Date(2026, 8, 15, 12, 0, 0),
                    maxScore: 20,
                    scores: {},
                },
            });

            const res = await comoProfesor(
                request(server.server)
                    .get('/api/sessions/live-detail')
                    .query({ classroomId: classroom.id, subjectId: subject.id, date: hoy })
            );

            expect(res.status).toBe(200);
            const taller = res.body.activities.find((a: any) => a.title === 'Taller en clase');
            expect(taller).toBeDefined();
            expect(taller.dueToday).toBe(true);
            expect(taller.isFuture).toBe(false);
        }, 60000);

        it('una actividad para la PRÓXIMA clase se anuncia SOLO en la clase donde se mandó', async () => {
            // Se manda durante la clase del 15/09 para el 17/09.
            await prisma.classActivity.create({
                data: {
                    classroomId: classroom.id,
                    subjectId: subject.id,
                    title: 'Examen del jueves',
                    type: 'EXAMEN',
                    target: 'NEXT',
                    dueDate: new Date(2026, 8, 17, 12, 0, 0),
                    createdAt: new Date(2026, 8, 15, 9, 0, 0),
                    maxScore: 20,
                    scores: {},
                },
            });

            const detalle = (fecha: string) =>
                comoProfesor(
                    request(server.server)
                        .get('/api/sessions/live-detail')
                        .query({ classroomId: classroom.id, subjectId: subject.id, date: fecha })
                );

            // En la clase donde se mandó: aparece como próxima
            const elDiaQueSeMando = await detalle('2026-09-15');
                const anuncio = elDiaQueSeMando.body.activities.find((a: any) => a.title === 'Examen del jueves');
            expect(anuncio.isFuture).toBe(true);
            expect(anuncio.dueToday).toBe(false);

            // En otra clase intermedia NO se repite: si se anunciara en todas, la
            // pestaña "Próxima clase" se llenaría de actividades acumuladas.
            const otraClase = await detalle('2026-09-16');
            const repetida = otraClase.body.activities.find((a: any) => a.title === 'Examen del jueves');
            expect(repetida?.isFuture ?? false).toBe(false);

            // El día que toca: aparece como la clase de hoy, se mandara donde se mandara
            const elDiaDelExamen = await detalle('2026-09-17');
            const hoy = elDiaDelExamen.body.activities.find((a: any) => a.title === 'Examen del jueves');
            expect(hoy.dueToday).toBe(true);
            expect(hoy.isFuture).toBe(false);
        }, 60000);

        it('una actividad de otra materia no se cuela en esta clase', async () => {
            const otraMateria = await createTestSubject(prisma, 'institute');
            await prisma.classActivity.create({
                data: {
                    classroomId: classroom.id,
                    subjectId: otraMateria.id,
                    title: 'Actividad de otra materia',
                    type: 'TAREA',
                    target: 'CURRENT',
                    dueDate: new Date(2026, 8, 15, 12, 0, 0),
                    maxScore: 20,
                    scores: {},
                },
            });

            const res = await comoProfesor(
                request(server.server)
                    .get('/api/sessions/live-detail')
                    .query({ classroomId: classroom.id, subjectId: subject.id, date: '2026-09-15' })
            );

            expect(res.body.activities.some((a: any) => a.title === 'Actividad de otra materia')).toBe(false);
        }, 60000);
    });

    describe('notas', () => {
        it('la nota puesta en clase se refleja en el promedio del estudiante', async () => {
            await prisma.classActivity.create({
                data: {
                    classroomId: classroom.id,
                    subjectId: subject.id,
                    title: 'Prueba corta',
                    type: 'EVALUACION',
                    target: 'CURRENT',
                    maxScore: 20,
                    scores: { [alumno1.id]: 19, [alumno2.id]: 11 },
                },
            });

            const res = await comoProfesor(
                request(server.server).get('/api/students').query({ classroomId: classroom.id, isActive: 'true' })
            );

            expect(res.status).toBe(200);
            const lista = res.body.students as any[];
            expect(Number(lista.find((e) => e.id === alumno1.id).average)).toBeCloseTo(19, 0);
            expect(Number(lista.find((e) => e.id === alumno2.id).average)).toBeCloseTo(11, 0);
        }, 60000);

        it('el promedio de la sección no lo puede ver un estudiante de otra sección', async () => {
            const intruso = await createTestUser(prisma, UserRole.STUDENT);
            limpiar.usuarios.push(intruso.user.id);
            const tokenIntruso = generateTestToken(intruso.user.id, UserRole.STUDENT, 'institute');

            const res = await auth(tokenIntruso)(
                request(server.server).get('/api/students').query({ classroomId: classroom.id })
            );

            expect([401, 403]).toContain(res.status);
        }, 60000);
    });
});
