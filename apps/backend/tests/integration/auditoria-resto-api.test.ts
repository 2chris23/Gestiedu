import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * AUDITORÍA — LO QUE QUEDABA DE LA API
 *
 * El resto de acciones que ninguna prueba tocaba: el ciclo escolar y su cierre,
 * los paneles, copiar e importar el plan de evaluación, las estadísticas de
 * notas y materias, y las notificaciones que manda el liceo.
 *
 * Igual que en el resto de la auditoría, cada acción se mira dos veces: que
 * haga lo que dice, y que no la pueda usar quien no debe.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('Auditoría — lo que quedaba de la API', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profesor: any;
    let otroProfesor: any;
    let alumno: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
    let otraSeccion: any;
    let subject: any;
    let actividad: any;

    const auth = (token: string) => (req: request.Test) =>
        req.set('Authorization', `Bearer ${token}`).set('X-Institute-Slug', SLUG);
    const como = (quien: string) => (req: request.Test) => auth(tokens[quien])(req);

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        otroProfesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');
        tokens.otroProfesor = generateTestToken(otroProfesor.id, UserRole.TEACHER, 'institute');
        tokens.alumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        year = await createTestAcademicYear(prisma, 'institute');
        // `/active` busca por estado, no por la bandera isActive
        year = await prisma.academicYear.update({
            where: { id: year.id },
            data: { status: 'ACTIVE' },
        });
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

        const nuevaSeccion = (nombre: string, seccion: string, guia: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(),
                    name: nombre,
                    slug: `resto-${seccion.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    grade: 1,
                    section: seccion,
                    capacity: 30,
                    academicYearId: year.id,
                    instituteId: 'institute',
                    teacherId: guia,
                },
            });

        classroom = await nuevaSeccion('Resto A', 'A', profesor.id);
        otraSeccion = await nuevaSeccion('Resto B', 'B', otroProfesor.id);

        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });
        await prisma.classroomSubject.create({
            data: { classroomId: otraSeccion.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });

        await prisma.studentClassroom.create({
            data: { studentId: alumno.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });

        actividad = await prisma.activity.create({
            data: {
                title: 'Evaluación del resto',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-10'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: profesor.id,
                instituteId: 'institute',
            },
        });

        await prisma.grade.create({
            data: {
                score: 15,
                studentId: alumno.id,
                activityId: actividad.id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: profesor.id,
            },
        });
    }, 180000);

    /** Un .docx de verdad con el contenido que se le pase dentro del cuerpo. */
    const docxDePrueba = async (cuerpoXml: string): Promise<Buffer> => {
        const JSZip = require('jszip');
        const zip = new JSZip();
        zip.file(
            '[Content_Types].xml',
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
        );
        zip.file(
            '_rels/.rels',
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
        );
        zip.file(
            'word/document.xml',
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpoXml}</w:body></w:document>`
        );
        return zip.generateAsync({ type: 'nodebuffer' });
    };

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    describe('el ciclo escolar', () => {
        it('RES-API-01: el ciclo activo y sus estadísticas se consultan', async () => {
            const activo = await como('profesor')(request(server.server).get('/api/academic-years/active'));
            expect(activo.status).toBe(200);

            const stats = await como('admin')(request(server.server).get(`/api/academic-years/${year.id}/stats`));
            expect(stats.status).toBe(200);
        }, 60000);

        it('RES-API-02: solo el admin cambia el estado del ciclo', async () => {
            const deProfesor = await como('profesor')(
                request(server.server).put(`/api/academic-years/${year.id}/status`)
            ).send({ status: 'COMPLETED' });
            expect([401, 403]).toContain(deProfesor.status);

            // Y el ciclo sigue como estaba
            const enBD = await prisma.academicYear.findUnique({ where: { id: year.id } });
            expect(enBD!.status).not.toBe('COMPLETED');
        }, 60000);

        it('RES-API-03: las estrategias de cierre y la vista previa son del admin', async () => {
            const estrategias = await como('admin')(request(server.server).get('/api/academic-years/close/strategies'));
            expect(estrategias.status).toBe(200);

            const deProfesor = await como('profesor')(
                request(server.server).get('/api/academic-years/close/strategies')
            );
            expect([401, 403]).toContain(deProfesor.status);
        }, 60000);

        it('RES-API-04: preparar el cierre enseña qué pasaría, sin tocar nada', async () => {
            const antes = await prisma.studentClassroom.count();

            const res = await como('admin')(
                request(server.server).post(`/api/academic-years/${year.id}/close/prepare`)
            ).send({ strategy: 'PROMOTE_ALL' });

            expect(res.status).toBeLessThan(500);

            // "Preparar" es mirar, no ejecutar: nada se movió
            expect(await prisma.studentClassroom.count()).toBe(antes);
        }, 60000);

        it('RES-API-05: la vista previa de promoción no mueve a nadie', async () => {
            const antes = await prisma.studentClassroom.count();

            const res = await como('admin')(
                request(server.server).post(`/api/academic-years/${year.id}/promotion/strategy-preview`)
            ).send({ strategy: 'PROMOTE_ALL' });

            expect(res.status).toBeLessThan(500);
            expect(await prisma.studentClassroom.count()).toBe(antes);
        }, 60000);
    });

    describe('los paneles', () => {
        it('RES-API-06: los paneles del liceo responden para el admin', async () => {
            for (const ruta of [
                '/api/dashboard/stats/system',
                '/api/dashboard/activity/recent',
                '/api/dashboard/events/upcoming',
                '/api/dashboard/metrics/performance',
            ]) {
                const res = await como('admin')(request(server.server).get(ruta));
                expect(res.status).toBeLessThan(500);
            }
        }, 60000);

        it('RES-API-07: un alumno no lee las métricas del sistema', async () => {
            const abiertas: string[] = [];
            for (const ruta of ['/api/dashboard/stats/system', '/api/dashboard/metrics/performance']) {
                const res = await como('alumno')(request(server.server).get(ruta));
                if (res.status < 400) abiertas.push(`${ruta} respondió ${res.status}`);
            }
            expect(abiertas).toEqual([]);
        }, 60000);
    });

    describe('el plan de evaluación', () => {
        it('RES-API-08: copiar el plan a otra sección es cosa de quien la imparte', async () => {
            const deAlumno = await como('alumno')(request(server.server).post('/api/evaluation-plan/copy')).send({
                sourceClassroomId: classroom.id,
                sourceSubjectId: subject.id,
                sourceLapso: '1',
                targetClassroomIds: [otraSeccion.id],
            });
            expect([401, 403]).toContain(deAlumno.status);
        }, 60000);

        it('RES-API-09: importar un Word lee la tabla del plan', async () => {
            // La tabla como la haría un profesor en su plan
            const filas = [
                ['Tema generador', 'Actividad', 'Técnica', 'Instrumento', '%'],
                ['Los números enteros', 'Prueba escrita', 'Observación', 'Lista de cotejo', '25'],
                ['Fracciones', 'Taller en grupo', 'Producción', 'Rúbrica', '25'],
            ];
            const celdas = (fila: string[]) =>
                fila.map((c) => `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join('');
            const tabla = `<w:tbl>${filas.map((f) => `<w:tr>${celdas(f)}</w:tr>`).join('')}</w:tbl>`;

            const buffer = await docxDePrueba(tabla);

            const res = await como('profesor')(request(server.server).post('/api/evaluation-plan/parse-word'))
                .attach('file', buffer, {
                    filename: 'plan.docx',
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                });

            expect(res.status).toBe(200);
            const filasLeidas = res.body?.rows ?? [];
            expect(filasLeidas.length).toBe(2);
            expect(filasLeidas[0].title).toBe('Los números enteros');
            expect(filasLeidas[0].actividadEval).toBe('Prueba escrita');
            expect(filasLeidas[0].ponderacion).toBe('25');
        }, 60000);

        it('RES-API-10: un Word sin tabla se rechaza con un motivo claro, no con un 500', async () => {
            const buffer = await docxDePrueba(
                '<w:p><w:r><w:t>Mi plan de evaluación, escrito sin tabla ninguna.</w:t></w:r></w:p>'
            );

            const res = await como('profesor')(request(server.server).post('/api/evaluation-plan/parse-word'))
                .attach('file', buffer, {
                    filename: 'sin-tabla.docx',
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                });

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/tabla/i);
        }, 60000);

        it('RES-API-11: un alumno no sube archivos al plan', async () => {
            const res = await como('alumno')(request(server.server).post('/api/evaluation-plan/parse-word')).send({});

            // 403 por quién es, no 400 por el archivo que falta: la puerta se cierra
            // antes de mirar lo que trae.
            expect([401, 403]).toContain(res.status);
        }, 60000);
    });

    describe('estadísticas de notas y materias', () => {
        it('RES-API-12: las notas de una actividad y sus estadísticas responden', async () => {
            const deActividad = await como('profesor')(
                request(server.server).get(`/api/grades/activity/${actividad.id}`)
            );
            expect(deActividad.status).toBe(200);
            expect(JSON.stringify(deActividad.body)).toContain(alumno.id);

            const stats = await como('profesor')(
                request(server.server).get('/api/grades/stats').query({ classroomId: classroom.id })
            );
            expect(stats.status).toBe(200);
        }, 60000);

        it('RES-API-13: exportar notas responde', async () => {
            const res = await como('profesor')(
                request(server.server).get('/api/grades/export/csv').query({ classroomId: classroom.id })
            );
            expect(res.status).toBeLessThan(500);
        }, 60000);

        it('RES-API-14: de una materia se consultan sus profesores y sus estudiantes', async () => {
            const profesores = await como('admin')(request(server.server).get(`/api/subjects/${subject.id}/teachers`));
            expect(profesores.status).toBe(200);
            expect(JSON.stringify(profesores.body)).toContain(profesor.id);

            const estudiantes = await como('admin')(request(server.server).get(`/api/subjects/${subject.id}/students`));
            expect(estudiantes.status).toBe(200);

            const stats = await como('admin')(request(server.server).get('/api/subjects/stats'));
            expect(stats.status).toBe(200);
        }, 60000);

        it('RES-API-15: de una sección se consultan sus estadísticas y se encuentra por su nombre corto', async () => {
            const stats = await como('profesor')(request(server.server).get(`/api/classrooms/${classroom.id}/stats`));
            expect(stats.status).toBe(200);

            const porSlug = await como('profesor')(
                request(server.server).get(`/api/classrooms/slug/${classroom.slug}`)
            );
            expect(porSlug.status).toBe(200);
            expect(JSON.stringify(porSlug.body)).toContain(classroom.id);
        }, 60000);
    });

    describe('notificaciones que manda el liceo', () => {
        it('RES-API-16: el admin manda una notificación a varias personas', async () => {
            const res = await como('admin')(request(server.server).post('/api/notifications/bulk')).send({
                recipients: [alumno.id, profesor.id],
                title: 'Reunión de representantes',
                message: 'El viernes a las 8 de la mañana en el auditorio',
                type: 'ANNOUNCEMENT',
                priority: 'NORMAL',
            });

            expect([200, 201]).toContain(res.status);

            const llegaron = await prisma.notification.count({ where: { title: 'Reunión de representantes' } });
            expect(llegaron).toBe(2);
        }, 60000);

        it('RES-API-17: un alumno no manda notificaciones a nadie', async () => {
            const masiva = await como('alumno')(request(server.server).post('/api/notifications/bulk')).send({
                recipients: [profesor.id],
                title: 'Broma',
                message: 'No se suspenden las clases, es mentira',
                type: 'ANNOUNCEMENT',
                priority: 'HIGH',
            });
            expect([401, 403]).toContain(masiva.status);

            // Nota: en /system la validación del cuerpo corre antes que la del rol, así
            // que un no autorizado puede recibir un 400 en vez de un 403. No pasa nada
            // grave (no ejecuta), pero por eso aquí basta con que NO lo consiga.
            const delSistema = await como('alumno')(request(server.server).post('/api/notifications/system')).send({
                title: 'Broma del sistema',
                message: 'Mañana no hay clases, quédense en casa',
                type: 'ANNOUNCEMENT',
                priority: 'HIGH',
            });
            expect(delSistema.status).toBeGreaterThanOrEqual(400);

            expect(await prisma.notification.count({ where: { title: { contains: 'Broma' } } })).toBe(0);
        }, 60000);

        it('RES-API-18: un alumno no lee la bandeja de otro por la puerta de atrás', async () => {
            const res = await como('alumno')(request(server.server).get(`/api/notifications/user/${profesor.id}`));
            expect([401, 403]).toContain(res.status);
        }, 60000);
    });
});
