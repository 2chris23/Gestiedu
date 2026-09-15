
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient, UserRole } from '@prisma/client';
import { gradesService } from '../../services/grades.service';
import { prisma } from '../../config/database';
import { RedisCache } from '../../config/redis';

// Mock dependencies
jest.mock('../../config/database', () => ({
    __esModule: true,
    prisma: mockDeep<PrismaClient>(),
}));

jest.mock('../../config/redis', () => ({
    RedisCache: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        clearPattern: jest.fn(),
    },
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

describe('GradesService', () => {
    const mockGradeData = {
        score: 18,
        comments: 'Excellent work',
        studentId: 'student-123',
        activityId: 'activity-123',
        periodId: 'period-123',
        subjectId: 'subject-123',
        teacherId: 'teacher-123',
    };

    const mockContext = {
        id: 'grade-123',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createGrade', () => {
        it('should create a grade successfully when all validations pass', async () => {
            // 1. Mock validations (User, Activity, etc. existence)
            prismaMock.user.findUnique
                .mockResolvedValueOnce({ id: 'student-123', role: 'STUDENT', firstName: 'Juan', lastName: 'Perez' } as any) // Student
                .mockResolvedValueOnce({ id: 'teacher-123', role: 'TEACHER', firstName: 'Prof', lastName: 'X' } as any)  // Teacher
                .mockResolvedValueOnce({ id: 'teacher-123', role: 'TEACHER', firstName: 'Prof', lastName: 'X' } as any); // 3er lookup (eg. verificación adicional)

            prismaMock.activity.findUnique.mockResolvedValue({ id: 'activity-123', title: 'Test', type: 'EXAM', maxGrade: 20, weight: 0.2 } as any);
            prismaMock.period.findUnique.mockResolvedValue({ id: 'period-123', name: 'Period 1' } as any);
            prismaMock.subject.findUnique.mockResolvedValue({ id: 'subject-123', name: 'Math', code: 'MAT101' } as any);

            // 2. Mock duplicate check (MUST RETURN NULL to proceed)
            prismaMock.grade.findUnique.mockResolvedValueOnce(null);

            // 3. Mock creation
            prismaMock.grade.create.mockResolvedValue({
                ...mockGradeData,
                ...mockContext,
            } as any);

            // 4. Mock retrieval (getGradeById is called at the end)
            // This 'findUnique' is for getGradeById
            prismaMock.grade.findUnique.mockResolvedValue({
                ...mockGradeData,
                ...mockContext,
                student: { id: 'student-123', firstName: 'Juan', lastName: 'Perez' },
                activity: { id: 'activity-123', title: 'Test', type: 'EXAM', maxGrade: 20, weight: 0.2 },
                period: { id: 'period-123', name: 'Period 1' },
                subject: { id: 'subject-123', name: 'Math', code: 'MAT101' },
                teacher: { id: 'teacher-123', firstName: 'Prof', lastName: 'X' },
            } as any);

            // Execute
            const result = await gradesService.createGrade(prismaMock, mockGradeData);

            // Assert validation calls (service ahora hace 3 lookups: student + teacher + verificación adicional)
            expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(3);
            expect(prismaMock.activity.findUnique).toHaveBeenCalledWith({ where: { id: 'activity-123' }, select: expect.any(Object) });

            // Assert integrity checks
            expect(prismaMock.grade.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    score: 18,
                    student: { connect: { id: 'student-123' } }
                })
            }));

            // Assert Result
            expect(result).toBeDefined();
            expect(result.score).toBe(18);
            expect(result.student.firstName).toBe('Juan');
        });

        it('should throw error if student does not exist', async () => {
            // Mock validation failure

            prismaMock.user.findUnique
                .mockResolvedValueOnce(null) // Student not found
                .mockResolvedValueOnce({ id: 'teacher-123' } as any);

            await expect(gradesService.createGrade(prismaMock, mockGradeData))
                .rejects
                .toThrow(/Usuario no encontrado/); // Match implementation error message
        });
    });
});
