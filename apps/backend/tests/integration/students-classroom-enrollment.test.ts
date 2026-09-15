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
    generateTestToken,
} from '../helpers';

/**
 * MATRÍCULA DE ESTUDIANTE AL CREAR / EDITAR (POST y PUT /api/students)
 *
 * `students.controller.ts` tenía su propia copia de la lógica de negocio,
 * escrita contra el modelo VIEJO: metía `classroomId` dentro de `user.create()`
 * y pedía `include: { classroom: true }`. La migración a `StudentClassroom`
 * eliminó esa columna y esa relación de `User`, así que ambas llamadas
 * reventaban → 500 al crear o editar un estudiante con sección.
 *
 * `students.service.ts` ya tenía la versión migrada y correcta (extrae
 * `classroomId` y crea/actualiza el `StudentClassroom` real), pero NINGUNA ruta
 * lo llamaba: era código duplicado y muerto.
 *
 * Estos tests fijan el contrato de la versión consolidada: el estudiante se
 * crea/edita y la matrícula queda bien en `StudentClassroom`.
 */

const SUFFIX = Date.now();

function show(label: string, status: number, body: unknown) {
    // Evidencia real del body, no solo el status code.
    console.log(`\n[EVIDENCIA] ${label}\n  status: ${status}\n  body: ${JSON.stringify(body)}`);
}

