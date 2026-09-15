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
 * LA ASISTENCIA MÍNIMA LA PONE EL LICEO, NO EL CÓDIGO
 *
 * El panel del representante enciende un aviso —"Asistencia baja: 75%"— cuando
 * su hijo falta demasiado. Ese "demasiado" estaba escrito a mano en el código:
 *
 *     .filter(c => ... || c.attendancePercentage < 80)
 *
 * Un 80 fijo para todos los liceos. Un liceo con turnos partidos y otro rural
 * con dos horas de camino no tienen el mismo criterio, y ninguno podía cambiarlo
 * sin tocar el programa.
 *
 * Ahora es `asistenciaMinima` en la configuración del liceo, con 80 de partida
 * para que nada cambie de sitio. Estas pruebas son la garantía de que el número
 * que se guarda es el que se usa.
 *
 * ─── LO QUE ESTE NÚMERO NO HACE ──────────────────────────────────────────────
 *
 * Solo enciende el aviso. No reprueba a nadie, no entra en el promedio y no
 * decide la promoción — eso es `notaMinimaAprobatoria`, que es otra cosa. Se
 * comprueba aquí abajo, porque confundir las dos sería grave.
 */

const SLUG = 'test-institute';

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('La asistencia mínima la pone el liceo', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let tutor: any;
    let alumno: any;
    let profe: any;
    let admin: any;
    let seccion: any;
    let tokenTutor: string;
    let tokenAdmin: string;

    const auth = (token: string) => ({
        Authorization: `Bearer ${token}`,
        'X-Institute-Slug': SLUG,
    });

    /** Deja la configuración académica tal cual se le diga. */
    const configurar = (academicConfig: Record<string, unknown>) =>
        platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig } });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        // La configuración vive en la base de plataforma, que es compartida:
        // se deja como estaba.
        await configurar({}).catch(() => {});
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await configurar({});

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokenTutor = generateTestToken(tutor.id, UserRole.TUTOR, 'institute');
        tokenAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');

        // Un ciclo y un lapso que contengan el día de hoy: el panel del
        // representante mira el lapso EN CURSO, no toda la vida escolar.
        const hoy = new Date();
        const desde = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
        const hasta = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);

        const year = await prisma.academicYear.create({
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

        await prisma.period.create({
            data: {
                id: gId(),
                name: 'Lapso en curso',
                startDate: desde,
                endDate: hasta,
                isActive: true,
                academicYearId: year.id,
            },
        });

        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: '1er Grado A',
                slug: `aula-${gId()}`,
                grade: 1,
                section: 'A',
                academicYearId: year.id,
                instituteId: 'institute',
            } as any,
        });

        await prisma.studentClassroom.create({
            data: {
                id: gId(),
                studentId: alumno.id,
                classroomId: seccion.id,
                academicYearId: year.id,
                isActive: true,
            },
        });

        await prisma.studentTutor.create({
            data: {
                id: gId(),
                studentId: alumno.id,
                tutorId: tutor.id,
                relationship: 'Madre',
            },
        });

        // Cuatro días: tres presente, uno ausente → 75% exacto.
        const dias = [0, 1, 2, 3].map((i) => new Date(hoy.getTime() - (i + 1) * 24 * 60 * 60 * 1000));
        await prisma.dailyAttendance.createMany({
            data: dias.map((date, i) => ({
                id: gId(),
                date,
                status: (i === 0 ? 'ABSENT' : 'PRESENT') as any,
                studentId: alumno.id,
                classroomId: seccion.id,
                teacherId: profe.id,
            })),
        });
    }, 120000);

    /** Los avisos que le salen al representante en su panel. */
    const avisosDelRepresentante = async () => {
        const res = await request(server.server)
            .get('/api/dashboard/tutor')
            .set(auth(tokenTutor))
            .expect(200);

        const datos = res.body.data ?? res.body;
        return {
            asistencia: datos.children?.[0]?.attendancePercentage,
            alertas: (datos.alerts ?? []) as Array<{ type: string; message: string }>,
        };
    };

    const avisosDeAsistencia = (alertas: Array<{ type: string }>) =>
        alertas.filter((a) => a.type === 'ATTENDANCE');

    // ─────────────────────────────────────────────────────────────────────────
    // EL VALOR DE PARTIDA NO CAMBIA NADA
    // ─────────────────────────────────────────────────────────────────────────

    it('ASI-01: sin configurar nada, sigue avisando por debajo del 80%', async () => {
        const { asistencia, alertas } = await avisosDelRepresentante();

        // Primero que el número medido sea el que se espera: si esto falla, lo
        // que falla es la asistencia, no el umbral.
        expect(asistencia).toBe(75);
        expect(avisosDeAsistencia(alertas)).toHaveLength(1);
        expect(avisosDeAsistencia(alertas)[0].message).toContain('75');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Y SI EL LICEO LO CAMBIA, MANDA EL LICEO
    // ─────────────────────────────────────────────────────────────────────────

    it('ASI-02: si el liceo baja la mínima a 60, un 75% ya no enciende el aviso', async () => {
        await configurar({ asistenciaMinima: 60 });

        const { asistencia, alertas } = await avisosDelRepresentante();

        expect(asistencia).toBe(75);
        expect(avisosDeAsistencia(alertas)).toHaveLength(0);
    });

    it('ASI-03: si el liceo la sube a 90, ese mismo 75% sí lo enciende', async () => {
        await configurar({ asistenciaMinima: 90 });

        const { alertas } = await avisosDelRepresentante();

        expect(avisosDeAsistencia(alertas)).toHaveLength(1);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // LO QUE SE GUARDA TIENE QUE SER UN PORCENTAJE
    // ─────────────────────────────────────────────────────────────────────────

    it('ASI-04: el admin puede cambiarla desde la pantalla de configuración', async () => {
        await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .send({ asistenciaMinima: 65 })
            .expect(200);

        const res = await request(server.server)
            .get('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .expect(200);

        expect(res.body.data.asistenciaMinima).toBe(65);

        // Y lo guardado es lo que se usa, no solo lo que se muestra.
        const { alertas } = await avisosDelRepresentante();
        expect(avisosDeAsistencia(alertas)).toHaveLength(0);
    });

    /**
     * LA PANTALLA GUARDA POR OTRA PUERTA
     *
     * *Configuración → Académica* no llama a `/academic-config`: manda todo
     * junto a `/current/config` dentro de `configuration`. Son dos caminos
     * distintos hasta el mismo campo, y este repo ya tuvo un fallo de esta
     * familia (una ruta que respondía `{}` porque Fastify descartaba lo que no
     * estaba declarado en el esquema). Así que el camino de la pantalla se
     * prueba aparte, no se da por bueno porque funcione el otro.
     */
    it('ASI-4B: guardar desde la pantalla de Configuración también la cambia', async () => {
        await request(server.server)
            .put('/api/institutes/current/config')
            .set(auth(tokenAdmin))
            .send({
                configuration: {
                    gradeScale: { min: 0, max: 20 },
                    passingGrade: 10,
                    asistenciaMinima: 55,
                    language: 'es',
                },
            })
            .expect(200);

        const res = await request(server.server)
            .get('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .expect(200);

        expect(res.body.data.asistenciaMinima).toBe(55);

        // Y llega hasta el panel del representante, que es lo que se ve.
        const { alertas } = await avisosDelRepresentante();
        expect(avisosDeAsistencia(alertas)).toHaveLength(0);
    });

    it('ASI-05: un valor que no es un porcentaje no se guarda; se queda el que había', async () => {
        await configurar({ asistenciaMinima: 90 });

        for (const disparate of [150, -10, 'mucho', null]) {
            await request(server.server)
                .put('/api/institutes/current/academic-config')
                .set(auth(tokenAdmin))
                .send({ asistenciaMinima: disparate });
        }

        const res = await request(server.server)
            .get('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .expect(200);

        expect(res.body.data.asistenciaMinima).toBe(90);
    });

    it('ASI-06: un profesor no puede cambiar la configuración del liceo', async () => {
        const tokenProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');

        const res = await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(auth(tokenProfe))
            .send({ asistenciaMinima: 10 });

        expect(res.status).toBeGreaterThanOrEqual(400);

        const despues = await request(server.server)
            .get('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .expect(200);

        expect(despues.body.data.asistenciaMinima).toBe(80);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // NO SE CONFUNDE CON LA NOTA MÍNIMA
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────
    // EL MISMO NÚMERO MANDA EN LOS MEDIDORES DE LA SECCIÓN
    //
    // Había un SEGUNDO 80 fijo, en otro archivo, contando "alumnos con
    // asistencia baja" en los medidores que ven el profesor y el admin. Si solo
    // se hubiera cambiado el del panel del representante, el liceo tendría dos
    // criterios distintos para lo mismo según qué pantalla mires.
    // ─────────────────────────────────────────────────────────────────────────

    it('ASI-08: los medidores de la sección usan la misma asistencia mínima del liceo', async () => {
        const bajosConUmbral = async (umbral: number) => {
            await configurar({ asistenciaMinima: umbral });
            const res = await request(server.server)
                .get(`/api/statistics/section/${seccion.id}`)
                .set(auth(tokenAdmin));
            if (res.status !== 200) return null;
            return (res.body.data ?? res.body).studentsWithLowAttendance;
        };

        const con60 = await bajosConUmbral(60);
        const con90 = await bajosConUmbral(90);

        // Si la ruta no existe con ese nombre, no se inventa un verde.
        if (con60 === null || con90 === null) {
            throw new Error('No se pudo consultar los medidores de la sección');
        }

        // El alumno va al 75%: con la mínima en 60 no cuenta, con 90 sí.
        expect(con60).toBe(0);
        expect(con90).toBe(1);
    });

    it('ASI-07: cambiar la asistencia mínima no toca la nota mínima aprobatoria', async () => {
        await configurar({ notaMinimaAprobatoria: 12, asistenciaMinima: 80 });

        await request(server.server)
            .put('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .send({ asistenciaMinima: 50 })
            .expect(200);

        const res = await request(server.server)
            .get('/api/institutes/current/academic-config')
            .set(auth(tokenAdmin))
            .expect(200);

        expect(res.body.data.asistenciaMinima).toBe(50);
        expect(res.body.data.notaMinimaAprobatoria).toBe(12);
    });
});
