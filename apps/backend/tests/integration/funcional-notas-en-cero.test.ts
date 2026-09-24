import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
} from '../helpers';
import { platformPrisma } from '../../src/config/database';
import { gradesService } from '../../src/services/grades.service';
import { bulkSubjectAverages } from '../../src/services/bulk-averages.service';
import { RedisCache } from '../../src/config/redis';

/**
 * UN CERO ES UNA NOTA
 *
 * El mapa de cálculos dice que lo que no cuenta es lo que NO TIENE NOTA: un
 * alumno sin calificar no baja el promedio de la sección y un lapso vacío no
 * baja el del ciclo. Pero el código miraba si el promedio era mayor que cero
 * para saber si había notas, así que un alumno con TODO en 0 —el que no
 * entregó nada— pasaba por «sin calificar»:
 *
 *   - al cerrar el ciclo salía PROMOVIDO, sin materia pendiente;
 *   - no salía en riesgo en la materia;
 *   - el representante no recibía el aviso de promedio bajo;
 *   - un lapso con 0 no contaba en el promedio del ciclo: 0 y 16 daba 16.
 *
 * Estas pruebas separan las dos cosas: sin nota (no cuenta) y nota 0 (cuenta).
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Un cero es una nota (CERO-01…07)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let tokenAdmin: string;
    let profe: any;
    let year: any;
    let lapso1: any;
    let lapso2: any;
    let seccion: any;
    let mate: any;
    let caste: any;
    /** Todo 0 en Matemática, 15 en Castellano. */
    let conCeros: any;
    /** Sin ninguna nota en Matemática, 15 en Castellano. */
    let sinNotas: any;
    /** Matemática: 0 en el primer lapso y 16 en el segundo. */
    let ceroYDieciseis: any;

    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    const ponerNota = async (studentId: string, subjectId: string, periodId: string, score: number) => {
        const actividad = await prisma.activity.create({
            data: {
                id: gId(),
                title: `Actividad ${gId().slice(0, 6)}`,
                description: 'Prueba de notas en cero',
                type: 'TAREA' as any,
                scope: 'CLASSROOM' as any,
                classroomId: seccion.id,
                subjectId,
                periodId,
                createdBy: profe.id,
                maxGrade: 20,
                weight: 1,
                startDate: new Date(),
                endDate: new Date(Date.now() + 864e5),
                dueDate: new Date(Date.now() + 864e5),
            } as any,
        });
        await prisma.grade.create({
            data: { id: gId(), score, studentId, activityId: actividad.id, periodId, subjectId, teacherId: profe.id },
        });
    };

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: { academicConfig: { notaMinimaAprobatoria: 10, asistenciaMinima: 80, maxMateriasPendientesParaPromover: 2 } },
        });

        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');

        const hoy = Date.now();
        year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `Ciclo-${gId().slice(0, 6)}`,
                startDate: new Date(hoy - 60 * 864e5),
                endDate: new Date(hoy + 60 * 864e5),
                isActive: true,
                status: 'ACTIVE',
                instituteId: 'institute',
            } as any,
        });
        lapso1 = await prisma.period.create({
            data: { id: gId(), name: 'Primer Lapso', startDate: new Date(hoy - 60 * 864e5), endDate: new Date(hoy - 1 * 864e5), isActive: false, academicYearId: year.id },
        });
        lapso2 = await prisma.period.create({
            data: { id: gId(), name: 'Segundo Lapso', startDate: new Date(hoy), endDate: new Date(hoy + 60 * 864e5), isActive: true, academicYearId: year.id },
        });
        seccion = await prisma.classroom.create({
            data: { id: gId(), name: '1er Año A', slug: `aula-${gId()}`, grade: 1, section: 'A', capacity: 30, academicYearId: year.id, instituteId: 'institute' } as any,
        });
        mate = await prisma.subject.create({
            data: { id: gId(), name: `Matemática-${gId().slice(0, 5)}`, code: `MAT-${gId().slice(0, 6).toUpperCase()}`, slug: `mate-${gId()}`, instituteId: 'institute' } as any,
        });
        caste = await prisma.subject.create({
            data: { id: gId(), name: `Castellano-${gId().slice(0, 5)}`, code: `CAS-${gId().slice(0, 6).toUpperCase()}`, slug: `caste-${gId()}`, instituteId: 'institute' } as any,
        });
        for (const m of [mate, caste]) {
            await prisma.classroomSubject.create({ data: { classroomId: seccion.id, subjectId: m.id, teacherId: profe.id } });
        }

        const inscribir = async () => {
            const { user } = await createTestUser(prisma, UserRole.STUDENT);
            await prisma.studentClassroom.create({
                data: { id: gId(), studentId: user.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
            });
            return user;
        };
        conCeros = await inscribir();
        sinNotas = await inscribir();
        ceroYDieciseis = await inscribir();

        // conCeros: dos ceros en Matemática, 15 en Castellano.
        await ponerNota(conCeros.id, mate.id, lapso2.id, 0);
        await ponerNota(conCeros.id, mate.id, lapso2.id, 0);
        await ponerNota(conCeros.id, caste.id, lapso2.id, 15);
        // sinNotas: nada en Matemática, 15 en Castellano.
        await ponerNota(sinNotas.id, caste.id, lapso2.id, 15);
        // ceroYDieciseis: 0 en el primer lapso, 16 en el segundo.
        await ponerNota(ceroYDieciseis.id, mate.id, lapso1.id, 0);
        await ponerNota(ceroYDieciseis.id, mate.id, lapso2.id, 16);
        await ponerNota(ceroYDieciseis.id, caste.id, lapso2.id, 15);
    }, 180000);

    it('CERO-01: un lapso con 0 cuenta en el promedio del ciclo (0 y 16 dan 8, no 16)', async () => {
        const global = await gradesService.calculateWeightedSubjectAverage(prisma, ceroYDieciseis.id, mate.id);
        expect(global).toBe(8);
    });

    it('CERO-02: el cálculo en bloque (listas y panel del alumno) da lo mismo: 8', async () => {
        const enBloque = await bulkSubjectAverages(prisma, {
            classroomId: seccion.id,
            studentIds: [ceroYDieciseis.id, sinNotas.id],
            subjectIds: [mate.id],
        });
        expect(enBloque.get(ceroYDieciseis.id)!.get(mate.id)).toBe(8);
        // Y quien no tiene notas sigue dando 0, sin error.
        expect(enBloque.get(sinNotas.id)!.get(mate.id)).toBe(0);
    });

    it('CERO-03: al cerrar el ciclo, el alumno con todo en 0 tiene la materia PENDIENTE', async () => {
        const res = await request(server.server)
            .post(`/api/academic-years/${year.id}/close/prepare`)
            .set(auth(tokenAdmin))
            .expect(200);

        const s = res.body.suggestions.find((x: any) => x.studentId === conCeros.id);
        expect(s.failedSubjects.map((f: any) => f.name)).toEqual([mate.name]);
        expect(s.pendingCount).toBe(1);
        expect(s.suggestedStatus).toBe('PROMOVIDO_CON_PENDIENTES');
        // Su promedio final son sus dos materias: (0 + 15) / 2.
        expect(s.finalAverage).toBe(7.5);
    }, 60000);

    it('CERO-04: quien NO tiene notas en una materia no la tiene pendiente (sin nota no es cero)', async () => {
        const res = await request(server.server)
            .post(`/api/academic-years/${year.id}/close/prepare`)
            .set(auth(tokenAdmin))
            .expect(200);

        const s = res.body.suggestions.find((x: any) => x.studentId === sinNotas.id);
        expect(s.pendingCount).toBe(0);
        expect(s.suggestedStatus).toBe('PROMOVIDO');
        expect(s.finalAverage).toBe(15);
    }, 60000);

    it('CERO-05: en las cifras de la sección, el alumno con 0 sale en riesgo en la materia', async () => {
        const res = await request(server.server)
            .get(`/api/statistics/section/${seccion.id}`)
            .set(auth(tokenAdmin))
            .expect(200);
        const datos = res.body.data ?? res.body;
        const deMate = datos.subjectAverages.find((m: any) => m.subjectId === mate.id);
        // conCeros (0) y ceroYDieciseis (8): los dos por debajo de 10.
        expect(deMate.studentsAtRisk).toBe(2);
    }, 60000);

    it('CERO-06: en la lista de la sección, el alumno con 0 tiene la materia reprobada y promedio 7.5', async () => {
        const res = await request(server.server)
            .get(`/api/students?classroomId=${seccion.id}&isActive=true`)
            .set(auth(tokenAdmin))
            .expect(200);
        const lista = res.body.students ?? res.body.data ?? res.body;
        const fila = lista.find((x: any) => x.id === conCeros.id);
        expect(fila.average).toBe(7.5);
        expect((fila.failedSubjects ?? []).map((f: any) => f.subjectId)).toContain(mate.id);
    }, 60000);

    it('CERO-07: el representante recibe el aviso de promedio bajo aunque el promedio sea 0', async () => {
        // Un alumno con TODO en 0, y su representante.
        const { user: soloCeros } = await createTestUser(prisma, UserRole.STUDENT);
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: soloCeros.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
        await ponerNota(soloCeros.id, mate.id, lapso2.id, 0);
        await ponerNota(soloCeros.id, caste.id, lapso2.id, 0);
        const { user: tutor } = await createTestUser(prisma, UserRole.TUTOR);
        await prisma.studentTutor.create({ data: { studentId: soloCeros.id, tutorId: tutor.id, relationship: 'Madre' } });

        const res = await request(server.server)
            .get('/api/dashboard/tutor')
            .set(auth(generateTestToken(tutor.id, UserRole.TUTOR, 'institute')))
            .expect(200);
        const datos = res.body.data ?? res.body;
        const aviso = (datos.alerts ?? []).find((a: any) => a.studentId === soloCeros.id && a.type === 'ACADEMIC');
        expect(aviso).toBeDefined();
    }, 60000);
});
