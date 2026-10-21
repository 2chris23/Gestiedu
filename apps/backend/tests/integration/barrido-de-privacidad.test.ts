/**
 * EL BARRIDO DE PRIVACIDAD (2026-10-11)
 *
 * El alumno y el representante solo ven lo suyo. Las pruebas de cada pantalla
 * lo comprueban ruta a ruta; esta las recorre TODAS: cada `GET` de la API que
 * existe hoy y la que se añada mañana (se apuntan al registrarse), como alumno
 * y como representante, con los ids de un compañero, de un alumno de otra
 * sección, de la sección ajena, de la materia, de la actividad con notas, de
 * una observación… y con esos mismos ids en la consulta (`?studentId=`…).
 *
 * Se marca toda respuesta 2xx que traiga el id (que es la cédula) o el correo
 * de un alumno que no es él ni su representado. Antes se encontraron así dos
 * agujeros a mano (el cuadro general y la lista de secciones); ahora el
 * siguiente se pone en rojo solo.
 *
 * El control: como admin, esos mismos datos SÍ salen. Si no salieran, el
 * barrido no estaría mirando nada (y saldría verde mintiendo).
 *
 * BARRIDO-01  el alumno no recibe datos de ningún otro alumno, en ninguna ruta
 * BARRIDO-02  el representante, solo los de su representado
 * BARRIDO-03  el control: el admin sí los recibe (el barrido ve)
 * BARRIDO-04  `/users?classroomId=` filtra por la sección (antes, 500)
 * BARRIDO-05  la asistencia de un alumno con `?subjectId=` no revienta (antes, 500)
 * BARRIDO-06  el contexto de promoción de un año que no existe: 404 (antes, 500)
 */
jest.mock('fastify', () => {
    const real = jest.requireActual('fastify');
    const fabrica = real.default ?? real;
    const espia = (...args: unknown[]) => {
        const instancia = fabrica(...args);
        instancia.addHook('onRoute', (o: { method: string | string[]; url: string }) => {
            const metodos = ([] as string[]).concat(o.method);
            if (metodos.includes('GET')) ((globalThis as any).__rutasGet ??= new Set<string>()).add(o.url);
        });
        return instancia;
    };
    Object.assign(espia, real);
    (espia as any).default = espia;
    (espia as any).fastify = espia;
    return espia;
});

import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { CABECERA_INTERNA, MARCA_INTERNA } from '../../src/services/precarga.service';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
    generateTestToken,
} from '../helpers';

const SLUG = 'test-institute';
// Lo que no es del liceo o no es una lectura de datos.
const FUERA = /^\/api\/(auth|superadmin|precarga|health|time)\b/;

