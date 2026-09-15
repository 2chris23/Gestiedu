import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestSubject,
} from '../helpers';
import { borrarGuardandoCopia, topeDeLaPapelera } from '../../src/utils/papelera';

/**
 * LA PAPELERA TIENE QUE ALCANZAR A LO QUE SE LLEVA LA CASCADA
 *
 * `papelera.test.ts` ya comprobaba que borrar una fila deja su copia. Lo que no
 * comprobaba nadie —y era el agujero— es **lo que se va con ella sin que nadie
 * lo nombre**.
 *
 * PostgreSQL borra en cascada. Al borrar una materia se van con ella todas sus
 * notas, su plan de evaluación, sus horarios y sus sesiones de clase. La
 * papelera guardaba la materia. De las notas, ni rastro.
 *
 * O sea: la promesa «nada se borra de verdad» se cumplía para la fila que se
 * nombra y se rompía justo para lo que más duele perder. Un clic por error en
 * «eliminar materia» borraba las notas de todos los alumnos que la cursan, y en
 * la papelera quedaba la materia sola.
 *
 * Aquí se comprueba con datos de verdad: se cuentan las notas, se borra la
 * materia, y se busca cada nota en la papelera.
 */

const gId = () => `c${createId()}`;

describe('La papelera alcanza a lo que se lleva la cascada', () => {
    let server: any;
    let prisma: PrismaClient;

    let profe: any;
    let alumnos: any[] = [];
    let year: any;
    let period: any;
    let seccion: any;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        for (let i = 0; i < 3; i++) {
            alumnos.push((await createTestUser(prisma, UserRole.STUDENT)).user);
        }

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

        seccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Cascada A',
                slug: `cascada-${gId()}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId: profe.id,
            },
        });
    }, 180000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    /** Una materia con su actividad y una nota por alumno. */
    async function materiaConNotas() {
        const materia = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: seccion.id, subjectId: materia.id, teacherId: profe.id, weeklyBlocks: 4 },
        });

        const actividad = await prisma.activity.create({
            data: {
                title: 'Examen',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2026-09-10'),
                maxGrade: 20,
                weight: 1,
                classroomId: seccion.id,
                subjectId: materia.id,
                periodId: period.id,
                lapso: '1',
                createdBy: profe.id,
                instituteId: 'institute',
            },
        });

        const notas = [];
        for (const alumno of alumnos) {
            notas.push(
                await prisma.grade.create({
                    data: {
                        id: gId(),
                        score: 15,
                        studentId: alumno.id,
                        activityId: actividad.id,
                        subjectId: materia.id,
                        periodId: period.id,
                        teacherId: profe.id,
                    },
                })
            );
        }
        return { materia, actividad, notas };
    }

    const enLaPapelera = (registroId: string) =>
        prisma.registroBorrado.count({ where: { registroId } });

    it('CASCADA-01: borrar una materia guarda copia de la materia Y de todas sus notas', async () => {
        const { materia, notas } = await materiaConNotas();

        await borrarGuardandoCopia(prisma, 'subject', { id: materia.id }, { motivo: 'prueba' });

        // La materia ya no está...
        expect(await prisma.subject.count({ where: { id: materia.id } })).toBe(0);
        // ...y sus notas tampoco: se las llevó la cascada.
        for (const nota of notas) {
            expect(await prisma.grade.count({ where: { id: nota.id } })).toBe(0);
        }

        // Pero están TODAS guardadas. Esto es lo que antes no pasaba.
        expect(await enLaPapelera(materia.id)).toBe(1);
        for (const nota of notas) {
            expect(await enLaPapelera(nota.id)).toBe(1);
        }
    }, 120000);

    it('CASCADA-02: la copia guarda la nota entera, no solo su identificador', async () => {
        const { materia, notas } = await materiaConNotas();
        await prisma.grade.update({ where: { id: notas[0].id }, data: { score: 19.5 } });

        await borrarGuardandoCopia(prisma, 'subject', { id: materia.id }, { motivo: 'prueba' });

        const copia = await prisma.registroBorrado.findFirst({
            where: { registroId: notas[0].id },
            select: { tabla: true, contenido: true },
        });
        expect(copia).not.toBeNull();
        // Con el nombre que usa Prisma, que es por el que se busca al restaurar.
        expect(copia!.tabla).toBe('grade');
        expect(Number((copia!.contenido as any).score)).toBe(19.5);
        expect((copia!.contenido as any).studentId).toBe(alumnos[0].id);
    }, 120000);

    it('CASCADA-03: también alcanza a los nietos, no solo a los hijos', async () => {
        // Dos niveles de verdad: el año escolar se lleva sus secciones, y cada
        // sección se lleva su asistencia. La asistencia no cuelga del año: es
        // nieta, y es justo la que nadie estaba copiando.
        const otroAnio = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: '2030-2031',
                startDate: new Date('2030-09-01'),
                endDate: new Date('2031-07-15'),
                status: 'UPCOMING',
                instituteId: 'institute',
            },
        });

        const suSeccion = await prisma.classroom.create({
            data: {
                id: gId(),
                name: 'Cascada B',
                slug: `cascada-b-${gId()}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId: otroAnio.id,
                instituteId: 'institute',
            },
        });

        const asistencias = [];
        for (const alumno of alumnos) {
            asistencias.push(
                await prisma.dailyAttendance.create({
                    data: {
                        id: gId(),
                        studentId: alumno.id,
                        classroomId: suSeccion.id,
                        date: new Date('2030-09-15'),
                        status: 'PRESENT',
                        teacherId: profe.id,
                    },
                })
            );
        }

        await borrarGuardandoCopia(prisma, 'academicYear', { id: otroAnio.id }, { motivo: 'prueba' });

        // La cascada se lo llevó todo...
        expect(await prisma.classroom.count({ where: { id: suSeccion.id } })).toBe(0);
        for (const a of asistencias) {
            expect(await prisma.dailyAttendance.count({ where: { id: a.id } })).toBe(0);
        }

        // ...y de todo hay copia, incluida la nieta.
        expect(await enLaPapelera(otroAnio.id)).toBe(1);
        expect(await enLaPapelera(suSeccion.id)).toBe(1);
        for (const a of asistencias) {
            expect(await enLaPapelera(a.id)).toBe(1);
        }
    }, 120000);

    it('CASCADA-04: si la copia no cabe, NO se borra nada', async () => {
        // La regla de la casa: sin copia no hay borrado. Con el tope en 1, una
        // materia con tres notas ya no cabe.
        const { materia, notas } = await materiaConNotas();

        const antes = process.env.PAPELERA_MAX_FILAS;
        process.env.PAPELERA_MAX_FILAS = '1';
        try {
            await expect(
                borrarGuardandoCopia(prisma, 'subject', { id: materia.id }, { motivo: 'prueba' })
            ).rejects.toThrow(/papelera/i);
        } finally {
            if (antes === undefined) delete process.env.PAPELERA_MAX_FILAS;
            else process.env.PAPELERA_MAX_FILAS = antes;
        }

        // Y sigue todo en su sitio.
        expect(await prisma.subject.count({ where: { id: materia.id } })).toBe(1);
        for (const nota of notas) {
            expect(await prisma.grade.count({ where: { id: nota.id } })).toBe(1);
        }
    }, 120000);

    it('CASCADA-05: el tope se puede cambiar por instituto, no está fijo en el código', () => {
        const antes = process.env.PAPELERA_MAX_FILAS;
        try {
            delete process.env.PAPELERA_MAX_FILAS;
            expect(topeDeLaPapelera()).toBe(20000);
            process.env.PAPELERA_MAX_FILAS = '500';
            expect(topeDeLaPapelera()).toBe(500);
            process.env.PAPELERA_MAX_FILAS = 'lo-que-sea';
            expect(topeDeLaPapelera()).toBe(20000);
        } finally {
            if (antes === undefined) delete process.env.PAPELERA_MAX_FILAS;
            else process.env.PAPELERA_MAX_FILAS = antes;
        }
    });

    it('CASCADA-06: las sesiones y los avisos siguen fuera, a propósito', async () => {
        const alumno = alumnos[0];
        await prisma.refreshToken.create({
            data: {
                token: `t-${gId()}`,
                userId: alumno.id,
                expiresAt: new Date(Date.now() + 86400000),
            },
        });
        await prisma.notification.create({
            data: {
                id: gId(),
                recipientId: alumno.id,
                title: 'aviso',
                message: 'hola',
                type: 'SYSTEM',
                priority: 'LOW',
            },
        });

        const antes = await prisma.registroBorrado.count();
        await borrarGuardandoCopia(prisma, 'user', { id: alumno.id }, { motivo: 'prueba' });
        const despues = await prisma.registroBorrado.count();

        // Se guardó el alumno y lo suyo, pero ni una sesión ni un aviso.
        expect(despues).toBeGreaterThan(antes);
        const sesiones = await prisma.registroBorrado.count({ where: { tabla: 'refreshToken' } });
        const avisos = await prisma.registroBorrado.count({ where: { tabla: 'notification' } });
        expect(sesiones).toBe(0);
        expect(avisos).toBe(0);

        alumnos = alumnos.filter((a) => a.id !== alumno.id);
    }, 120000);
});
