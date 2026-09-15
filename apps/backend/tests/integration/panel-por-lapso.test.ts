import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * EL PANEL MIRA EL LAPSO EN CURSO, NO TODA LA VIDA ESCOLAR
 *
 * Un liceo acumula años: cada septiembre entran alumnos nuevos y los que
 * terminan se quedan guardados. Un alumno de quinto año tiene cinco años de
 * asistencias y de notas en la misma base.
 *
 * Si el panel suma todo eso, pasan dos cosas malas:
 *
 *   1. **El número deja de servir.** Un alumno que este lapso no ha faltado
 *      ningún día aparecía con la asistencia estropeada por un año malo de hace
 *      tres cursos. Nadie puede decidir nada con esa cifra.
 *   2. **El sistema se hace más lento cada año**, porque cada año hay más filas
 *      que sumar para responder lo mismo.
 *
 * Nada se borra: los años anteriores siguen enteros en la base y en el
 * expediente. Lo que cambia es qué se suma en el panel de hoy.
 *
 * Esta prueba monta un alumno con DOS años —uno viejo malo y el de ahora bueno—
 * y comprueba que el panel solo mire el de ahora. Se escribió porque el arreglo
 * casi se queda sin efecto en silencio: la consulta del representante no traía
 * el año del alumno, así que el filtro quedaba vacío y volvía a contarlo todo.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

/** Días relativos a hoy, para que el lapso "en curso" lo sea de verdad. */
const diasDesdeHoy = (dias: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(12, 0, 0, 0);
    return d;
};

