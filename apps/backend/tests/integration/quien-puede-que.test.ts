import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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
 * QUIÉN PUEDE QUÉ — LA MATRIZ RUTA × ROL, CON PETICIONES DE VERDAD
 *
 * El mapa de rutas (`src/scripts/mapa-de-rutas.ts`) dice qué guardias tiene
 * cada ruta según su código. Esto mide si de verdad cortan: cada ruta sensible
 * se llama con cada tipo de persona y se compara lo que responde con lo que el
 * liceo espera.
 *
 * Montaje (todo apunta a la sección A y a su alumna):
 *
 *   profeA   imparte Matemática en 1.º A                      (profesor de esa clase)
 *   guiaA    es el guía de 1.º A, no imparte nada allí         (guía, no imparte)
 *   profeB   imparte Matemática en 1.º B                      (profesor de otra)
 *   alumnaA  estudia en 1.º A;  alumnoB en 1.º B
 *   repA     representa a alumnaA;  repB a alumnoB
 *   otroLiceo  un token firmado de verdad, pero de otro liceo
 *
 * Cada caso lleva quién DEBE poder (`si`) y quién NO (`no`). Lo que no aparece
 * en ninguna de las dos listas se mide y se apunta, pero no se exige: son las
 * dudas que el informe deja por decidir.
 *
 * Con `ESCRIBIR_MATRIZ=1` deja la tabla en `docs/nube/matriz-de-permisos.md`.
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone('America/Caracas');
const gId = () => `c${createId()}`;
const CLAVE = 'ClaveDeLaMatriz-1';

type Quien =
    | 'anonimo'
    | 'admin'
    | 'profeA'
    | 'guiaA'
    | 'profeB'
    | 'alumnaA'
    | 'alumnoB'
    | 'repA'
    | 'repB'
    | 'otroLiceo';

const TODOS: Quien[] = ['anonimo', 'admin', 'profeA', 'guiaA', 'profeB', 'alumnaA', 'alumnoB', 'repA', 'repB', 'otroLiceo'];
const AJENOS: Quien[] = ['anonimo', 'otroLiceo'];
const LADO_B: Quien[] = ['profeB', 'alumnoB', 'repB'];
const NO_PERSONAL: Quien[] = ['alumnaA', 'alumnoB', 'repA', 'repB'];

interface Caso {
    que: string;
    metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
    url: () => string;
    cuerpo?: () => Record<string, unknown>;
    si: Quien[];
    no: Quien[];
    /** Si la respuesta es 200, no puede contener esto (datos del lado A). */
    noDebeContener?: () => string[];
    /** Quiénes, aun respondiendo 200, no pueden ver `noDebeContener`. */
    sinFugaPara?: Quien[];
}

