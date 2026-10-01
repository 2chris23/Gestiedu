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
 * NADA DE MÁS EN EL JSON
 *
 * Con las herramientas del navegador abiertas se ve TODA la respuesta, no lo
 * que la pantalla pinta. Una consulta con `include: { student: true }` manda la
 * fila entera del usuario —con el resumen de su contraseña— aunque la pantalla
 * solo enseñe el nombre.
 *
 * Esta prueba le pregunta al servidor qué rutas GET tiene, las llama TODAS con
 * cada rol (administrador, profesor, alumna y representante), con ids de
 * verdad en la dirección, y busca en cada respuesta lo que no debe salir nunca:
 *
 *   · un resumen de contraseña (bcrypt: `$2a$…`, `$2b$…`);
 *   · campos que guardan secretos: `password`, `tokenHash`, `secreto`,
 *     `aparatoHash`, `databasePassword`, `refreshTokens`.
 *
 * Qué NO mide: si lo que sale es de quien lo pide (eso es `quien-puede-que`),
 * ni las rutas que no son GET.
 */

const SLUG = 'test-institute';
const HOY = todayInTimezone('America/Caracas');
const gId = () => `c${createId()}`;

const CAMPOS_SECRETOS = new Set(['password', 'passwordHash', 'tokenHash', 'secreto', 'aparatoHash', 'databasePassword', 'refreshTokens']);
const RESUMEN_BCRYPT = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/;

/** Rutas que no devuelven JSON del liceo o que se quedan abiertas (tiempo real). */
const NO_SE_BARREN = [/^\/socket\.io/, /\/events?$/, /\/stream/, /^\/docs/, /^\/uploads/, /^\/public/];

function rutasGetDe(server: FastifyInstance): string[] {
    // Mismo recorrido del árbol que `ninguna-puerta-abierta.test.ts`.
    const crudo = server.printRoutes({ commonPrefix: false });
    const rutas = new Set<string>();
    const trozoPorNivel: string[] = [];
    for (const lineaCruda of crudo.split('\n')) {
        if (!lineaCruda.trim()) continue;
        const dibujo = lineaCruda.match(/^[\s│├└─]*/)?.[0] ?? '';
        const nivel = Math.floor(dibujo.length / 4);
        const texto = lineaCruda.slice(dibujo.length);
        if (!texto) continue;
        const conMetodos = texto.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        const trozo = (conMetodos ? conMetodos[1] : texto).trim();
        trozoPorNivel[nivel] = trozo;
        trozoPorNivel.length = nivel + 1;
        if (!conMetodos) continue;
        const ruta = trozoPorNivel.join('').replace(/\/{2,}/g, '/');
        if (!ruta.startsWith('/api')) continue;
        if (conMetodos[2].split(',').map((x) => x.trim()).includes('GET')) rutas.add(ruta);
    }
    return [...rutas].filter((r) => !NO_SE_BARREN.some((p) => p.test(r)));
}

/** Busca secretos en un JSON cualquiera; devuelve dónde están. */
function secretosEn(valor: unknown, camino = '$'): string[] {
    const hallados: string[] = [];
    if (typeof valor === 'string') {
        if (RESUMEN_BCRYPT.test(valor)) hallados.push(`${camino} (resumen de contraseña)`);
    } else if (Array.isArray(valor)) {
        valor.forEach((v, i) => hallados.push(...secretosEn(v, `${camino}[${i}]`)));
    } else if (valor && typeof valor === 'object') {
        for (const [k, v] of Object.entries(valor)) {
            if (CAMPOS_SECRETOS.has(k) && v !== undefined && v !== null) hallados.push(`${camino}.${k}`);
            hallados.push(...secretosEn(v, `${camino}.${k}`));
        }
    }
    return hallados;
}

