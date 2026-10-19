import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken, createTestSubject } from '../helpers';

/**
 * LAS PUERTAS VIEJAS TAMBIÉN CUMPLEN LAS REGLAS (19-oct-2026)
 *
 * Rutas que ya ninguna pantalla usa, pero que el admin puede llamar (las
 * encontró `acciones-sin-prueba.ts --probadas`: solo se probaban por su
 * rechazo). Una puerta que nadie mira es por donde se rompe una regla:
 *
 *   VIEJA-01 quitar una materia de un grado o de una sección con trabajo:
 *            409 CLASE_CON_TRABAJO, como en Materias → «Dónde se da»; sin trabajo, se quita con copia
 *   VIEJA-02 mover un bloque del horario solo cambia el día, la hora, el aula y la nota:
 *            ni la sección ni la clase (eso se saltaba la comprobación de choques)
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;

describe('Las puertas viejas también cumplen las reglas', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tk: string;
    let ano: any;
    const api = (r: request.Test) => r.set('Authorization', `Bearer ${tk}`).set('X-Institute-Slug', SLUG);

    const seccion = (nombre: string) =>
        prisma.classroom.create({ data: { id: gId(), name: `4to ${nombre}`, slug: `4-${nombre}-${gId()}`, grade: 4, section: nombre, capacity: 30, academicYearId: ano.id, instituteId: 'institute' } as any });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        tk = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        await prisma.academicYear.updateMany({ data: { status: 'COMPLETED' as any, isActive: false } });
        ano = await prisma.academicYear.create({
            data: { id: gId(), name: `Viejas-${gId().slice(0, 5)}`, status: 'ACTIVE' as any, isActive: true, startDate: new Date('2026-09-15'), endDate: new Date('2027-07-15'), instituteId: 'institute' },
        });
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('VIEJA-01: con trabajo no se quita (ni por grado ni por sección); sin trabajo, sí, con copia', async () => {
        const materia = await createTestSubject(prisma, 'institute');
        const [a, b] = [await seccion('A'), await seccion('B')];
        await prisma.classroomSubject.createMany({ data: [{ classroomId: a.id, subjectId: materia.id }, { classroomId: b.id, subjectId: materia.id }] });
        // En 4to A ya hay una actividad.
        await prisma.classActivity.create({ data: { classroomId: a.id, subjectId: materia.id, title: 'Exposición', target: 'CURRENT', scores: {} } as any });

        const porGrado = await api(request(server.server).delete(`/api/subjects/grade/4/${materia.id}?academicYearId=${ano.id}`));
        expect([porGrado.status, porGrado.body.code]).toEqual([409, 'CLASE_CON_TRABAJO']);
        const porSeccion = await api(request(server.server).delete(`/api/classrooms/${a.id}/subjects/${materia.id}`));
        expect([porSeccion.status, porSeccion.body.code]).toEqual([409, 'CLASE_CON_TRABAJO']);
        expect(await prisma.classroomSubject.count({ where: { subjectId: materia.id } })).toBe(2); // no se quitó NADA

        // 4to B no tiene trabajo: se quita, con copia.
        expect((await api(request(server.server).delete(`/api/classrooms/${b.id}/subjects/${materia.id}`))).status).toBe(200);
        expect(await prisma.classroomSubject.count({ where: { subjectId: materia.id } })).toBe(1);
        expect(await prisma.registroBorrado.count({ where: { tabla: 'classroomSubject' } })).toBeGreaterThanOrEqual(1);
    }, 60000);

    it('VIEJA-02: mover un bloque no le cambia la sección ni la clase', async () => {
        const materia = await createTestSubject(prisma, 'institute');
        const otra = await createTestSubject(prisma, 'institute');
        const [a, b] = [await seccion('C'), await seccion('D')];
        const cs = await prisma.classroomSubject.create({ data: { classroomId: a.id, subjectId: materia.id } });
        const ajena = await prisma.classroomSubject.create({ data: { classroomId: b.id, subjectId: otra.id } });
        const bloque = await prisma.scheduleBlock.create({ data: { classroomId: a.id, classroomSubjectId: cs.id, dayOfWeek: 1, startTime: '07:00', endTime: '07:45', blockType: 'CLASS' } });

        const r = await api(request(server.server).put(`/api/schedules/blocks/${bloque.id}`)).send({
            dayOfWeek: 2,
            startTime: '08:30',
            endTime: '09:15',
            location: 'Aula 9',
            classroomId: b.id,
            classroomSubjectId: ajena.id,
        });
        expect(r.status).toBe(200);
        const ahora = await prisma.scheduleBlock.findUnique({ where: { id: bloque.id } });
        expect(ahora).toMatchObject({ dayOfWeek: 2, startTime: '08:30', endTime: '09:15', location: 'Aula 9', classroomId: a.id, classroomSubjectId: cs.id });
    }, 60000);
});
