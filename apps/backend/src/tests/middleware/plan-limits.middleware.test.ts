/**
 * plan-limits.middleware.test.ts
 * Tests unitarios para middleware/plan-limits.middleware.ts
 *
 * Prueba:
 *  - checkPlanLimits: deja pasar, bloquea al alcanzar límite, bloquea si está suspendido
 *  - incrementStudentCount / decrementStudentCount
 *  - incrementTeacherCount / decrementTeacherCount
 */

// ─── Mock platformPrisma ──────────────────────────────────────────────────────
const mockPlatformPrisma = {
    institute: {
        findUnique: jest.fn(),
        update: jest.fn(),
    },
};

jest.mock('../../config/database', () => ({
    platformPrisma: mockPlatformPrisma,
    prisma: {},
}));

jest.mock('../../utils/logger', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
    checkPlanLimits,
    checkStudentLimit,
    checkTeacherLimit,
    incrementStudentCount,
    decrementStudentCount,
    incrementTeacherCount,
    decrementTeacherCount,
} from '../../middleware/plan-limits.middleware';

// ─── Helpers para crear request/reply mock ────────────────────────────────────

function makeRequest(role: string, instituteId = 'inst-123') {
    return {
        body: { role },
        user: { instituteId },
        institute: null,
    } as any;
}

function makeReply() {
    const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
    };
    return reply as any;
}

const BASE_LIMITS = {
    id: 'inst-123',
    plan: 'BASIC',
    maxStudents: 2000,
    currentStudents: 1000,
    maxTeachers: 100,
    currentTeachers: 50,
    billingStatus: 'ACTIVE',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('plan-limits.middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── checkPlanLimits ───────────────────────────────────────────────────────

    describe('checkPlanLimits()', () => {
        it('debe pasar sin error si no hay role en el body', async () => {
            const req = { body: {}, user: { instituteId: 'inst-123' } } as any;
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).not.toHaveBeenCalled();
        });

        it('debe pasar si role no es STUDENT ni TEACHER (ej: ADMIN)', async () => {
            const req = makeRequest('ADMIN');
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).not.toHaveBeenCalled();
        });

        it('debe pasar si role es STUDENT y hay cupo disponible', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue(BASE_LIMITS);
            const req = makeRequest('STUDENT');
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).not.toHaveBeenCalled();
        });

        it('debe bloquear con 403 STUDENT_LIMIT_REACHED si currentStudents >= maxStudents', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue({
                ...BASE_LIMITS,
                currentStudents: 2000, // = maxStudents
                maxStudents: 2000,
            });
            const req = makeRequest('STUDENT');
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'STUDENT_LIMIT_REACHED' })
            );
        });

        it('debe bloquear con 403 TEACHER_LIMIT_REACHED si currentTeachers >= maxTeachers', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue({
                ...BASE_LIMITS,
                currentTeachers: 100,
                maxTeachers: 100,
            });
            const req = makeRequest('TEACHER');
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'TEACHER_LIMIT_REACHED' })
            );
        });

        it('debe bloquear con INSTITUTE_SUSPENDED si billingStatus === SUSPENDED', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue({
                ...BASE_LIMITS,
                billingStatus: 'SUSPENDED',
            });
            const req = makeRequest('STUDENT');
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'INSTITUTE_SUSPENDED' })
            );
        });

        it('debe pasar si platformPrisma retorna null (no bloquear por error de BD)', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue(null);
            const req = makeRequest('STUDENT');
            const reply = makeReply();
            await checkPlanLimits(req, reply);
            expect(reply.status).not.toHaveBeenCalled();
        });
    });

    // ── Contadores atómicos ───────────────────────────────────────────────────

    describe('incrementStudentCount()', () => {
        it('debe llamar prisma.institute.update con increment: 1', async () => {
            mockPlatformPrisma.institute.update.mockResolvedValue({});
            await incrementStudentCount('inst-abc');
            expect(mockPlatformPrisma.institute.update).toHaveBeenCalledWith({
                where: { id: 'inst-abc' },
                data: { currentStudents: { increment: 1 } },
            });
        });

        it('no debe lanzar error si prisma falla (fire-and-forget)', async () => {
            mockPlatformPrisma.institute.update.mockRejectedValue(new Error('DB error'));
            await expect(incrementStudentCount('inst-abc')).resolves.not.toThrow();
        });
    });

    describe('decrementStudentCount()', () => {
        it('debe llamar prisma.institute.update con decrement: 1', async () => {
            mockPlatformPrisma.institute.update.mockResolvedValue({});
            await decrementStudentCount('inst-abc');
            expect(mockPlatformPrisma.institute.update).toHaveBeenCalledWith({
                where: { id: 'inst-abc' },
                data: { currentStudents: { decrement: 1 } },
            });
        });
    });

    describe('incrementTeacherCount()', () => {
        it('debe llamar prisma.institute.update con increment: 1 en teachers', async () => {
            mockPlatformPrisma.institute.update.mockResolvedValue({});
            await incrementTeacherCount('inst-abc');
            expect(mockPlatformPrisma.institute.update).toHaveBeenCalledWith({
                where: { id: 'inst-abc' },
                data: { currentTeachers: { increment: 1 } },
            });
        });
    });

    describe('decrementTeacherCount()', () => {
        it('debe llamar prisma.institute.update con decrement: 1 en teachers', async () => {
            mockPlatformPrisma.institute.update.mockResolvedValue({});
            await decrementTeacherCount('inst-abc');
            expect(mockPlatformPrisma.institute.update).toHaveBeenCalledWith({
                where: { id: 'inst-abc' },
                data: { currentTeachers: { decrement: 1 } },
            });
        });
    });
});