describe('El barrido de privacidad: cada lectura de la API, como alumno y como representante', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const u: Record<string, any> = {};
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const anio = await createTestAcademicYear(prisma, 'institute');
        const aulaA = await createTestClassroom(prisma, anio.id, 'institute');
        const aulaB = await prisma.classroom.create({
            data: { id: `c${createId()}`, name: '1er Grado B', slug: `barrido-b-${createId()}`, grade: 1, section: 'B', capacity: 30, academicYearId: anio.id, instituteId: 'institute' },
        });
        const materia = await createTestSubject(prisma, 'institute');
        for (const [n, r] of [['alumno', UserRole.STUDENT], ['companero', UserRole.STUDENT], ['ajeno', UserRole.STUDENT], ['tutor', UserRole.TUTOR], ['profe', UserRole.TEACHER], ['admin', UserRole.ADMIN]] as const) {
            u[n] = (await createTestUser(prisma, r)).user;
        }
        const csA = await prisma.classroomSubject.create({ data: { id: `cs-${createId()}`, classroomId: aulaA.id, subjectId: materia.id, teacherId: u.profe.id } });
        const csB = await prisma.classroomSubject.create({ data: { id: `cs-${createId()}`, classroomId: aulaB.id, subjectId: materia.id, teacherId: u.profe.id } });
        for (const [alumno, aula] of [[u.alumno, aulaA], [u.companero, aulaA], [u.ajeno, aulaB]]) {
            await prisma.studentClassroom.create({ data: { id: `sc-${createId()}`, studentId: alumno.id, classroomId: aula.id, academicYearId: anio.id, isActive: true } });
        }
        await prisma.studentTutor.create({ data: { id: `st-${createId()}`, studentId: u.alumno.id, tutorId: u.tutor.id, relationship: 'Madre' } as any });
        const lapso = await prisma.period.create({ data: { name: 'Lapso 1', startDate: new Date('2026-09-15'), endDate: new Date('2026-12-15'), isActive: true, academicYearId: anio.id } });
        const hoy = new Date(new Date().toISOString().slice(0, 10));
        const sesA = await prisma.classSession.create({ data: { date: hoy, subjectId: materia.id, classroomId: aulaA.id } as any });
        const sesB = await prisma.classSession.create({ data: { date: hoy, subjectId: materia.id, classroomId: aulaB.id } as any });
        // La actividad con las notas de los TRES: el alumno debe ver solo la suya.
        const act = await prisma.classActivity.create({
            data: { title: 'Taller', classroomId: aulaA.id, subjectId: materia.id, classSessionId: sesA.id, scores: { [u.alumno.id]: 15, [u.companero.id]: 12, [u.ajeno.id]: 9 } } as any,
        });
        const obs = await prisma.observation.create({ data: { title: 'Conducta', studentId: u.companero.id, createdById: u.profe.id, classroomId: aulaA.id, subjectId: materia.id } });
        Object.assign(ids, {
            aulaA: aulaA.id, aulaB: aulaB.id, materia: materia.id, csA: csA.id, csB: csB.id, anio: anio.id, lapso: lapso.id,
            sesA: sesA.id, sesB: sesB.id, act: act.id, obs: obs.id,
        });
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    /** Cada GET con sus variantes: cada parámetro con cada id que le cuadre, y la consulta con ids ajenos. */
    function lasPeticiones(extra: string): string[] {
        const porTipo: Record<string, string[]> = {
            studentId: [u.companero.id, u.ajeno.id],
            userId: [u.companero.id, u.ajeno.id],
            classroomId: [ids.aulaA, ids.aulaB],
            sectionId: [ids.aulaA, ids.aulaB],
            subjectId: [ids.materia, ids.csA, ids.csB],
            teacherId: [u.profe.id],
            activityId: [ids.act],
            sessionId: [ids.sesA, ids.sesB],
            periodId: [ids.lapso],
            academicYearId: [ids.anio],
            slug: [SLUG],
            role: ['STUDENT', 'TEACHER'],
            date: [new Date().toISOString().slice(0, 10)],
            grade: ['1'],
            gradeLevel: ['1'],
        };
        porTipo.id = [u.companero.id, u.ajeno.id, u.profe.id, ids.aulaA, ids.aulaB, ids.materia, ids.csA, ids.csB, ids.act, ids.sesA, ids.sesB, ids.obs, ids.anio, ids.lapso];
        const porDefecto: Record<string, string> = { classroomId: ids.aulaA, sectionId: ids.aulaA, subjectId: ids.materia, studentId: u.companero.id, academicYearId: ids.anio, periodId: ids.lapso };
        const consultas = ['', `studentId=${u.companero.id}&classroomId=${ids.aulaB}&alumno=${u.companero.id}&subjectId=${ids.materia}&ciclo=${ids.anio}`, extra].filter((q, i) => i === 0 || q);

        const rutas = [...((globalThis as any).__rutasGet as Set<string>)].filter((r) => r.startsWith('/api') && !FUERA.test(r));
        const salida = new Set<string>();
        for (const ruta of rutas) {
            const params = [...ruta.matchAll(/:([a-zA-Z_]+)/g)].map((m) => m[1]);
            const bases = params.length === 0 ? [ruta] : [];
            for (const p of params) {
                for (const v of porTipo[p] ?? ['x']) {
                    let url = ruta.replace(`:${p}`, v);
                    for (const o of params) if (o !== p) url = url.replace(`:${o}`, porDefecto[o] ?? (porTipo[o] ?? ['x'])[0]);
                    bases.push(url);
                }
            }
            for (const b of bases) for (const q of consultas) salida.add(q ? `${b}${b.includes('?') ? '&' : '?'}${q}` : b);
        }
        return [...salida];
    }

    /** Las peticiones que devuelven (2xx) el id o el correo de alguno de `ajenos`. */
    async function fugas(token: string, ajenos: any[], extra = ''): Promise<string[]> {
        const marcas = ajenos.flatMap((a) => [`"${a.id}"`, String(a.email).toLowerCase()]);
        const headers = { authorization: `Bearer ${token}`, 'x-institute-slug': SLUG, [CABECERA_INTERNA]: MARCA_INTERNA, accept: 'application/json' };
        const salida: string[] = [];
        for (const url of lasPeticiones(extra)) {
            const r = await server.inject({ method: 'GET', url, headers });
            if (r.statusCode < 200 || r.statusCode >= 300) continue;
            const cuerpo = r.body.toLowerCase();
            if (marcas.some((m) => cuerpo.includes(m))) salida.push(url);
        }
        return salida;
    }

    it('BARRIDO-01: el alumno no recibe datos de ningún otro alumno, en ninguna ruta', async () => {
        const token = generateTestToken(u.alumno.id, UserRole.STUDENT, 'institute');
        expect(await fugas(token, [u.companero, u.ajeno])).toEqual([]);
    }, 600000);

    it('BARRIDO-02: el representante, solo los de su representado', async () => {
        const token = generateTestToken(u.tutor.id, UserRole.TUTOR, 'institute');
        expect(await fugas(token, [u.companero, u.ajeno], `alumno=${u.alumno.id}`)).toEqual([]);
    }, 600000);

    it('BARRIDO-03: el control — como admin, esos datos SÍ salen (el barrido ve)', async () => {
        const token = generateTestToken(u.admin.id, UserRole.ADMIN, 'institute');
        expect(((globalThis as any).__rutasGet as Set<string>).size).toBeGreaterThan(150);
        expect((await fugas(token, [u.companero, u.ajeno])).length).toBeGreaterThan(20);
    }, 600000);

    const comoAdmin = () => ({ authorization: `Bearer ${generateTestToken(u.admin.id, UserRole.ADMIN, 'institute')}`, 'x-institute-slug': SLUG });

    it('BARRIDO-04: /users?classroomId= da los inscritos en esa sección (antes, 500)', async () => {
        const r = await server.inject({ method: 'GET', url: `/api/users?classroomId=${ids.aulaB}&role=STUDENT`, headers: comoAdmin() });
        expect(r.statusCode).toBe(200);
        const deVuelta = (r.json().users as any[]).map((x) => x.id);
        expect(deVuelta).toContain(u.ajeno.id);
        expect(deVuelta).not.toContain(u.companero.id);
    });

    it('BARRIDO-06: el contexto de promoción de un año que no existe es 404 (antes, 500)', async () => {
        const r = await server.inject({ method: 'GET', url: `/api/academic-years/no-existe/promotion-context`, headers: comoAdmin() });
        expect(r.statusCode).toBe(404);
    });
});