describe('Quién puede qué (matriz ruta × rol)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Partial<Record<Quien, string>> = {};
    const u: Record<string, any> = {};
    const d: Record<string, any> = {};
    const resultados: Array<{ caso: Caso; quien: Quien; status: number; ok: boolean; esperado: string }> = [];

    const pedir = (caso: Caso, quien: Quien) => {
        let req = (request(server.server) as any)[caso.metodo](caso.url()).set('X-Institute-Slug', SLUG);
        if (tk[quien]) req = req.set('Authorization', `Bearer ${tk[quien]}`);
        if (caso.cuerpo) req = req.send(caso.cuerpo());
        return req as Promise<request.Response>;
    };

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const hash = await bcrypt.hash(CLAVE, 8);
        const persona = async (rol: UserRole) => (await createTestUser(prisma, rol, { password: hash })).user;
        u.admin = await persona(UserRole.ADMIN);
        u.profeA = await persona(UserRole.TEACHER);
        u.guiaA = await persona(UserRole.TEACHER);
        u.profeB = await persona(UserRole.TEACHER);
        u.alumnaA = await persona(UserRole.STUDENT);
        u.alumnoB = await persona(UserRole.STUDENT);
        u.repA = await persona(UserRole.TUTOR);
        u.repB = await persona(UserRole.TUTOR);
        // No llama nunca: solo es a quien se intenta asignar una materia.
        u.profeSuelto = await persona(UserRole.TEACHER);
        u.alumnoNuevo = await persona(UserRole.STUDENT);

        const roles: Record<string, UserRole> = {
            admin: UserRole.ADMIN, profeA: UserRole.TEACHER, guiaA: UserRole.TEACHER, profeB: UserRole.TEACHER,
            alumnaA: UserRole.STUDENT, alumnoB: UserRole.STUDENT, repA: UserRole.TUTOR, repB: UserRole.TUTOR,
        };
        for (const [k, rol] of Object.entries(roles)) tk[k as Quien] = generateTestToken(u[k].id, rol, 'institute');
        tk.otroLiceo = generateTestToken(u.admin.id, UserRole.ADMIN, 'otro-liceo-que-no-es-este');

        const year = await createTestAcademicYear(prisma, 'institute');
        d.period = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', academicYearId: year.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'), isActive: true },
        });
        const seccion = (letra: string, guia?: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(), name: `1er Año ${letra}`, slug: `m-${letra.toLowerCase()}-${Date.now()}`, grade: 1, section: letra,
                    capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: guia,
                } as any,
            });
        d.A = await seccion('A', u.guiaA.id);
        d.B = await seccion('B');
        d.mate = await createTestSubject(prisma, 'institute');
        d.otraMateria = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({ data: { classroomId: d.A.id, subjectId: d.mate.id, teacherId: u.profeA.id, weeklyBlocks: 4 } });
        await prisma.classroomSubject.create({ data: { classroomId: d.B.id, subjectId: d.mate.id, teacherId: u.profeB.id, weeklyBlocks: 4 } });
        await prisma.studentClassroom.create({ data: { studentId: u.alumnaA.id, classroomId: d.A.id, academicYearId: year.id, isActive: true } });
        await prisma.studentClassroom.create({ data: { studentId: u.alumnoB.id, classroomId: d.B.id, academicYearId: year.id, isActive: true } });
        await prisma.studentTutor.create({ data: { studentId: u.alumnaA.id, tutorId: u.repA.id, relationship: 'MADRE' } as any });
        await prisma.studentTutor.create({ data: { studentId: u.alumnoB.id, tutorId: u.repB.id, relationship: 'PADRE' } as any });

        d.actividad = await prisma.activity.create({
            data: {
                title: 'Prueba de sumas A', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: new Date('2026-09-10'), maxGrade: 20, weight: 1,
                classroomId: d.A.id, subjectId: d.mate.id, periodId: d.period.id, lapso: '1', createdBy: u.profeA.id, instituteId: 'institute',
            } as any,
        });
        d.actividad2 = await prisma.activity.create({
            data: {
                title: 'Taller A', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: new Date('2026-09-11'), maxGrade: 20, weight: 1,
                classroomId: d.A.id, subjectId: d.mate.id, periodId: d.period.id, lapso: '1', createdBy: u.profeA.id, instituteId: 'institute',
            } as any,
        });
        d.nota = await prisma.grade.create({
            data: { score: 17, studentId: u.alumnaA.id, activityId: d.actividad.id, periodId: d.period.id, subjectId: d.mate.id, teacherId: u.profeA.id },
        });
        d.asistencia = await prisma.dailyAttendance.create({
            data: { date: new Date(`${HOY}T00:00:00.000Z`), status: 'PRESENT', studentId: u.alumnaA.id, classroomId: d.A.id, teacherId: u.profeA.id } as any,
        });
        d.asistenciaVieja = await prisma.dailyAttendance.create({
            data: { date: new Date('2026-09-15T00:00:00.000Z'), status: 'ABSENT', studentId: u.alumnaA.id, classroomId: d.A.id, teacherId: u.profeA.id } as any,
        });
        d.observacion = await prisma.observation.create({
            data: { title: 'Observación privada de A', description: 'solo del lado A', studentId: u.alumnaA.id, createdById: u.profeA.id, classroomId: d.A.id, subjectId: d.mate.id } as any,
        });
        d.aviso = await prisma.notification.create({
            data: { title: 'Aviso para alumnaA', message: 'mensaje privado', type: 'INFO', priority: 'LOW', recipientId: u.alumnaA.id, instituteId: 'institute' } as any,
        });
        d.horario = await prisma.schedule.create({
            data: { dayOfWeek: 'MONDAY', startTime: '07:00', endTime: '07:45', classroomId: d.A.id, subjectId: d.mate.id, teacherId: u.profeA.id, instituteId: 'institute' } as any,
        });
    }, 180000);

    afterAll(async () => {
        if (process.env.ESCRIBIR_MATRIZ === '1') escribirLaTabla();
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    function escribirLaTabla() {
        const filas: string[] = [];
        filas.push('# Matriz de permisos medida (ruta × quien llama)');
        filas.push('');
        filas.push('Generada por `tests/integration/quien-puede-que.test.ts` con `ESCRIBIR_MATRIZ=1`.');
        filas.push('Cada celda: código HTTP obtenido. ✅ = lo esperado; ❌ = no lo esperado; · = no se exige (duda).');
        filas.push('Esperado: **S** = debe poder (2xx/404 de negocio), **N** = no debe (401/403/404).');
        filas.push('');
        filas.push(`| Qué | ${TODOS.join(' | ')} |`);
        filas.push(`|---|${TODOS.map(() => '---').join('|')}|`);
        const porCaso = new Map<Caso, typeof resultados>();
        for (const r of resultados) {
            if (!porCaso.has(r.caso)) porCaso.set(r.caso, []);
            porCaso.get(r.caso)!.push(r);
        }
        for (const [caso, rs] of porCaso) {
            const celdas = TODOS.map((q) => {
                const r = rs.find((x) => x.quien === q);
                if (!r) return '';
                const marca = r.esperado === '·' ? '·' : r.ok ? '✅' : '❌';
                return `${r.esperado} ${r.status} ${marca}`;
            });
            filas.push(`| ${caso.que} | ${celdas.join(' | ')} |`);
        }
        const destino = path.resolve(__dirname, '../../../../docs/nube/matriz-de-permisos.md');
        fs.writeFileSync(destino, filas.join('\n') + '\n');
    }

    const A = () => d.A.id;
    const alumnaA = () => u.alumnaA.id;

    const CASOS: Caso[] = [
        // ─── LEER ────────────────────────────────────────────────────────────
        { que: 'GET nota de alumnaA', metodo: 'get', url: () => `/api/grades/${d.nota.id}`, si: ['admin', 'profeA', 'alumnaA', 'repA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET notas por alumno', metodo: 'get', url: () => `/api/grades/student/${alumnaA()}`, si: ['admin', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET notas de una actividad de A', metodo: 'get', url: () => `/api/grades/activity/${d.actividad.id}`, si: ['admin', 'profeA'], no: [...AJENOS, ...LADO_B, ...NO_PERSONAL] },
        { que: 'GET notas de la materia (lista)', metodo: 'get', url: () => `/api/grades/subject/${d.mate.id}`, si: ['admin', 'profeA'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [d.nota.id], sinFugaPara: ['profeB'] },
        { que: 'GET lista de notas', metodo: 'get', url: () => `/api/grades`, si: ['admin', 'profeA'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [d.nota.id], sinFugaPara: ['profeB'] },
        { que: 'GET estadísticas de notas', metodo: 'get', url: () => `/api/grades/stats?classroomId=${A()}`, si: ['admin'], no: [...AJENOS, ...NO_PERSONAL] },
        { que: 'GET asistencia de alumnaA', metodo: 'get', url: () => `/api/attendance/student/${alumnaA()}`, si: ['admin', 'profeA', 'guiaA', 'alumnaA', 'repA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET un registro de asistencia', metodo: 'get', url: () => `/api/attendance/${d.asistencia.id}`, si: ['admin', 'profeA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET asistencia de la sección A', metodo: 'get', url: () => `/api/attendance/classroom/${A()}`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'GET asistencia de A en un día', metodo: 'get', url: () => `/api/attendance/classroom/${A()}/date/${HOY}`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'GET resumen de asistencia de A', metodo: 'get', url: () => `/api/attendance/summary/classroom/${A()}`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'GET observaciones de alumnaA', metodo: 'get', url: () => `/api/observations/student/${alumnaA()}`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET observaciones de la sección A', metodo: 'get', url: () => `/api/observations/classroom/${A()}`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'GET una actividad de A', metodo: 'get', url: () => `/api/activities/${d.actividad.id}`, si: ['admin', 'profeA', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET actividades de la sección A', metodo: 'get', url: () => `/api/activities/classroom/${A()}`, si: ['admin', 'profeA', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET actividades de la materia', metodo: 'get', url: () => `/api/activities/subject/${d.mate.id}`, si: ['admin'], no: [...AJENOS], noDebeContener: () => [d.actividad.id], sinFugaPara: LADO_B },
        { que: 'GET lista de actividades', metodo: 'get', url: () => `/api/activities`, si: ['admin'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [d.actividad.id], sinFugaPara: ['profeB'] },
        { que: 'GET sección A', metodo: 'get', url: () => `/api/classrooms/${A()}`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, 'alumnoB', 'repB'] },
        { que: 'GET estadísticas (promedios) de A', metodo: 'get', url: () => `/api/classrooms/${A()}/stats`, si: ['admin', 'guiaA'], no: [...AJENOS, ...NO_PERSONAL, 'profeB'] },
        { que: 'GET estadística de la sección A', metodo: 'get', url: () => `/api/statistics/section/${A()}`, si: ['admin', 'guiaA'], no: [...AJENOS, ...NO_PERSONAL, 'profeB'] },
        { que: 'GET estadística de la materia en A', metodo: 'get', url: () => `/api/statistics/subject/${A()}/${d.mate.id}`, si: ['admin', 'profeA'], no: [...AJENOS, ...NO_PERSONAL, 'profeB'] },
        { que: 'GET materias de la sección A', metodo: 'get', url: () => `/api/classrooms/${A()}/subjects`, si: ['admin', 'profeA', 'guiaA'], no: [...AJENOS, ...NO_PERSONAL] },
        { que: 'GET alumnos de la materia', metodo: 'get', url: () => `/api/subjects/${d.mate.id}/students`, si: ['admin'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [alumnaA()], sinFugaPara: ['profeB'] },
        { que: 'GET lista de alumnos', metodo: 'get', url: () => `/api/students`, si: ['admin', 'profeA'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [alumnaA()], sinFugaPara: ['profeB'] },
        { que: 'GET ficha de alumnaA', metodo: 'get', url: () => `/api/students/${alumnaA()}`, si: ['admin', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET panel de alumnaA', metodo: 'get', url: () => `/api/students/${alumnaA()}/dashboard`, si: ['admin', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET actividades de alumnaA', metodo: 'get', url: () => `/api/students/${alumnaA()}/actividades`, si: ['admin', 'alumnaA', 'repA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET historial de alumnaA', metodo: 'get', url: () => `/api/students/${alumnaA()}/complete-history`, si: ['admin', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET usuario alumnaA', metodo: 'get', url: () => `/api/users/${alumnaA()}`, si: ['admin', 'alumnaA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET foto de alumnaA', metodo: 'get', url: () => `/api/users/${alumnaA()}/photo`, si: [], no: [...AJENOS, ...LADO_B] },
        { que: 'GET representantes de alumnaA', metodo: 'get', url: () => `/api/users/${alumnaA()}/tutors`, si: ['admin'], no: [...AJENOS, ...LADO_B, 'profeA', 'alumnaA'] },
        { que: 'GET boletín de alumnaA', metodo: 'get', url: () => `/api/reports/student/${alumnaA()}`, si: ['admin', 'alumnaA', 'repA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET aviso de alumnaA', metodo: 'get', url: () => `/api/notifications/${d.aviso.id}`, si: ['alumnaA'], no: [...AJENOS, ...LADO_B, 'profeA', 'guiaA', 'repA'] },
        { que: 'GET avisos de alumnaA', metodo: 'get', url: () => `/api/notifications/user/${alumnaA()}`, si: ['admin'], no: [...AJENOS, ...LADO_B, 'profeA', 'guiaA', 'repA', 'alumnoB'] },
        { que: 'GET todos los avisos', metodo: 'get', url: () => `/api/notifications`, si: ['admin'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [d.aviso.id], sinFugaPara: ['profeA', 'profeB', 'guiaA'] },
        { que: 'GET horario de la sección A', metodo: 'get', url: () => `/api/schedules/classroom/${A()}`, si: ['admin', 'profeA', 'guiaA', 'alumnaA', 'repA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET un horario de A', metodo: 'get', url: () => `/api/schedules/${d.horario.id}`, si: ['admin', 'profeA'], no: [...AJENOS, 'alumnoB', 'repB'] },
        { que: 'GET horario de profeA', metodo: 'get', url: () => `/api/schedules/teacher/${u.profeA.id}`, si: ['admin', 'profeA'], no: [...AJENOS, ...NO_PERSONAL] },
        { que: 'GET clase en vivo de A', metodo: 'get', url: () => `/api/sessions/live-overview?classroomId=${A()}&date=${HOY}`, si: ['admin', 'profeA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET plan de evaluación de A', metodo: 'get', url: () => `/api/evaluation-plan/rows?classroomId=${A()}&subjectId=${d.mate.id}&lapso=1`, si: ['admin', 'profeA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET cabecera del plan de A', metodo: 'get', url: () => `/api/evaluation-plan/metadata?classroomId=${A()}&subjectId=${d.mate.id}&lapso=1`, si: ['admin', 'profeA'], no: [...AJENOS, ...LADO_B] },
        { que: 'GET buscar alumnos', metodo: 'get', url: () => `/api/sessions/search-students?q=Test&classroomId=${A()}`, si: ['admin'], no: [...AJENOS, ...NO_PERSONAL], noDebeContener: () => [alumnaA()], sinFugaPara: ['profeB'] },
        { que: 'GET panel del representante', metodo: 'get', url: () => `/api/dashboard/tutor`, si: ['repA', 'repB'], no: [...AJENOS], noDebeContener: () => [alumnaA()], sinFugaPara: ['repB'] },
        { que: 'GET usuarios (lista)', metodo: 'get', url: () => `/api/users`, si: ['admin'], no: [...AJENOS, 'profeA', 'profeB', 'guiaA', ...NO_PERSONAL] },

        // ─── ESCRIBIR ────────────────────────────────────────────────────────
        { que: 'POST nota a alumnaA', metodo: 'post', url: () => `/api/grades`, cuerpo: () => ({ score: 15, studentId: alumnaA(), activityId: d.actividad2.id, periodId: d.period.id, subjectId: d.mate.id }), si: ['profeA'], no: [...AJENOS, ...LADO_B, 'guiaA', 'alumnaA', 'repA'] },
        { que: 'PUT nota de alumnaA', metodo: 'put', url: () => `/api/grades/${d.nota.id}`, cuerpo: () => ({ score: 18 }), si: ['profeA', 'admin'], no: [...AJENOS, ...LADO_B, 'guiaA', 'alumnaA', 'repA'] },
        { que: 'POST notas en bloque', metodo: 'post', url: () => `/api/grades/bulk`, cuerpo: () => ({ grades: [{ score: 11, studentId: alumnaA(), activityId: d.actividad2.id, periodId: d.period.id, subjectId: d.mate.id }] }), si: [], no: [...AJENOS, ...LADO_B, 'guiaA', 'alumnaA', 'repA'] },
        { que: 'POST asistencia a alumnaA', metodo: 'post', url: () => `/api/attendance`, cuerpo: () => ({ studentId: alumnaA(), classroomId: A(), date: HOY, status: 'LATE' }), si: ['profeA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'PUT registro de asistencia', metodo: 'put', url: () => `/api/attendance/${d.asistencia.id}`, cuerpo: () => ({ status: 'ABSENT' }), si: ['profeA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST asistencia en bloque', metodo: 'post', url: () => `/api/attendance/bulk`, cuerpo: () => ({ classroomId: A(), subjectId: d.mate.id, date: HOY, attendances: [{ studentId: alumnaA(), status: 'ABSENT' }] }), si: [], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST observación a alumnaA', metodo: 'post', url: () => `/api/observations`, cuerpo: () => ({ title: 'x', description: 'y', studentIds: [alumnaA()], classroomId: A(), subjectId: d.mate.id }), si: ['profeA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST observación a alumnoB en la sección A', metodo: 'post', url: () => `/api/observations`, cuerpo: () => ({ title: 'x', description: 'y', studentIds: [u.alumnoB.id], classroomId: A(), subjectId: d.mate.id }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'PUT actividad de A', metodo: 'put', url: () => `/api/activities/${d.actividad2.id}`, cuerpo: () => ({ title: 'Taller A (editado)' }), si: ['profeA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST actividad en A', metodo: 'post', url: () => `/api/activities`, cuerpo: () => ({ title: 'Nueva', description: 'Actividad nueva', type: 'TAREA', scope: 'CLASSROOM', startDate: '2026-09-20T12:00:00.000Z', dueDate: '2026-09-27T12:00:00.000Z', maxGrade: 20, maxScore: 20, weight: 1, classroomId: A(), subjectId: d.mate.id, periodId: d.period.id, lapso: '1' }), si: ['profeA'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST inscribir un alumno en A', metodo: 'post', url: () => `/api/classrooms/${A()}/students`, cuerpo: () => ({ studentId: u.alumnoNuevo.id }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'POST asignarse una materia en A', metodo: 'post', url: () => `/api/classrooms/${A()}/subjects`, cuerpo: () => ({ subjectId: d.otraMateria.id, teacherId: u.profeSuelto.id, weeklyBlocks: 2 }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'PUT horario de A', metodo: 'put', url: () => `/api/schedules/${d.horario.id}`, cuerpo: () => ({ room: 'Aula 9' }), si: [], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'PUT datos de alumnaA', metodo: 'put', url: () => `/api/users/${alumnaA()}`, cuerpo: () => ({ firstName: 'Cambiado' }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'PUT su propio perfil (alumno)', metodo: 'put', url: () => `/api/students/profile/me`, cuerpo: () => ({ phone: '0414-0000000' }), si: [], no: [...AJENOS, 'alumnaA', 'alumnoB'] },
        { que: 'PUT su propio perfil (profesor)', metodo: 'put', url: () => `/api/teachers/profile/me`, cuerpo: () => ({ firstName: 'Otro' }), si: [], no: [...AJENOS, 'profeA', 'profeB', 'guiaA'] },
        { que: 'PUT su propio perfil (usuario)', metodo: 'put', url: () => `/api/users/profile/me`, cuerpo: () => ({ firstName: 'Otro' }), si: [], no: [...AJENOS, 'profeA', 'profeB', 'guiaA', ...NO_PERSONAL] },
        { que: 'PATCH marcar leído el aviso de alumnaA', metodo: 'patch', url: () => `/api/notifications/${d.aviso.id}/read`, si: [], no: [...AJENOS, ...LADO_B, 'profeA', 'guiaA', 'repA'] },
        { que: 'POST aviso a alumnaA', metodo: 'post', url: () => `/api/notifications`, cuerpo: () => ({ title: 'Aviso', message: 'Entra a este enlace', type: 'INFO', priority: 'LOW', recipientId: alumnaA() }), si: ['profeA', 'admin'], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST aviso a otro profesor', metodo: 'post', url: () => `/api/notifications`, cuerpo: () => ({ title: 'Aviso', message: 'Mensaje para un colega', type: 'INFO', priority: 'LOW', recipientId: u.profeB.id }), si: ['admin'], no: [...AJENOS, 'profeA', 'guiaA', ...NO_PERSONAL] },
        { que: 'POST abrir clase en A', metodo: 'post', url: () => `/api/sessions`, cuerpo: () => ({ classroomId: A(), subjectId: d.mate.id, date: HOY }), si: [], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'POST asistencia a alumnoB en la sección A', metodo: 'post', url: () => `/api/attendance`, cuerpo: () => ({ studentId: u.alumnoB.id, classroomId: A(), date: HOY, status: 'PRESENT' }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'POST asistencia en bloque con alumnoB en A', metodo: 'post', url: () => `/api/attendance/bulk`, cuerpo: () => ({ classroomId: A(), subjectId: d.mate.id, date: HOY, attendances: [{ studentId: u.alumnoB.id, status: 'ABSENT' }] }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'DELETE registro de asistencia', metodo: 'delete', url: () => `/api/attendance/${d.asistenciaVieja.id}`, si: [], no: [...AJENOS, ...LADO_B, 'alumnaA', 'repA'] },
        { que: 'DELETE sacar a alumnaA de A', metodo: 'delete', url: () => `/api/classrooms/${A()}/students/${alumnaA()}`, cuerpo: () => ({ password: CLAVE }), si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
        { que: 'POST subir foto de alumnaA', metodo: 'put', url: () => `/api/users/${alumnaA()}/photo`, si: [], no: [...AJENOS, 'profeA', 'guiaA', 'profeB', ...NO_PERSONAL] },
    ];

    /**
     * HUECOS MEDIDOS Y TODAVÍA ABIERTOS. Cada uno se prueba al revés
     * (`it.failing`): la prueba pasa MIENTRAS el hueco siga ahí y se pone en
     * rojo el día que alguien lo cierre sin quitarlo de esta lista. Al
     * arreglarlo, se quita de aquí en el mismo commit.
     */
    const HUECOS_ABIERTOS = new Set<string>([
        'GET cabecera del plan de A',
        'GET buscar alumnos',
        'POST abrir clase en A',
    ]);

    for (const caso of CASOS) {
        const prueba = HUECOS_ABIERTOS.has(caso.que) ? it.failing : it;
        prueba(`${caso.metodo.toUpperCase()} ${caso.que}`, async () => {
            const fallos: string[] = [];
            // Primero quienes NO deben poder, y el administrador el último: si
            // alguien con permiso borrara antes, los demás recibirían «no existe»
            // y la prueba no mediría nada.
            const orden = [
                ...TODOS.filter((q) => caso.no.includes(q)),
                ...TODOS.filter((q) => !caso.no.includes(q) && q !== 'admin'),
                'admin' as Quien,
            ];
            for (const quien of orden) {
                const res = await pedir(caso, quien);
                const denegado = [401, 403, 404].includes(res.status);
                let esperado = '·';
                let ok = true;
                if (caso.no.includes(quien)) {
                    esperado = 'N';
                    ok = denegado;
                } else if (caso.si.includes(quien)) {
                    esperado = 'S';
                    ok = res.status < 400 || res.status === 404 || res.status === 409 || res.status === 422;
                    // Un 400 de validación a quien SÍ puede no es un fallo de permisos.
                    if (res.status === 400) ok = true;
                }
                if (res.status >= 500) ok = false;
                if (ok && res.status < 300 && caso.noDebeContener && caso.sinFugaPara?.includes(quien)) {
                    const texto = JSON.stringify(res.body ?? res.text);
                    const fuga = caso.noDebeContener().find((x) => texto.includes(x));
                    if (fuga) {
                        ok = false;
                        esperado = 'sin fuga';
                    }
                }
                if (process.env.DEPURAR) console.log("DEPURAR", caso.que, quien, res.status, JSON.stringify(res.body).slice(0, 200));
                resultados.push({ caso, quien, status: res.status, ok, esperado });
                if (!ok) fallos.push(`${quien} → ${res.status} (esperado ${esperado})`);
            }
            expect(fallos).toEqual([]);
        }, 60000);
    }
});
