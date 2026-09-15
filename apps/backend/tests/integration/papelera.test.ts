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
 * LA PAPELERA — NADA SE BORRA DE VERDAD
 *
 * Lo que se comprueba aquí no es que el borrado funcione (eso ya se prueba en
 * otro sitio), sino que **antes de borrar queda una copia completa**.
 *
 * El caso que duele: un admin borra a un estudiante por error. Eso se lleva sus
 * notas, sus asistencias, sus observaciones y su historial académico. Sin copia,
 * lo único que queda es el respaldo de anoche — y restaurarlo borra todo lo que
 * el liceo hizo hoy.
 *
 * También se comprueba lo contrario: que las sesiones NO se guarden. Una llave
 * de casa guardada "por si acaso" es una llave de casa perdida.
 */

const SLUG = 'test-institute';
const gId = () => {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
};

describe('La papelera — nada se borra de verdad', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;

    let admin: any;
    let profesor: any;
    let alumno: any;
    const tokens: Record<string, string> = {};

    let year: any;
    let period: any;
    let classroom: any;
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
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;

        tokens.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tokens.profesor = generateTestToken(profesor.id, UserRole.TEACHER, 'institute');

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
                name: 'Papelera A',
                slug: `pap-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                grade: 1,
                section: 'A',
                capacity: 30,
                academicYearId: year.id,
                instituteId: 'institute',
                teacherId: profesor.id,
            },
        });

        subject = await createTestSubject(prisma, 'institute');
        await prisma.classroomSubject.create({
            data: { classroomId: classroom.id, subjectId: subject.id, teacherId: profesor.id, weeklyBlocks: 3 },
        });
        await prisma.studentClassroom.create({
            data: { studentId: alumno.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });

        actividad = await prisma.activity.create({
            data: {
                title: 'Evaluación de papelera',
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
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    /** Cada estudiante solo puede tener una nota por actividad: cada prueba usa la suya. */
    const nuevaActividad = (titulo: string) =>
        prisma.activity.create({
            data: {
                title: titulo,
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

    const nuevaNota = async (score: number, studentId = alumno.id, activityId?: string) => {
        const sobre = activityId ?? (await nuevaActividad(`Actividad ${gId()}`)).id;
        return prisma.grade.create({
            data: {
                id: gId(),
                score,
                comments: 'nota de prueba',
                studentId,
                activityId: sobre,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: profesor.id,
            } as any,
        });
    };

    const enPapelera = (tabla: string, registroId: string) =>
        (prisma as any).registroBorrado.findFirst({ where: { tabla, registroId } });

    /**
     * MIRAR LA RESPUESTA DEL BORRADO, SIEMPRE
     *
     * PAP-01 y PAP-02 fallaban una de cada tres tandas completas y pasaban
     * siempre a solas. El motivo de fondo era invisible porque la prueba
     * llamaba a borrar y **no miraba lo que el servidor contestaba**: cuando el
     * borrado fallaba, lo único que se veía era "no hay copia en la papelera",
     * que apunta a la papelera cuando el problema estaba antes.
     *
     * Esta ayuda exige que el borrado haya salido bien y, si no, enseña el
     * código y el cuerpo de la respuesta. Una prueba que no mira la respuesta de
     * lo que pidió no puede decir por qué falló.
     */
    const borrarYComprobar = async (url: string, quien = 'admin') => {
        const res = await como(quien)(request(server.server).delete(url));
        if (![200, 204].includes(res.status)) {
            throw new Error(
                `DELETE ${url} respondió ${res.status}: ${JSON.stringify(res.body)}`
            );
        }
        return res;
    };

    it('PAP-01: borrar una nota deja una copia completa', async () => {
        const nota = await nuevaNota(17);

        await borrarYComprobar(`/api/grades/${nota.id}`);

        // Ya no está donde estaba
        expect(await prisma.grade.findUnique({ where: { id: nota.id } })).toBeNull();

        // Pero está guardada, entera
        const copia = await enPapelera('grade', nota.id);
        expect(copia).toBeTruthy();
        expect(copia.contenido.id).toBe(nota.id);
        expect(Number(copia.contenido.score)).toBe(17);
        expect(copia.contenido.studentId).toBe(alumno.id);
        expect(copia.contenido.activityId).toBe(nota.activityId);
        expect(copia.contenido.comments).toBe('nota de prueba');
    });

    it('PAP-02: la copia alcanza para volver a crear la fila tal cual', async () => {
        const nota = await nuevaNota(11);
        const antes = { ...nota } as any;

        await borrarYComprobar(`/api/grades/${nota.id}`);
        const copia = await enPapelera('grade', nota.id);
        expect(copia).toBeTruthy();

        // Se restaura desde lo guardado, sin inventar nada
        const c = copia.contenido;
        const restaurada = await prisma.grade.create({
            data: {
                id: c.id,
                score: c.score,
                comments: c.comments,
                studentId: c.studentId,
                activityId: c.activityId,
                periodId: c.periodId,
                subjectId: c.subjectId,
                teacherId: c.teacherId,
            } as any,
        });

        expect(restaurada.id).toBe(antes.id);
        expect(Number((restaurada as any).score)).toBe(Number(antes.score));
        expect(restaurada.studentId).toBe(antes.studentId);
    });

    it('PAP-03: queda anotado quién borró y desde dónde', async () => {
        const nota = await nuevaNota(9);
        await borrarYComprobar(`/api/grades/${nota.id}`);

        const copia = await enPapelera('grade', nota.id);
        expect(copia.borradoPor).toBe(admin.id);
        expect(copia.motivo).toContain('/api/grades/');
    });

    it('PAP-04: borrar un estudiante guarda todo lo suyo, no solo su ficha', async () => {
        const victima = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({
            data: { studentId: victima.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });

        const suNota = await nuevaNota(19, victima.id);
        const suAsistencia = await prisma.dailyAttendance.create({
            data: {
                id: gId(),
                studentId: victima.id,
                date: new Date('2026-09-11'),
                status: 'PRESENT',
                classroomId: classroom.id,
                teacherId: profesor.id,
            } as any,
        });
        const suObservacion = await prisma.observation.create({
            data: {
                id: gId(),
                studentId: victima.id,
                title: 'Observación de prueba',
                description: 'texto',
                createdById: profesor.id,
                instituteId: 'institute',
            } as any,
        });

        const res = await como('admin')(request(server.server).delete(`/api/users/${victima.id}`));
        expect([200, 204]).toContain(res.status);

        // El estudiante ya no está
        expect(await prisma.user.findUnique({ where: { id: victima.id } })).toBeNull();

        // Y todo lo suyo quedó guardado
        expect(await enPapelera('user', victima.id)).toBeTruthy();
        expect(await enPapelera('grade', suNota.id)).toBeTruthy();
        expect(await enPapelera('dailyAttendance', suAsistencia.id)).toBeTruthy();
        expect(await enPapelera('observation', suObservacion.id)).toBeTruthy();

        // La nota guardada conserva el valor, no solo el id
        const copiaNota = await enPapelera('grade', suNota.id);
        expect(Number(copiaNota.contenido.score)).toBe(19);
    });

    it('PAP-05: las sesiones NO se guardan en la papelera', async () => {
        const victima = (await createTestUser(prisma, UserRole.STUDENT)).user;
        const sesion = await prisma.refreshToken.create({
            data: {
                id: gId(),
                token: `tk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                userId: victima.id,
                expiresAt: new Date(Date.now() + 86400000),
            } as any,
        });

        await como('admin')(request(server.server).delete(`/api/users/${victima.id}`));

        // Guardar llaves de casa "por si acaso" es perderlas.
        expect(await enPapelera('refreshToken', sesion.id)).toBeNull();
        // Pero la persona sí se guarda
        expect(await enPapelera('user', victima.id)).toBeTruthy();
    });

    it('PAP-06: borrar una actividad guarda también las notas que se lleva por delante', async () => {
        const otraActividad = await nuevaActividad('Actividad que se borra');

        const notaCondenada = await nuevaNota(15, alumno.id, otraActividad.id);

        const res = await como('admin')(
            request(server.server).delete(`/api/activities/${otraActividad.id}`)
        );
        expect([200, 204]).toContain(res.status);

        expect(await enPapelera('activity', otraActividad.id)).toBeTruthy();
        expect(await enPapelera('grade', notaCondenada.id)).toBeTruthy();
    });
});
