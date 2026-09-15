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

/**
 * EL MAPA DE CÁLCULOS TIENE QUE SER VERDAD
 *
 * `docs/MAPA_DE_CALCULOS.md` dice, regla por regla, cómo se calcula cada número
 * que enseña el sistema: el promedio, quién está en riesgo, la asistencia, la
 * ocupación de un aula. Es el acuerdo de qué significa cada cifra.
 *
 * El problema de un documento así es que **envejece en silencio**. Alguien
 * cambia una fórmula, el documento se queda, y a partir de ahí el papel dice una
 * cosa y el sistema hace otra. Nadie se entera hasta que una familia pregunta
 * por qué su hijo aparece reprobado.
 *
 * Estas pruebas cogen las reglas del documento y las comprueban **contra el
 * sistema de verdad**: se calcula el número a mano desde la base, se le pregunta
 * al sistema, y tienen que coincidir.
 *
 * A partir de ahora, cambiar una fórmula sin cambiar el documento rompe la
 * tanda. Que es justo lo que se quiere.
 */

const SLUG = 'test-institute';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('El mapa de cálculos tiene que ser verdad', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profe: any;
    let tokenAdmin: string;
    let year: any;
    let lapso: any;
    let seccion: any;
    let materia: any;
    let alumnos: any[] = [];

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    });

    const configurar = (academicConfig: Record<string, unknown>) =>
        platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig } });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await configurar({}).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await configurar({ notaMinimaAprobatoria: 10, asistenciaMinima: 80 });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');

        const hoy = new Date();
        const desde = new Date(hoy.getTime() - 30 * 864e5);
        const hasta = new Date(hoy.getTime() + 30 * 864e5);

        year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: `Ciclo-${gId().slice(0, 6)}`,
                startDate: desde,
                endDate: hasta,
                isActive: true,
                status: 'ACTIVE',
                instituteId: 'institute',
            } as any,
        });

        lapso = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Lapso en curso',
                startDate: desde,
                endDate: hasta,
                isActive: true,
                academicYearId: year.id,
            },
        });

        // Capacidad conocida: la ocupación se calcula contra ella.
        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado A',
                slug: `aula-${gId()}`,
                grade: 1,
                section: 'A',
                capacity: 20,
                academicYearId: year.id,
                instituteId: 'institute',
            } as any,
        });

        materia = await prisma.subject.create({
            data: {
                id: gId(),
                name: `Matemática-${gId().slice(0, 5)}`,
                code: `MAT-${gId().slice(0, 6).toUpperCase()}`,
                slug: `matematica-${gId()}`,
                instituteId: 'institute',
            } as any,
        });

        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id },
        });

        // Ocho alumnos inscritos: número redondo para que las cuentas se lean.
        alumnos = [];
        for (let i = 0; i < 8; i++) {
            const { user } = await createTestUser(prisma, UserRole.STUDENT);
            alumnos.push(user);
            await prisma.studentClassroom.create({
                data: {
                    id: gId(),
                    studentId: user.id,
                    classroomId: seccion.id,
                    academicYearId: year.id,
                    isActive: true,
                },
            });
        }
    }, 180000);

    /** Le pone una nota a un alumno a través de una actividad. */
    const ponerNota = async (studentId: string, score: number) => {
        const actividad = await prisma.activity.create({
            data: {
                id: gId(),
                title: `Actividad ${gId().slice(0, 6)}`,
                description: 'Actividad de prueba del mapa de cálculos',
                type: 'TAREA' as any,
                scope: 'CLASSROOM' as any,
                classroomId: seccion.id,
                subjectId: materia.id,
                periodId: lapso.id,
                createdBy: profe.id,
                maxGrade: 20,
                weight: 1,
                startDate: new Date(),
                endDate: new Date(Date.now() + 864e5),
                dueDate: new Date(Date.now() + 864e5),
            } as any,
        });

        await prisma.grade.create({
            data: {
                id: gId(),
                score,
                studentId,
                activityId: actividad.id,
                periodId: lapso.id,
                subjectId: materia.id,
                teacherId: profe.id,
            },
        });
    };

    const medidoresDeLaSeccion = async () => {
        const res = await request(server.server)
            .get(`/api/statistics/section/${seccion.id}`)
            .set(auth(tokenAdmin))
            .expect(200);
        return res.body.data ?? res.body;
    };

    // ═════════════════════════════════════════════════════════════════════════
    // Sección 3 del mapa — RIESGO ACADÉMICO
    //
    //   "Sea minPassing = notaMinimaAprobatoria del instituto: un estudiante
    //    está en riesgo si su promedio es menor que minPassing."
    // ═════════════════════════════════════════════════════════════════════════

    it('MAPA-01: en riesgo son exactamente los que están por debajo de la nota mínima', async () => {
        // Tres por debajo de 10, cinco por encima. Ninguno justo en 10, que es
        // otra prueba (abajo).
        const notas = [4, 7, 9.5, 11, 13, 15, 18, 20];
        for (let i = 0; i < alumnos.length; i++) {
            await ponerNota(alumnos[i].id, notas[i]);
        }

        const datos = await medidoresDeLaSeccion();

        expect(datos.totalStudents).toBe(8);
        expect(datos.studentsAtRisk).toBe(3);
    }, 120000);

    it('MAPA-02: justo en la nota mínima NO está en riesgo (es "menor que", no "menor o igual")', async () => {
        // Un 10 con la mínima en 10 aprueba. Si esto se rompe, medio liceo pasa
        // a "riesgo" de un día para otro.
        for (const alumno of alumnos) await ponerNota(alumno.id, 10);

        const datos = await medidoresDeLaSeccion();
        expect(datos.studentsAtRisk).toBe(0);
    }, 120000);

    it('MAPA-03: si el liceo cambia la nota mínima, el riesgo cambia con ella', async () => {
        const notas = [4, 7, 9.5, 11, 13, 15, 18, 20];
        for (let i = 0; i < alumnos.length; i++) await ponerNota(alumnos[i].id, notas[i]);

        await configurar({ notaMinimaAprobatoria: 14, asistenciaMinima: 80 });
        const conCatorce = await medidoresDeLaSeccion();

        // Por debajo de 14: 4, 7, 9.5, 11, 13 → cinco.
        expect(conCatorce.studentsAtRisk).toBe(5);
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════
    // Sección 4 del mapa — ASISTENCIA
    //
    //   "AsistenciaEstudiante = ((Presentes + Tardanzas) / TotalRegistros) * 100"
    //   "Días sin toma de asistencia no penalizan el porcentaje."
    // ═════════════════════════════════════════════════════════════════════════

    const pasarLista = async (studentId: string, estados: string[]) => {
        const base = Date.now() - 20 * 864e5;
        await prisma.dailyAttendance.createMany({
            data: estados.map((status, i) => ({
                id: gId(),
                date: new Date(base + i * 864e5),
                status: status as any,
                studentId,
                classroomId: seccion.id,
                teacherId: profe.id,
            })),
        });
    };

    it('MAPA-04: la tardanza cuenta como asistencia, como dice el mapa', async () => {
        // Cuatro días: presente, tarde, presente, ausente → 3 de 4 = 75%.
        for (const alumno of alumnos) {
            await pasarLista(alumno.id, ['PRESENT', 'LATE', 'PRESENT', 'ABSENT']);
        }

        const datos = await medidoresDeLaSeccion();

        // Si la tardanza no contara, saldría 50%.
        expect(Math.round(datos.attendanceRate)).toBe(75);
    }, 120000);

    it('MAPA-05: un día que nadie pasó lista no baja el porcentaje de nadie', async () => {
        // Todos presentes los días que se pasó lista. Que existan días del
        // calendario sin lista no puede bajar a nadie: no hay dato que juzgar.
        for (const alumno of alumnos) {
            await pasarLista(alumno.id, ['PRESENT', 'PRESENT']);
        }

        const datos = await medidoresDeLaSeccion();
        expect(Math.round(datos.attendanceRate)).toBe(100);
    }, 120000);

    it('MAPA-06: un alumno sin NINGÚN registro no cuenta como asistencia baja', async () => {
        // Es lo que hacía que el primer día del curso la sección saliera con
        // "todos con asistencia baja". Está en el mapa y está corregido.
        const datos = await medidoresDeLaSeccion();
        expect(datos.studentsWithLowAttendance).toBe(0);
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════
    // Sección 5 del mapa — OCUPACIÓN
    //
    //   "Ocupacion = (EstudiantesInscritosActivos / CapacidadAula) * 100"
    // ═════════════════════════════════════════════════════════════════════════

    it('MAPA-07: la ocupación cuenta solo a los inscritos ACTIVOS', async () => {
        const antes = await request(server.server)
            .get('/api/classrooms')
            .set(auth(tokenAdmin))
            .expect(200);

        const lista = Array.isArray(antes.body) ? antes.body : (antes.body.classrooms ?? antes.body.data ?? []);
        const mia = lista.find((c: any) => c.id === seccion.id);

        expect(mia).toBeTruthy();
        expect(mia.capacity).toBe(20);
        expect(mia._count?.students ?? mia._count?.studentClassrooms).toBe(8);

        // Se da de baja a uno: la ocupación tiene que bajar a 7.
        await prisma.studentClassroom.updateMany({
            where: { studentId: alumnos[0].id, classroomId: seccion.id },
            data: { isActive: false },
        });

        const despues = await request(server.server)
            .get('/api/classrooms')
            .set(auth(tokenAdmin))
            .expect(200);

        const lista2 = Array.isArray(despues.body) ? despues.body : (despues.body.classrooms ?? despues.body.data ?? []);
        const mia2 = lista2.find((c: any) => c.id === seccion.id);

        expect(mia2._count?.students ?? mia2._count?.studentClassrooms).toBe(7);
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════
    // Sección 1 del mapa — LA JERARQUÍA DE PROMEDIOS
    //
    //   El promedio de la sección sale de los promedios de sus alumnos. Si los
    //   números de un nivel no cuadran con los del nivel de abajo, el sistema se
    //   está contradiciendo a sí mismo.
    // ═════════════════════════════════════════════════════════════════════════

    it('MAPA-08: el promedio de la sección cuadra con el de sus alumnos', async () => {
        const notas = [10, 12, 14, 16, 10, 12, 14, 16]; // media exacta: 13
        for (let i = 0; i < alumnos.length; i++) await ponerNota(alumnos[i].id, notas[i]);

        const datos = await medidoresDeLaSeccion();

        // Se permite un pelo de diferencia por el redondeo, no más.
        expect(Math.abs(datos.globalAverage - 13)).toBeLessThan(0.05);
    }, 120000);

    it('MAPA-09: un alumno sin notas no arrastra el promedio hacia abajo', async () => {
        // Cuatro con 16, cuatro sin ninguna nota. El promedio de la sección es
        // 16, no 8: quien no tiene notas no es un cero, es un "todavía no".
        for (let i = 0; i < 4; i++) await ponerNota(alumnos[i].id, 16);

        const datos = await medidoresDeLaSeccion();
        expect(Math.abs(datos.globalAverage - 16)).toBeLessThan(0.05);
    }, 120000);

    // ═════════════════════════════════════════════════════════════════════════
    // Sección 2 del mapa — EL PLAN DE EVALUACIÓN SUMA 20
    //
    //   "abs(suma(Puntos_EVALUATION) - 20) <= 0.009"
    // ═════════════════════════════════════════════════════════════════════════

    const guardarPlan = (puntos: number[]) => {
        const tokenProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        return request(server.server)
            .post('/api/evaluation-plan/rows/batch')
            .set(auth(tokenProfe))
            .send({
                classroomId: seccion.id,
                subjectId: materia.id,
                lapso: '1',
                rows: puntos.map((p, i) => ({
                    rowType: 'EVALUATION',
                    weekNumber: i + 1,
                    title: `Evaluación ${i + 1}`,
                    actividadEval: `Evaluación ${i + 1}`,
                    puntos: p,
                    tipoEvaluacion: 'OTHER',
                })),
            });
    };

    it('MAPA-10: un plan que suma 20 se guarda', async () => {
        const res = await guardarPlan([5, 5, 5, 5]);
        expect(res.status).toBe(200);
    }, 120000);

    it('MAPA-11: un plan que no suma 20 se rechaza, y dice cuánto suma', async () => {
        // Un plan que suma 18 deja al alumno con dos puntos que no puede
        // ganar en ningún sitio. Por eso se rechaza al guardar y no después.
        const res = await guardarPlan([5, 5, 5, 3]);

        expect(res.status).toBeGreaterThanOrEqual(400);
        // El mensaje tiene que traer el número, o el profesor no sabe qué
        // arreglar.
        expect(JSON.stringify(res.body)).toMatch(/20|18/);
    }, 120000);

    it('MAPA-12: la tolerancia de centésimas del mapa se respeta', async () => {
        // "Distribuir equitativamente" entre 3 deja 6,66 + 6,66 + 6,68. El mapa
        // admite hasta 0,009 de diferencia justo para que eso entre.
        const res = await guardarPlan([6.66, 6.66, 6.68]);
        expect(res.status).toBe(200);
    }, 120000);
});
