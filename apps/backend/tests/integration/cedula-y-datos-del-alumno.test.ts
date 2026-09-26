import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    createTestUser,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
    generateTestToken,
} from '../helpers';

/**
 * LOS DATOS DEL ALUMNO PARA LOS DOCUMENTOS Y EL CAMBIO DE CÉDULA
 *
 *   CED-04  el admin guarda nacionalidad, lugar y entidad de nacimiento; una
 *           entidad inventada no se guarda; una cédula escolar se anota como tal.
 *   CED-05  cambiar la cédula (escolar → identidad) arrastra TODO lo suyo:
 *           matrícula, asistencia, notas de la clase en vivo (mapa JSON),
 *           «evaluado de otra forma», implicados de una clase, avisos; guarda
 *           la escolar y cierra sus sesiones.
 *   CED-06  solo el admin; confirmación distinta, cédula ocupada o la propia: no.
 */

const SLUG = 'test-institute';

describe('Datos del alumno y cambio de cédula', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let tkAdmin: string;
    let tkProfe: string;
    let admin: any;
    let profe: any;
    let seccion: any;
    let materia: any;
    let year: any;

    const cab = (t: string) => ({ Authorization: `Bearer ${t}`, 'X-Institute-Slug': SLUG });

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        year = await createTestAcademicYear(prisma, 'institute');
        seccion = await createTestClassroom(prisma, year.id, 'institute');
        materia = await createTestSubject(prisma, 'institute');
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tkAdmin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tkProfe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('CED-04: se guardan los datos para el Ministerio; una entidad inventada, no', async () => {
        const crear = await request(server.server)
            .post('/api/users')
            .set(cab(tkAdmin))
            .send({
                id: 'V11212345678',
                email: `ced04-${Date.now()}@test.local`,
                password: 'Clave-segura-1',
                firstName: 'Rosa',
                lastName: 'Pérez',
                role: 'STUDENT',
                nacionalidad: 'V',
                lugarDeNacimiento: 'Valencia',
                entidadDeNacimiento: 'Carabobo',
            });
        expect(crear.status).toBe(201);
        const rosa = await prisma.user.findUnique({ where: { id: 'V11212345678' } });
        expect(rosa).toMatchObject({ nacionalidad: 'V', lugarDeNacimiento: 'Valencia', entidadDeNacimiento: 'Carabobo', tipoDeCedula: 'ESCOLAR' });

        const mal = await request(server.server).put('/api/users/V11212345678').set(cab(tkAdmin)).send({ entidadDeNacimiento: 'Narnia' });
        expect(mal.status).toBe(400);

        const borrar = await request(server.server).put('/api/users/V11212345678').set(cab(tkAdmin)).send({ lugarDeNacimiento: '' });
        expect(borrar.status).toBe(200);
        const despues = await prisma.user.findUnique({ where: { id: 'V11212345678' } });
        expect(despues?.lugarDeNacimiento).toBeNull();
        expect(despues?.entidadDeNacimiento).toBe('Carabobo');
    });

    it('CED-05: cambiar la cédula arrastra todo lo suyo, guarda la escolar y cierra sus sesiones', async () => {
        const vieja = 'V10912345678';
        const nueva = 'V-30111222';
        const alumno = await prisma.user.create({
            data: { id: vieja, email: `ced05-${Date.now()}@test.local`, password: 'x', firstName: 'Luis', lastName: 'Mora', role: 'STUDENT', tipoDeCedula: 'ESCOLAR' } as any,
        });
        const otro = (await createTestUser(prisma, UserRole.STUDENT)).user;
        await prisma.studentClassroom.create({ data: { studentId: vieja, classroomId: seccion.id, academicYearId: year.id, isActive: true } });
        await prisma.dailyAttendance.create({ data: { studentId: vieja, classroomId: seccion.id, teacherId: profe.id, date: new Date('2026-09-21'), status: 'PRESENT' } as any });
        const actividad = await prisma.classActivity.create({
            data: {
                classroomId: seccion.id,
                subjectId: materia.id,
                title: 'Mapa conceptual',
                type: 'ACTIVIDAD',
                maxScore: 20,
                scores: { [vieja]: 17, [otro.id]: 12 },
                evaluadoDeOtraForma: { [vieja]: { metodo: 'Cuaderno' } },
            } as any,
        });
        await prisma.classSession.create({
            data: { classroomId: seccion.id, subjectId: materia.id, date: new Date('2026-09-21'), involvedStudentIds: [vieja, otro.id] } as any,
        });
        await prisma.notification.create({
            data: { title: 'Nota', message: 'x', type: 'GRADE', priority: 'LOW', recipientId: admin.id, data: { studentId: vieja, otro: `${vieja}9` } } as any,
        });
        await prisma.refreshToken.create({ data: { token: `tk-${Date.now()}`, userId: vieja, expiresAt: new Date(Date.now() + 864e5) } as any });

        const res = await request(server.server)
            .put(`/api/users/${vieja}/cedula`)
            .set(cab(tkAdmin))
            .send({ nueva, confirmacion: nueva, tipo: 'IDENTIDAD' });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ id: nueva, tipoDeCedula: 'IDENTIDAD', cedulaEscolar: vieja });

        expect(await prisma.user.findUnique({ where: { id: vieja } })).toBeNull();
        expect(await prisma.user.findUnique({ where: { id: nueva } })).toMatchObject({ firstName: 'Luis', cedulaEscolar: vieja });
        expect(await prisma.studentClassroom.count({ where: { studentId: nueva } })).toBe(1);
        expect(await prisma.dailyAttendance.count({ where: { studentId: nueva } })).toBe(1);

        const act: any = await prisma.classActivity.findUnique({ where: { id: actividad.id } });
        expect(act.scores).toEqual({ [nueva]: 17, [otro.id]: 12 });
        expect(act.evaluadoDeOtraForma).toEqual({ [nueva]: { metodo: 'Cuaderno' } });

        const sesion: any = await prisma.classSession.findFirst({ where: { classroomId: seccion.id, subjectId: materia.id } });
        expect(sesion.involvedStudentIds).toEqual([nueva, otro.id]);

        const aviso: any = await prisma.notification.findFirst({ where: { recipientId: admin.id, title: 'Nota' } });
        // Solo el valor exacto: «vieja + 9» es otro número y no se toca.
        expect(aviso.data).toEqual({ studentId: nueva, otro: `${vieja}9` });

        expect(await prisma.refreshToken.count({ where: { userId: { in: [vieja, nueva] } } })).toBe(0);
        expect(alumno.id).toBe(vieja);
    });

    it('CED-06: solo el admin; confirmación distinta, cédula ocupada o la propia, no', async () => {
        const a = (await createTestUser(prisma, UserRole.STUDENT)).user;
        // Con una cédula de verdad: la de los usuarios de prueba es un id largo.
        const b = await prisma.user.create({
            data: { id: 'V-37777777', email: `ced06-${Date.now()}@test.local`, password: 'x', firstName: 'Ana', lastName: 'Gil', role: 'STUDENT' } as any,
        });
        const url = `/api/users/${a.id}/cedula`;

        expect((await request(server.server).put(url).set(cab(tkProfe)).send({ nueva: 'V-39999999', confirmacion: 'V-39999999' })).status).toBe(403);
        const distinta = await request(server.server).put(url).set(cab(tkAdmin)).send({ nueva: 'V-39999999', confirmacion: 'V-39999998' });
        expect(distinta.status).toBe(400);
        expect(distinta.body.code).toBe('CONFIRMACION_DISTINTA');
        const ocupada = await request(server.server).put(url).set(cab(tkAdmin)).send({ nueva: b.id, confirmacion: b.id });
        expect(ocupada.status).toBe(409);
        const propia = await request(server.server).put(`/api/users/${admin.id}/cedula`).set(cab(tkAdmin)).send({ nueva: 'V-38888888', confirmacion: 'V-38888888' });
        expect(propia.status).toBe(400);
        expect(await prisma.user.findUnique({ where: { id: a.id } })).not.toBeNull();
    });
});