describe('El panel mira el lapso en curso', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let alumno: any;
    let profesor: any;
    let tokenAlumno: string;

    let anioViejo: any;
    let anioActual: any;
    let lapsoActual: any;
    let lapsoViejo: any;
    let materiaDeAhora: any;
    let materiaDeAntes: any;
    let seccionActual: any;
    let seccionVieja: any;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        profesor = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tokenAlumno = generateTestToken(alumno.id, UserRole.STUDENT, 'institute');

        // ── El año de hace tiempo, con un lapso ya cerrado ──────────────────
        anioViejo = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `Ciclo viejo ${gId().slice(0, 6)}`,
                startDate: diasDesdeHoy(-700),
                endDate: diasDesdeHoy(-400),
                isActive: false,
                instituteId: 'institute',
            },
        });
        lapsoViejo = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Lapso viejo',
                academicYearId: anioViejo.id,
                startDate: diasDesdeHoy(-700),
                endDate: diasDesdeHoy(-400),
                isActive: false,
            },
        });

        // ── El año de ahora, con el lapso que contiene HOY ──────────────────
        anioActual = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `Ciclo actual ${gId().slice(0, 6)}`,
                startDate: diasDesdeHoy(-60),
                endDate: diasDesdeHoy(+200),
                isActive: true,
                instituteId: 'institute',
            },
        });
        lapsoActual = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Lapso en curso',
                academicYearId: anioActual.id,
                startDate: diasDesdeHoy(-30),
                endDate: diasDesdeHoy(+60),
                isActive: true,
            },
        });

        const nuevaSeccion = (nombre: string, anioId: string) =>
            prisma.classroom.create({
                data: {
                    id: gId(),
                    name: nombre,
                    slug: `lapso-${gId().slice(0, 8)}`,
                    grade: 1,
                    section: 'A',
                    capacity: 30,
                    academicYearId: anioId,
                    instituteId: 'institute',
                    teacherId: profesor.id,
                },
            });

        seccionVieja = await nuevaSeccion('Sección vieja', anioViejo.id);
        seccionActual = await nuevaSeccion('Sección actual', anioActual.id);

        materiaDeAntes = await createTestSubject(prisma, 'institute');
        materiaDeAhora = await createTestSubject(prisma, 'institute');

        await prisma.classroomSubject.create({
            data: {
                classroomId: seccionActual.id,
                subjectId: materiaDeAhora.id,
                teacherId: profesor.id,
                weeklyBlocks: 3,
            },
        });

        // El alumno estuvo en la vieja y ahora está en la actual.
        await prisma.studentClassroom.create({
            data: {
                studentId: alumno.id,
                classroomId: seccionVieja.id,
                academicYearId: anioViejo.id,
                isActive: false,
            },
        });
        await prisma.studentClassroom.create({
            data: {
                studentId: alumno.id,
                classroomId: seccionActual.id,
                academicYearId: anioActual.id,
                isActive: true,
            },
        });

        // ── Asistencia: fatal hace dos años, perfecta este lapso ────────────
        for (let i = 1; i <= 10; i++) {
            await prisma.dailyAttendance.create({
                data: {
                    id: gId(),
                    studentId: alumno.id,
                    classroomId: seccionVieja.id,
                    teacherId: profesor.id,
                    date: diasDesdeHoy(-600 + i),
                    status: 'ABSENT',
                } as any,
            });
        }
        for (let i = 1; i <= 10; i++) {
            await prisma.dailyAttendance.create({
                data: {
                    id: gId(),
                    studentId: alumno.id,
                    classroomId: seccionActual.id,
                    teacherId: profesor.id,
                    date: diasDesdeHoy(-20 + i),
                    status: 'PRESENT',
                } as any,
            });
        }

        // ── Notas en los dos años, en materias distintas ────────────────────
        const nota = async (subjectId: string, periodId: string, classroomId: string, score: number) => {
            const actividad = await prisma.activity.create({
                data: {
                    title: `Actividad ${gId().slice(0, 6)}`,
                    type: 'SUMATIVA',
                    scope: 'CLASSROOM',
                    startDate: new Date(),
                    maxGrade: 20,
                    weight: 1,
                    classroomId,
                    subjectId,
                    periodId,
                    lapso: '1',
                    createdBy: profesor.id,
                    instituteId: 'institute',
                },
            });
            await prisma.grade.create({
                data: {
                    id: gId(),
                    score,
                    studentId: alumno.id,
                    activityId: actividad.id,
                    periodId,
                    subjectId,
                    teacherId: profesor.id,
                } as any,
            });
        };

        await nota(materiaDeAntes.id, lapsoViejo.id, seccionVieja.id, 5);
        await nota(materiaDeAhora.id, lapsoActual.id, seccionActual.id, 18);

        // Observaciones: una vieja y una de ahora
        await prisma.observation.create({
            data: {
                id: gId(),
                studentId: alumno.id,
                title: 'Observación vieja',
                description: 'de hace dos años',
                createdById: profesor.id,
                date: diasDesdeHoy(-600),
                instituteId: 'institute',
            } as any,
        });
        await prisma.observation.create({
            data: {
                id: gId(),
                studentId: alumno.id,
                title: 'Observación de ahora',
                description: 'de este lapso',
                createdById: profesor.id,
                date: diasDesdeHoy(-5),
                instituteId: 'institute',
            } as any,
        });
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    const panel = async () => {
        const res = await request(server.server)
            .get('/api/dashboard/student')
            .set('Authorization', `Bearer ${tokenAlumno}`)
            .set('X-Institute-Slug', SLUG);
        expect(res.status).toBe(200);
        return res.body?.data ?? res.body;
    };

    it('LAPSO-01: la asistencia es la del lapso en curso, no la de toda su vida escolar', async () => {
        const datos = await panel();

        // Este lapso no faltó ni un día: 100%.
        // Si contara los dos años daría 50%, porque hace dos años faltó diez veces.
        expect(datos.kpis.attendancePercentage).toBe(100);
    });

    it('LAPSO-02: también se ofrece la cifra del ciclo completo, aparte', async () => {
        const datos = await panel();

        expect(datos.kpis).toHaveProperty('attendancePercentageCiclo');
        // El ciclo de ahora empezó hace 60 días, así que solo abarca lo bueno.
        expect(datos.kpis.attendancePercentageCiclo).toBe(100);
    });

    it('LAPSO-03: las observaciones son las del lapso, no las de siempre', async () => {
        const datos = await panel();

        // Hay dos en total; una es de hace dos años.
        expect(datos.kpis.totalObservations).toBe(1);
        expect(datos.kpis.totalObservationsCiclo).toBe(1);
    });

    it('LAPSO-04: no aparecen materias de años anteriores', async () => {
        const datos = await panel();

        const nombres = (datos.subjects ?? []).map((m: any) => m.id);
        expect(nombres).toContain(materiaDeAhora.id);
        expect(nombres).not.toContain(materiaDeAntes.id);
    });

    it('LAPSO-05: lo viejo NO se borró, sigue entero en la base', async () => {
        // Esto es lo que separa "acotar" de "perder". El panel deja de sumarlo,
        // pero el dato sigue ahí para el expediente y para los informes.
        const asistenciasViejas = await prisma.dailyAttendance.count({
            where: { studentId: alumno.id, classroomId: seccionVieja.id },
        });
        expect(asistenciasViejas).toBe(10);

        const notasViejas = await prisma.grade.count({
            where: { studentId: alumno.id, periodId: lapsoViejo.id },
        });
        expect(notasViejas).toBe(1);

        const observaciones = await prisma.observation.count({ where: { studentId: alumno.id } });
        expect(observaciones).toBe(2);
    });
});
