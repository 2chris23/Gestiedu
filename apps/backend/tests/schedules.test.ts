import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../src/utils/prisma-enums';
import {
    createTestServer,
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    generateTestToken,
    createTestAcademicYear,
    createTestClassroom,
    createTestSubject,
    createTestSchedule,
} from './helpers';

describe('Schedule Conflict Tests - Phase 2', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let adminToken: string;
    let teacherId: string;
    let classroomId: string;
    let subjectId: string;
    let instituteId: string;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);

        // Crear datos de test
        const { user: admin, institute } = await createTestUser(prisma, UserRole.ADMIN);
        const { user: teacher } = await createTestUser(prisma, UserRole.TEACHER, {
            instituteId: institute.id,
        });

        instituteId = institute.id;
        adminToken = generateTestToken(admin.id, UserRole.ADMIN, instituteId);
        teacherId = teacher.id;

        // Crear año académico, aula y materia
        const academicYear = await createTestAcademicYear(prisma, instituteId);
        const classroom = await createTestClassroom(prisma, academicYear.id, instituteId);
        const subject = await createTestSubject(prisma, instituteId);

        classroomId = classroom.id;
        subjectId = subject.id;
    });

    describe('📅 Schedule Creation Tests', () => {
        it('should create a schedule in a free time slot', async () => {
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'LUNES',
                    startTime: '08:00',
                    endTime: '09:00',
                });

            if (response.status !== 201) {
                console.error('[DEBUG] Schedule 400 body:', JSON.stringify(response.body, null, 2));
                console.error('[DEBUG] sent body: classroomId=', classroomId, 'subjectId=', subjectId, 'teacherId=', teacherId, 'institute=', instituteId);
            }
            expect(response.status).toBe(201);

            expect(response.body).toHaveProperty('schedule');
            expect(response.body.schedule.dayOfWeek).toBe('LUNES');
            expect(response.body.schedule.startTime).toBe('08:00');
            expect(response.body.schedule.endTime).toBe('09:00');
        });

        it('should reject overlapping schedules for the same teacher', async () => {
            // Crear primer horario
            let existingSchedule;
            try {
                existingSchedule = await createTestSchedule(prisma, {
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'LUNES',
                    startTime: '08:00',
                    endTime: '09:00',
                });
                console.log('[DEBUG-OVERLAP] existingSchedule created:', existingSchedule?.id, 'teacherId:', teacherId);
            } catch (e) {
                console.error('[DEBUG-OVERLAP] createTestSchedule FAILED:', e);
            }

            // Intentar crear horario solapado (mismo profesor, mismo día, hora solapada)
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId: classroomId, // Puede ser otra aula
                    subjectId,
                    teacherId, // Mismo profesor
                    dayOfWeek: 'LUNES', // Mismo día
                    startTime: '08:30', // Empieza durante la clase existente
                    endTime: '09:30',
                });
            if (response.status !== 409) {
                console.error('[DEBUG-OVERLAP] Expected 409, got', response.status, 'body:', JSON.stringify(response.body));
            }
            expect(response.status).toBe(409);

            expect(response.body).toHaveProperty('error');
            expect(response.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
            expect(response.body.error).toContain('profesor ya tiene clase');
        });

        it('should detect conflict when new class starts during existing class', async () => {
            // Clase existente: 08:00 - 09:00
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'MARTES',
                startTime: '08:00',
                endTime: '09:00',
            });

            // Nueva clase: 08:30 - 09:30 (empieza durante la existente)
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'MARTES',
                    startTime: '08:30',
                    endTime: '09:30',
                })
                .expect(409);

            expect(response.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
        });

        it('should detect conflict when new class ends during existing class', async () => {
            // Clase existente: 09:00 - 10:00
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'MIERCOLES',
                startTime: '09:00',
                endTime: '10:00',
            });

            // Nueva clase: 08:00 - 09:30 (termina durante la existente)
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'MIERCOLES',
                    startTime: '08:00',
                    endTime: '09:30',
                })
                .expect(409);

            expect(response.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
        });

        it('should detect conflict when new class completely wraps existing class', async () => {
            // Clase existente: 09:00 - 10:00
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'JUEVES',
                startTime: '09:00',
                endTime: '10:00',
            });

            // Nueva clase: 08:00 - 11:00 (envuelve la existente)
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'JUEVES',
                    startTime: '08:00',
                    endTime: '11:00',
                })
                .expect(409);

            expect(response.body.code).toBe('TEACHER_SCHEDULE_CONFLICT');
        });

        it('should allow schedules on different days for same teacher', async () => {
            // Clase el Lunes
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'LUNES',
                startTime: '08:00',
                endTime: '09:00',
            });

            // Clase el Martes (mismo horario, diferente día)
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'MARTES', // Diferente día
                    startTime: '08:00',
                    endTime: '09:00',
                })
                .expect(201);

            expect(response.body).toHaveProperty('schedule');
        });

        it('should allow consecutive schedules for same teacher', async () => {
            // Primera clase: 08:00 - 09:00
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'VIERNES',
                startTime: '08:00',
                endTime: '09:00',
            });

            // Segunda clase: 09:00 - 10:00 (consecutiva, sin solapamiento)
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'VIERNES',
                    startTime: '09:00', // Empieza cuando termina la anterior
                    endTime: '10:00',
                })
                .expect(201);

            expect(response.body).toHaveProperty('schedule');
        });

        it('should allow different teachers in same classroom at same time', async () => {
            // Crear segundo profesor
            const { user: teacher2 } = await createTestUser(prisma, UserRole.TEACHER, {
                instituteId,
            });

            // Primer profesor: Lunes 08:00 - 09:00
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'LUNES',
                startTime: '08:00',
                endTime: '09:00',
            });

            // Segundo profesor: Lunes 08:00 - 09:00 (mismo aula, diferente profesor)
            // Esto debería fallar por conflicto de aula, no de profesor
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId, // Misma aula
                    subjectId,
                    teacherId: teacher2.id, // Diferente profesor
                    dayOfWeek: 'LUNES',
                    startTime: '08:00',
                    endTime: '09:00',
                })
                .expect(409);

            expect(response.body.code).toBe('SCHEDULE_EXISTS');
        });
    });

    describe('📊 Schedule Conflict Details', () => {
        it('should provide detailed conflict information', async () => {
            // Crear horario existente
            await createTestSchedule(prisma, {
                classroomId,
                subjectId,
                teacherId,
                dayOfWeek: 'LUNES',
                startTime: '10:00',
                endTime: '11:00',
            });

            // Intentar crear conflicto
            const response = await request(server.server)
                .post('/api/schedules')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('X-Institute-ID', instituteId)
                .send({
                    classroomId,
                    subjectId,
                    teacherId,
                    dayOfWeek: 'LUNES',
                    startTime: '10:30',
                    endTime: '11:30',
                })
                .expect(409);

            // Verificar que el mensaje incluye detalles útiles
            expect(response.body.error).toContain('LUNES');
            expect(response.body.error).toContain('10:00');
            expect(response.body.error).toContain('11:00');
            expect(response.body).toHaveProperty('conflict');
            expect(response.body.conflict).toHaveProperty('time');
        });
    });
});
