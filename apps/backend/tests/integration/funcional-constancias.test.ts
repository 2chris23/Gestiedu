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
import { RedisCache } from '../../src/config/redis';

/**
 * LAS CONSTANCIAS DE ESTUDIO Y DE BUENA CONDUCTA
 *
 * Lo que más le piden a control de estudios después de la boleta. Gestiedu
 * tenía todos los datos (quién está inscrito, en qué año y sección) y no
 * sacaba ninguna: la secretaría las hacía a mano en un procesador de texto.
 *
 *   CONS-01  la de estudio trae el alumno, su año, sección y el ciclo, y
 *            quién firma (lo pone el liceo en su configuración);
 *   CONS-02  la de estudio la sacan el admin, el alumno y su representante;
 *            la de conducta, solo el admin; nadie más;
 *   CONS-03  a un retirado no se le hace constar que estudia (409); la de
 *            conducta sí se le da, diciendo que estudió aquí;
 *   CONS-04  un tipo que no existe es 400, no 500;
 *   CONS-05  guardar quién firma desde la pantalla de Configuración llega a
 *            la constancia, y solo se guardan los campos conocidos.
 */

const SLUG = 'test-institute';
const gId = () => `c${createId()}`;
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('Las constancias (CONS-01…05)', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let profe: any;
    let alumno: any;
    let otroAlumno: any;
    let tutor: any;
    let inscripcion: any;
    let year: any;

    const como = (u: any, role: UserRole) => ({
        Authorization: `Bearer ${generateTestToken(u.id, role, 'institute')}`,
        'X-Institute-Slug': SLUG,
    });
    const constancia = (u: any, role: UserRole, tipo = 'ESTUDIO', de = alumno.id) =>
        request(server.server).get(`/api/students/${de}/constancia?tipo=${tipo}`).set(como(u, role));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.update({ where: { id: 'institute' }, data: { academicConfig: {} } }).catch(() => undefined);
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await RedisCache.clearPattern('*').catch(() => undefined);
        await platformPrisma.institute.update({
            where: { id: 'institute' },
            data: {
                academicConfig: {
                    notaMinimaAprobatoria: 10,
                    documentos: { firmanteNombre: 'Carmen Rojas', firmanteCedula: 'V-9.876.543', codigoDea: 'OD12345678' },
                },
            },
        });

        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        year = await prisma.academicYear.create({
            data: { id: gId(), name: '2026-2027', startDate: dia('2026-09-15'), endDate: dia('2027-07-15'), isActive: true, status: 'ACTIVE', instituteId: 'institute' } as any,
        });
        const seccion = await prisma.classroom.create({
            data: { id: gId(), name: '3er Año B', slug: `aula-${gId()}`, grade: 3, section: 'B', capacity: 30, academicYearId: year.id, instituteId: 'institute', teacherId: profe.id, shift: 'TARDE' } as any,
        });
        alumno = (await createTestUser(prisma, UserRole.STUDENT, { firstName: 'Lucía', lastName: 'Pérez' })).user;
        otroAlumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
        inscripcion = await prisma.studentClassroom.create({
            data: { id: gId(), studentId: alumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
        await prisma.studentClassroom.create({
            data: { id: gId(), studentId: otroAlumno.id, classroomId: seccion.id, academicYearId: year.id, isActive: true },
        });
        tutor = (await createTestUser(prisma, UserRole.TUTOR)).user;
        await prisma.studentTutor.create({ data: { studentId: alumno.id, tutorId: tutor.id, relationship: 'Madre' } });
    }, 180000);

    it('CONS-01: la de estudio trae alumno, año, sección, ciclo y firmante', async () => {
        const c = (await constancia(admin, UserRole.ADMIN).expect(200)).body.data;
        expect(c.tipo).toBe('ESTUDIO');
        expect(c.alumno).toEqual({ cedula: alumno.id, nombres: 'Lucía', apellidos: 'Pérez' });
        expect(c.seccion).toEqual({ grado: 3, seccion: 'B', turno: 'TARDE' });
        expect(c.ciclo.nombre).toBe('2026-2027');
        expect(c.vigente).toBe(true);
        expect(c.nivel).toBe('Educación Media General');
        expect(c.firmante).toEqual({ nombre: 'Carmen Rojas', cedula: 'V-9.876.543', cargo: 'Director(a)' });
        expect(c.liceo.codigoDea).toBe('OD12345678');
        expect(c.emitidaEl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }, 60000);

    it('CONS-02: estudio: admin, alumno y representante; conducta: solo el admin', async () => {
        await constancia(admin, UserRole.ADMIN).expect(200);
        await constancia(alumno, UserRole.STUDENT).expect(200);
        await constancia(tutor, UserRole.TUTOR).expect(200);
        await constancia(otroAlumno, UserRole.STUDENT).expect(403);
        await constancia(profe, UserRole.TEACHER).expect(403);
        const { user: otroTutor } = await createTestUser(prisma, UserRole.TUTOR);
        await constancia(otroTutor, UserRole.TUTOR).expect(403);

        await constancia(admin, UserRole.ADMIN, 'BUENA_CONDUCTA').expect(200);
        await constancia(alumno, UserRole.STUDENT, 'BUENA_CONDUCTA').expect(403);
        await constancia(tutor, UserRole.TUTOR, 'BUENA_CONDUCTA').expect(403);
        await constancia(profe, UserRole.TEACHER, 'BUENA_CONDUCTA').expect(403);
    }, 60000);

    it('CONS-03: al retirado no se le hace constar que estudia; la de conducta dice que estudió', async () => {
        await prisma.studentClassroom.update({ where: { id: inscripcion.id }, data: { isActive: false } });
        const res = await constancia(admin, UserRole.ADMIN).expect(409);
        expect(res.body.code).toBe('NO_INSCRITO');

        const c = (await constancia(admin, UserRole.ADMIN, 'BUENA_CONDUCTA').expect(200)).body.data;
        expect(c.vigente).toBe(false);
        expect(c.seccion.grado).toBe(3);

        // Un ciclo cerrado tampoco es «cursa».
        await prisma.studentClassroom.update({ where: { id: inscripcion.id }, data: { isActive: true } });
        await prisma.academicYear.update({ where: { id: year.id }, data: { status: 'COMPLETED' as any, isActive: false } });
        await constancia(admin, UserRole.ADMIN).expect(409);
    }, 60000);

    it('CONS-04: un tipo que no existe es 400, y un alumno que no existe, 404', async () => {
        await constancia(admin, UserRole.ADMIN, 'NOTAS_CERTIFICADAS').expect(400);
        await constancia(admin, UserRole.ADMIN, 'ESTUDIO', 'V-00000000').expect(404);
    }, 60000);

    it('CONS-05: quién firma se guarda desde Configuración y llega a la constancia', async () => {
        await request(server.server)
            .put('/api/institutes/current/config')
            .set(como(admin, UserRole.ADMIN))
            .send({
                configuration: {
                    gradeScale: { min: 0, max: 20 },
                    passingGrade: 10,
                    documentos: { firmanteNombre: '  José Díaz ', firmanteCargo: 'Director encargado', codigoDea: '', otraCosa: 'x' },
                },
            })
            .expect(200);
        const guardada = (await platformPrisma.institute.findUnique({ where: { id: 'institute' }, select: { academicConfig: true } }))!
            .academicConfig as any;
        expect(guardada.documentos).toEqual({ firmanteNombre: 'José Díaz', firmanteCargo: 'Director encargado' });

        const c = (await constancia(admin, UserRole.ADMIN).expect(200)).body.data;
        expect(c.firmante).toEqual({ nombre: 'José Díaz', cedula: null, cargo: 'Director encargado' });
        expect(c.liceo.codigoDea).toBeNull();
    }, 60000);
});
