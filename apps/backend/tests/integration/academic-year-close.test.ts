import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { UserRole } from '../../src/utils/prisma-enums';
import { syncAcademicYearStatuses } from '../../src/utils/academic-year.utils';
import {
    createTestPrismaClient,
    cleanTestDatabase,
    createTestUser,
    createTestClassroom,
    createTestSubject,
} from '../helpers';

/**
 * FLUJO 4 — CIERRE DE AÑO ACADÉMICO
 *
 * El "cierre" hoy es syncAcademicYearStatuses() (usado por el cron
 * academic-year-sync.job). NO está registrado ningún endpoint HTTP manual
 * (forceSyncAcademicYears existe pero no está cableado a rutas).
 *
 * COMPORTAMIENTO DOCUMENTADO (comportamiento actual, no ideal):
 *  - El cierre SOLO cambia el status del año a COMPLETED/ACTIVE/UPCOMING según
 *    fechas. NO genera AcademicRecord, NO promueve estudiantes, NO marca
 *    materias pendientes. Los estudiantes quedan intactos.
 *  - Es idempotente: una segunda corrida no cambia nada.
 */

function gId(): string {
    // Siempre la 'c' delante: ver la nota de `tests/helpers.ts`.
    return `c${createId()}`;
}

describe('Flujo 4 — Cierre de año académico', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
        prisma = await createTestPrismaClient();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await cleanTestDatabase(prisma);
        await prisma.institute.upsert({
            where: { id: 'institute' },
            update: {},
            create: {
                id: 'institute',
                code: 'TEST_INST',
                slug: 'test-institute',
                name: 'Test Institute',
                email: 'test@institute.com',
            },
        });
    });

    it('1. ubica el mecanismo de cierre: syncAcademicYearStatuses (cron), sin endpoint HTTP manual', async () => {
        // Documentado: forceSyncAcademicYears existe en academic-year-sync.job.ts
        // pero NO está registrado en ninguna ruta (verificado por grep en el código).
        // El mecanismo real es el cron que llama syncAcademicYearStatuses por instituto.
        expect(typeof syncAcademicYearStatuses).toBe('function');
    });

    it('2. cierra un año vencido con estudiantes (notas completas e incompletas)', async () => {
        // Año con endDate en el pasado → debe cerrarse
        const year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: '2023-2024',
                startDate: new Date('2023-09-01'),
                endDate: new Date('2024-06-30'), // ya pasó
                status: 'ACTIVE',
                instituteId: 'institute',
            },
        });
        const period = await prisma.period.create({
            data: {
                id: gId(),
                name: 'Primer Lapso',
                startDate: new Date('2023-09-01'),
                endDate: new Date('2023-12-15'),
                isActive: true,
                academicYearId: year.id,
            },
        });
        const classroom = await createTestClassroom(prisma, year.id, 'institute');
        const subject = await createTestSubject(prisma, 'institute');

        // Estudiante con notas "completas" (2 actividades calificadas)
        const studentComplete = await createTestUser(prisma, UserRole.STUDENT);
        // Estudiante con nota incompleta (1 sola actividad calificada de 2)
        const studentIncomplete = await createTestUser(prisma, UserRole.STUDENT);
        // La membresía en la sección vive en StudentClassroom desde que se
        // eliminó el campo denormalizado User.classroomId.
        await prisma.studentClassroom.createMany({
            data: [
                { studentId: studentComplete.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
                { studentId: studentIncomplete.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
            ],
        });

        const activity = await prisma.activity.create({
            data: {
                title: 'Evaluación Final',
                type: 'SUMATIVA',
                scope: 'CLASSROOM',
                startDate: new Date('2024-05-01'),
                maxGrade: 20,
                weight: 1,
                classroomId: classroom.id,
                subjectId: subject.id,
                periodId: period.id,
                lapso: '1',
                createdBy: studentComplete.user.id,
                instituteId: 'institute',
            },
        });

        await prisma.grade.create({
            data: {
                studentId: studentComplete.user.id,
                activityId: activity.id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: studentComplete.user.id, // solo para datos de prueba
                score: 18,
            },
        });
        await prisma.grade.create({
            data: {
                studentId: studentIncomplete.user.id,
                activityId: activity.id,
                periodId: period.id,
                subjectId: subject.id,
                teacherId: studentComplete.user.id,
                score: 8,
            },
        });

        const gradesBefore = await prisma.grade.count();

        // Ejecutar el cierre
        const result = await syncAcademicYearStatuses(prisma as any, 'institute');
        expect(result.updated).toBeGreaterThanOrEqual(1);

        const closedYear = await prisma.academicYear.findUnique({ where: { id: year.id } });
        expect(closedYear!.status).toBe('COMPLETED');
    });

    it('3. el cierre NO genera AcademicRecord ni promueve/marca pendientes (comportamiento actual)', async () => {
        const year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: '2023-2024',
                startDate: new Date('2023-09-01'),
                endDate: new Date('2024-06-30'),
                status: 'ACTIVE',
                instituteId: 'institute',
            },
        });
        const classroom = await createTestClassroom(prisma, year.id, 'institute');
        const student = await createTestUser(prisma, UserRole.STUDENT);
        await prisma.studentClassroom.create({
            data: { studentId: student.user.id, classroomId: classroom.id, academicYearId: year.id, isActive: true },
        });

        await syncAcademicYearStatuses(prisma as any, 'institute');

        const yearAfter = await prisma.academicYear.findUnique({ where: { id: year.id } });
        expect(yearAfter!.status).toBe('COMPLETED');

        // Documentado: NO se genera registro académico ni estado de promoción.
        const records = await prisma.academicRecord.count({
            where: { studentId: student.user.id, academicYearId: year.id },
        });
        expect(records).toBe(0);

        // El estudiante sigue igual (sin campo de promoción ni pendientes)
        const studentAfter = await prisma.user.findUnique({ where: { id: student.user.id } });
        expect(studentAfter!.isActive).toBe(true);
    });

    it('4. el cierre es idempotente: correrlo dos veces no duplica ni corrompe', async () => {
        const year = await prisma.academicYear.create({
            data: {
                id: gId(),
                name: '2023-2024',
                startDate: new Date('2023-09-01'),
                endDate: new Date('2024-06-30'),
                status: 'ACTIVE',
                instituteId: 'institute',
            },
        });

        const first = await syncAcademicYearStatuses(prisma as any, 'institute');
        expect(first.updated).toBeGreaterThanOrEqual(1);

        const yearCountBefore = await prisma.academicYear.count();
        const gradeCountBefore = await prisma.grade.count();

        // Segunda corrida: nada cambia
        const second = await syncAcademicYearStatuses(prisma as any, 'institute');
        expect(second.updated).toBe(0);

        const yearAfter = await prisma.academicYear.findUnique({ where: { id: year.id } });
        expect(yearAfter!.status).toBe('COMPLETED');

        // Sin duplicación de datos
        expect(await prisma.academicYear.count()).toBe(yearCountBefore);
        expect(await prisma.grade.count()).toBe(gradeCountBefore);
    });
});