describe('POST/PUT /api/students — matrícula en sección', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let classroomA: any;
    let classroomB: any;
    let academicYearId: string;

    const createdStudentIds: string[] = [];

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');

        const year = await createTestAcademicYear(prisma, 'institute');
        academicYearId = year.id;
        classroomA = await createTestClassroom(prisma, academicYearId, 'institute');
        // `createTestClassroom` siempre usa el mismo nombre/sección y hay un
        // unique (academicYearId, name, section), así que la segunda va a mano.
        classroomB = await prisma.classroom.create({
            data: {
                id: `aulaB-${SUFFIX}`,
                name: '1er Grado B',
                slug: `aula-b-${SUFFIX}`,
                grade: 1,
                section: 'B',
                capacity: 30,
                academicYearId,
                instituteId: 'institute',
            },
        });
    }, 120000);

    afterAll(async () => {
        await prisma.studentClassroom
            .deleteMany({ where: { studentId: { in: createdStudentIds } } })
            .catch(() => { /* noop */ });
        await prisma.auditLog
            .deleteMany({ where: { entityId: { in: createdStudentIds } } })
            .catch(() => { /* noop */ });
        await prisma.user
            .deleteMany({ where: { id: { in: createdStudentIds } } })
            .catch(() => { /* noop */ });
        await prisma.classroom
            .deleteMany({ where: { id: { in: [classroomA?.id, classroomB?.id].filter(Boolean) } } })
            .catch(() => { /* noop */ });
        await prisma.academicYear.deleteMany({ where: { id: academicYearId } }).catch(() => { /* noop */ });
        await prisma.$disconnect();
        await server.close();
    }, 120000);

    it('TEST 1 — crear estudiante con sección: 201 y StudentClassroom creado', async () => {
        const ci = `V-${SUFFIX}-1`;
        const res = await request(server.server)
            .post('/api/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: ci,
                email: `est1-${SUFFIX}@test.com`,
                password: 'Password123!',
                firstName: 'Ana',
                lastName: 'Pérez',
                birthDate: '2010-05-14',
                gender: 'FEMENINO',
                classroomId: classroomA.id,
            });

        show('POST /api/students (con classroomId)', res.status, res.body);
        expect(res.status).toBe(201);
        createdStudentIds.push(ci);

        // El usuario existe y es estudiante.
        const student = await prisma.user.findUnique({ where: { id: ci } });
        expect(student).not.toBeNull();
        expect(student?.role).toBe(UserRole.STUDENT);
        expect(student?.email).toBe(`est1-${SUFFIX}@test.com`);
        // El `birthDate` de tipo `date` del schema se normaliza a DateTime.
        expect(student?.birthDate).toBeInstanceOf(Date);

        // La matrícula real quedó en StudentClassroom, no en una columna de User.
        const enrollments = await prisma.studentClassroom.findMany({
            where: { studentId: ci },
        });
        console.log(`  [BD] StudentClassroom: ${JSON.stringify(enrollments)}`);
        expect(enrollments).toHaveLength(1);
        expect(enrollments[0].classroomId).toBe(classroomA.id);
        expect(enrollments[0].academicYearId).toBe(academicYearId);
        expect(enrollments[0].isActive).toBe(true);
    }, 60000);

    it('TEST 2 — editar estudiante cambiándole la sección: 200 y matrícula actualizada', async () => {
        const ci = createdStudentIds[0];
        const res = await request(server.server)
            .put(`/api/students/${ci}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                firstName: 'Ana María',
                classroomId: classroomB.id,
            });

        show('PUT /api/students/:id (cambio de sección)', res.status, res.body);
        expect(res.status).toBe(200);

        const student = await prisma.user.findUnique({ where: { id: ci } });
        expect(student?.firstName).toBe('Ana María');

        // El upsert reusa la matrícula del mismo año académico: sigue habiendo
        // una sola, ahora apuntando a la sección nueva.
        const enrollments = await prisma.studentClassroom.findMany({
            where: { studentId: ci },
        });
        console.log(`  [BD] StudentClassroom tras el cambio: ${JSON.stringify(enrollments)}`);
        expect(enrollments).toHaveLength(1);
        expect(enrollments[0].classroomId).toBe(classroomB.id);
        expect(enrollments[0].academicYearId).toBe(academicYearId);
        expect(enrollments[0].isActive).toBe(true);
    }, 60000);

    it('TEST 2b — la contraseña se guarda hasheada, no en texto plano', async () => {
        const ci = createdStudentIds[0];
        const row = await prisma.user.findUnique({
            where: { id: ci },
            select: { password: true },
        });

        console.log(`  [BD] password almacenada: ${row?.password}`);
        expect(row?.password).not.toBe('Password123!');
        // Formato bcrypt: $2a$ / $2b$ / $2y$ + coste + salt/hash.
        expect(row?.password).toMatch(/^\$2[aby]\$\d{2}\$/);

        // Y sirve de verdad: la contraseña original valida contra el hash.
        const { comparePassword } = await import('../../src/utils/bcrypt');
        expect(await comparePassword('Password123!', row!.password)).toBe(true);
        expect(await comparePassword('otra-clave', row!.password)).toBe(false);
    }, 60000);

    it('TEST 3 — crear con un aula inexistente: 404 controlado, sin estudiante huérfano', async () => {
        const ci = `V-${SUFFIX}-3`;
        const res = await request(server.server)
            .post('/api/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: ci,
                email: `est3-${SUFFIX}@test.com`,
                password: 'Password123!',
                firstName: 'Luis',
                lastName: 'Gómez',
                classroomId: 'aula-que-no-existe',
            });

        show('POST /api/students (aula inexistente)', res.status, res.body);
        expect(res.status).toBe(404);

        const student = await prisma.user.findUnique({ where: { id: ci } });
        expect(student).toBeNull();
    }, 60000);

    it('TEST 4 — crear con un email ya usado: 409 controlado', async () => {
        const ci = `V-${SUFFIX}-4`;
        const res = await request(server.server)
            .post('/api/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: ci,
                email: `est1-${SUFFIX}@test.com`, // el de TEST 1
                password: 'Password123!',
                firstName: 'Repetido',
                lastName: 'Email',
                classroomId: classroomA.id,
            });

        show('POST /api/students (email duplicado)', res.status, res.body);
        expect(res.status).toBe(409);

        const student = await prisma.user.findUnique({ where: { id: ci } });
        expect(student).toBeNull();
    }, 60000);
});
