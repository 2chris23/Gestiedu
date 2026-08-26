import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
} from '../helpers';
import { seedInstituteInTenant } from '../helpers/tenant-db';

/**
 * TEST: filas creadas con instituteId NULL aparecen en sus listados.
 *
 * Contexto: database-per-tenant. La extensión tenant-isolation quedó con la
 * lista TENANT_SCOPED_MODELS vacía (decisión Phase 3), porque el campo
 * instituteId es opcional y no se llena en la creación. Estos tests verifican
 * que un registro recién creado (sin instituteId) aparece de inmediato en su
 * listado correspondiente vía API.
 */
const INSTITUTE_SLUG = 'test-institute';

describe('Phase 3 — registros sin instituteId son visibles en sus listados', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        await seedInstituteInTenant(prisma, {
            id: 'institute',
            code: 'TEST_INST',
            slug: 'test-institute',
            name: 'Test Institute',
            email: 'test@institute.com',
        });

        const admin = await createTestUser(prisma, UserRole.ADMIN);
        const { generateTestToken } = await import('../helpers');
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await seedInstituteInTenant(prisma, {
            id: 'institute',
            code: 'TEST_INST',
            slug: 'test-institute',
            name: 'Test Institute',
            email: 'test@institute.com',
        });
        const admin = await createTestUser(prisma, UserRole.ADMIN);
        const { generateTestToken } = await import('../helpers');
        adminToken = generateTestToken(admin.user.id, UserRole.ADMIN, 'institute');
    });

    const auth = () => ({
        Authorization: `Bearer ${adminToken}`,
        'X-Institute-Slug': INSTITUTE_SLUG,
    });

    it('academicYear creado sin instituteId aparece en GET /api/academic-years', async () => {
        // Crear vía API el año (el controller no setea instituteId: nace NULL)
        await request(server.server)
            .post('/api/academic-years')
            .set(auth())
            .send({
                name: '2026-2027',
                startDate: '2026-08-20',
                endDate: '2027-07-15',
            })
            .expect(201);

        // Listar y verificar que aparece (el listado NO lo oculta)
        const list = await request(server.server)
            .get('/api/academic-years')
            .set(auth())
            .expect(200);

        const names = JSON.stringify(list.body);
        expect(names).toContain('2026-2027');
    });

    it('classroom creado aparece en GET /api/classrooms', async () => {
        // Crear año + aula (sin instituteId en la creación)
        const year = await prisma.academicYear.create({
            data: {
                id: `cy-${Date.now()}`,
                name: '2026-2027',
                startDate: new Date('2026-08-20'),
                endDate: new Date('2027-07-15'),
                isActive: true,
            },
        });
        const created = await request(server.server)
            .post('/api/classrooms')
            .set(auth())
            .send({
                academicYearId: year.id,
                grade: 1,
                section: 'A',
                capacity: 30,
            })
            .expect(201);

        const classroomId = (created.body?.classroom?.id || created.body?.id) as string | undefined;
        // La respuesta puede traer el id en otra envoltura; lo verificamos en BD
        const dbId = classroomId || (await prisma.classroom.findFirst({
            where: { academicYearId: year.id },
            select: { id: true },
        }))?.id;
        expect(dbId).toBeTruthy();

        const list = await request(server.server)
            .get('/api/classrooms')
            .set(auth())
            .expect(200);
        expect(JSON.stringify(list.body)).toContain(dbId);
    });

    it('notification creada aparece en GET /api/notifications', async () => {
        // La creación requiere recipientId (destinatario del aviso)
        const admin = await createTestUser(prisma, UserRole.ADMIN, { email: `notif-${Date.now()}@test.com` });
        await request(server.server)
            .post('/api/notifications')
            .set(auth())
            .send({
                title: 'Aviso de prueba',
                message: 'Mensaje de prueba para verificar visibilidad',
                type: 'INFO',
                audience: 'entire_institute',
                priority: 'NORMAL',
                recipientId: admin.user.id,
            })
            .expect(201);

        const list = await request(server.server)
            .get('/api/notifications')
            .set(auth())
            .expect(200);
        expect(JSON.stringify(list.body)).toContain('Aviso de prueba');
    });

    it('subject creado aparece en GET /api/subjects', async () => {
        await request(server.server)
            .post('/api/subjects')
            .set(auth())
            .send({ name: 'Química 3er Año', code: 'QUIM-3', description: 'Ciencias' })
            .expect(201);

        const list = await request(server.server)
            .get('/api/subjects')
            .set(auth())
            .expect(200);
        expect(JSON.stringify(list.body)).toContain('Química 3er Año');
    });
});