describe('Nada de más en el JSON (lo que se ve con las herramientas del navegador)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const u: Record<string, any> = {};
    const d: Record<string, any> = {};
    const rol: Record<string, UserRole> = {};
    /**
     * Una llave nueva en cada llamada: el tope de peticiones cuenta por llave
     * (100 por minuto) y con la misma se cortaba a partir de la 101 — lo mismo
     * que cuenta `ninguna-puerta-abierta.test.ts`. Cada llave lleva su serie.
     */
    const llave = (quien: string) => generateTestToken(u[quien].id, rol[quien], 'institute');

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        u.admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        u.profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        u.alumna = (await createTestUser(prisma, UserRole.STUDENT)).user;
        u.rep = (await createTestUser(prisma, UserRole.TUTOR)).user;
        Object.assign(rol, { admin: UserRole.ADMIN, profe: UserRole.TEACHER, alumna: UserRole.STUDENT, rep: UserRole.TUTOR });

        d.year = await createTestAcademicYear(prisma, 'institute');
        await prisma.academicYear.update({ where: { id: d.year.id }, data: { isActive: true } as any }).catch(() => undefined);
        d.period = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', academicYearId: d.year.id, startDate: new Date('2026-09-01'), endDate: new Date('2026-12-15'), isActive: true },
        });
        // El profesor es a la vez el guía: así las rutas de guía también le responden con datos.
        d.A = await prisma.classroom.create({
            data: {
                id: gId(), name: '1er Año A', slug: `json-a-${Date.now()}`, grade: 1, section: 'A', capacity: 30,
                academicYearId: d.year.id, instituteId: 'institute', teacherId: u.profe.id,
            } as any,
        });
        d.mate = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({ data: { classroomId: d.A.id, subjectId: d.mate.id, teacherId: u.profe.id, weeklyBlocks: 4 } });
        await prisma.studentClassroom.create({ data: { studentId: u.alumna.id, classroomId: d.A.id, academicYearId: d.year.id, isActive: true } });
        await prisma.studentTutor.create({ data: { studentId: u.alumna.id, tutorId: u.rep.id, relationship: 'MADRE' } as any });
        d.actividad = await prisma.activity.create({
            data: {
                title: 'Prueba', type: 'SUMATIVA', scope: 'CLASSROOM', startDate: new Date('2026-09-10'), maxGrade: 20, weight: 1,
                classroomId: d.A.id, subjectId: d.mate.id, periodId: d.period.id, lapso: '1', createdBy: u.profe.id, instituteId: 'institute',
            } as any,
        });
        d.nota = await prisma.grade.create({
            data: { score: 17, studentId: u.alumna.id, activityId: d.actividad.id, periodId: d.period.id, subjectId: d.mate.id, teacherId: u.profe.id },
        });
        d.asistencia = await prisma.dailyAttendance.create({
            data: { date: new Date(`${HOY}T00:00:00.000Z`), status: 'PRESENT', studentId: u.alumna.id, classroomId: d.A.id, teacherId: u.profe.id } as any,
        });
        d.observacion = await prisma.observation.create({
            data: { title: 'Obs', description: 'x', studentId: u.alumna.id, createdById: u.profe.id, classroomId: d.A.id, subjectId: d.mate.id } as any,
        });
        d.aviso = await prisma.notification.create({
            data: { title: 'Aviso', message: 'm', type: 'INFO', priority: 'LOW', recipientId: u.alumna.id, instituteId: 'institute' } as any,
        });
        d.horario = await prisma.schedule.create({
            data: { dayOfWeek: 'MONDAY', startTime: '07:00', endTime: '07:45', classroomId: d.A.id, subjectId: d.mate.id, teacherId: u.profe.id, instituteId: 'institute' } as any,
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 60000);

    /** El id de verdad que toca en cada hueco de la dirección. */
    function rellenar(ruta: string): string {
        const porRecurso: Record<string, () => string> = {
            users: () => u.alumna.id, students: () => u.alumna.id, teachers: () => u.profe.id, tutors: () => u.rep.id,
            classrooms: () => d.A.id, subjects: () => d.mate.id, grades: () => d.nota.id, activities: () => d.actividad.id,
            attendance: () => d.asistencia.id, observations: () => d.observacion.id, notifications: () => d.aviso.id,
            schedules: () => d.horario.id, 'academic-years': () => d.year.id, periods: () => d.period.id,
        };
        const recurso = ruta.split('/')[2];
        const porNombre: Record<string, () => string> = {
            studentId: () => u.alumna.id, userId: () => u.alumna.id, teacherId: () => u.profe.id, tutorId: () => u.rep.id,
            classroomId: () => d.A.id, subjectId: () => d.mate.id, activityId: () => d.actividad.id, periodId: () => d.period.id,
            academicYearId: () => d.year.id, yearId: () => d.year.id, date: () => HOY, fecha: () => HOY, slug: () => d.A.slug,
            lapso: () => '1', grade: () => '1',
        };
        return ruta.replace(/:([A-Za-z0-9_]+)/g, (_, nombre: string) =>
            (porNombre[nombre] ?? porRecurso[recurso] ?? (() => u.alumna.id))()
        );
    }

    const CONSULTA = () =>
        `classroomId=${d.A.id}&subjectId=${d.mate.id}&studentId=${u.alumna.id}&lapso=1&date=${HOY}&periodId=${d.period.id}&academicYearId=${d.year.id}`;

    it.each(['admin', 'profe', 'alumna', 'rep'])('JSON-01 (%s): ninguna respuesta GET lleva contraseñas ni llaves', async (quien) => {
        const rutas = rutasGetDe(server);
        expect(rutas.length).toBeGreaterThan(100);

        const fugas: string[] = [];
        const cortadas: string[] = [];
        let conDatos = 0;
        for (const ruta of rutas) {
            const url = `${rellenar(ruta)}?${CONSULTA()}`;
            let res: request.Response;
            try {
                res = await request(server.server).get(url).set('X-Institute-Slug', SLUG).set('Authorization', `Bearer ${llave(quien)}`).timeout(15000);
            } catch {
                continue; // se quedó abierta (flujo): no es JSON
            }
            if (res.status === 429) cortadas.push(ruta);
            if (res.status >= 300) continue;
            conDatos += 1;
            let cuerpo: unknown = res.body;
            if (!cuerpo || (typeof cuerpo === 'object' && Object.keys(cuerpo as object).length === 0)) cuerpo = res.text;
            const hallados = typeof cuerpo === 'string'
                ? (RESUMEN_BCRYPT.test(cuerpo) ? ['(texto) resumen de contraseña'] : [])
                : secretosEn(cuerpo);
            if (hallados.length) fugas.push(`GET ${ruta} → ${hallados.slice(0, 3).join(', ')}`);
        }

        // Una ruta que no se llegó a mirar no es una ruta limpia.
        expect(cortadas).toEqual([]);
        // Que de verdad se miraron respuestas con datos, no solo rechazos.
        expect(conDatos).toBeGreaterThan(quien === 'admin' ? 60 : 15);
        expect(fugas).toEqual([]);
    }, 300000);
});
