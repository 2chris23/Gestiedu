/**
 * plan-alerts.service.test.ts
 * Tests unitarios para services/plan-alerts.service.ts
 *
 * Prueba:
 *  - checkPlanAlerts: retorna alertas correctas según umbrales 75%/90%
 *  - getInstituteUsageSummary: calcula porcentajes y nivel de alerta correcto
 */

// ─── Mock platformPrisma ──────────────────────────────────────────────────────
const mockPlatformPrisma = {
    institute: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
};

jest.mock('../../config/database', () => ({
    platformPrisma: mockPlatformPrisma,
    prisma: {},
}));

jest.mock('../../utils/logger', () => ({
    logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
    },
}));

import { checkPlanAlerts, getInstituteUsageSummary } from '../../services/plan-alerts.service';

// ─── Data helpers ─────────────────────────────────────────────────────────────

const makeInstitute = (overrides = {}) => ({
    id: 'inst-001',
    name: 'Colegio Test',
    maxStudents: 2000,
    currentStudents: 0,
    maxTeachers: 100,
    currentTeachers: 0,
    maxStorage: 5,
    currentStorage: 0,
    ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('plan-alerts.service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── checkPlanAlerts ───────────────────────────────────────────────────────

    describe('checkPlanAlerts()', () => {
        it('debe retornar array vacío si ningún instituto supera 75%', async () => {
            mockPlatformPrisma.institute.findMany.mockResolvedValue([
                makeInstitute({ currentStudents: 500, currentTeachers: 25, currentStorage: 1 }),
            ]);
            const alerts = await checkPlanAlerts();
            expect(alerts).toHaveLength(0);
        });

        it('debe retornar alerta WARNING si uso está entre 75%-89%', async () => {
            // 75% de 2000 = 1500
            mockPlatformPrisma.institute.findMany.mockResolvedValue([
                makeInstitute({ currentStudents: 1600, currentTeachers: 10, currentStorage: 1 }),
            ]);
            const alerts = await checkPlanAlerts();
            const studentAlert = alerts.find(a => a.resource === 'students');
            expect(studentAlert).toBeDefined();
            expect(studentAlert!.level).toBe('warning');
            expect(studentAlert!.percentUsed).toBe(80); // 1600/2000*100
        });

        it('debe retornar alerta CRITICAL si uso es >= 90%', async () => {
            // 90% de 2000 = 1800
            mockPlatformPrisma.institute.findMany.mockResolvedValue([
                makeInstitute({ currentStudents: 1900, currentTeachers: 10, currentStorage: 1 }),
            ]);
            const alerts = await checkPlanAlerts();
            const studentAlert = alerts.find(a => a.resource === 'students');
            expect(studentAlert).toBeDefined();
            expect(studentAlert!.level).toBe('critical');
            expect(studentAlert!.percentUsed).toBe(95); // 1900/2000*100
        });

        it('debe detectar alertas en múltiples recursos simultáneamente', async () => {
            mockPlatformPrisma.institute.findMany.mockResolvedValue([
                makeInstitute({
                    currentStudents: 1900, // critical
                    currentTeachers: 95,   // critical
                    currentStorage: 4.5,   // critical (90% de 5)
                }),
            ]);
            const alerts = await checkPlanAlerts();
            expect(alerts).toHaveLength(3);
            expect(alerts.every(a => a.level === 'critical')).toBe(true);
        });

        it('debe manejar múltiples institutos', async () => {
            mockPlatformPrisma.institute.findMany.mockResolvedValue([
                makeInstitute({ id: 'inst-001', currentStudents: 100 }),   // ok
                makeInstitute({ id: 'inst-002', currentStudents: 1900 }),  // critical
                makeInstitute({ id: 'inst-003', currentStudents: 1600 }),  // warning
            ]);
            const alerts = await checkPlanAlerts();
            expect(alerts.length).toBeGreaterThanOrEqual(2);
            const inst002Alert = alerts.find(a => a.instituteId === 'inst-002');
            expect(inst002Alert?.level).toBe('critical');
            const inst003Alert = alerts.find(a => a.instituteId === 'inst-003');
            expect(inst003Alert?.level).toBe('warning');
        });

        it('debe retornar array vacío si no hay institutos activos', async () => {
            mockPlatformPrisma.institute.findMany.mockResolvedValue([]);
            const alerts = await checkPlanAlerts();
            expect(alerts).toHaveLength(0);
        });

        it('debe ignorar recursos con max = 0 (evitar división por cero)', async () => {
            mockPlatformPrisma.institute.findMany.mockResolvedValue([
                makeInstitute({ maxStudents: 0, currentStudents: 100 }),
            ]);
            const alerts = await checkPlanAlerts();
            const studentAlert = alerts.find(a => a.resource === 'students');
            expect(studentAlert).toBeUndefined(); // max=0 → se ignora
        });
    });

    // ── getInstituteUsageSummary ──────────────────────────────────────────────

    describe('getInstituteUsageSummary()', () => {
        const fullInstitute = {
            id: 'inst-001',
            name: 'Colegio Test',
            plan: 'BASIC',
            currentStudents: 1500,
            maxStudents: 2000,
            currentTeachers: 50,
            maxTeachers: 100,
            currentStorage: 3,
            maxStorage: 5,
            billingStatus: 'ACTIVE',
            monthlyPrice: 50,
            nextBillingDate: new Date('2026-03-15'),
        };

        it('debe calcular porcentajes correctamente', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue(fullInstitute);
            const summary = await getInstituteUsageSummary('inst-001');
            expect(summary).not.toBeNull();
            expect(summary!.usage.students.pct).toBe(75); // 1500/2000*100
            expect(summary!.usage.teachers.pct).toBe(50); // 50/100*100
            expect(summary!.usage.storage.pct).toBe(60);  // 3/5*100
        });

        it('debe retornar nivel "warning" si algún recurso está entre 75-89%', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue({
                ...fullInstitute,
                currentStudents: 1600, // 80%
            });
            const summary = await getInstituteUsageSummary('inst-001');
            expect(summary!.alerts.level).toBe('warning');
            expect(summary!.alerts.hasWarning).toBe(true);
            expect(summary!.alerts.hasCritical).toBe(false);
        });

        it('debe retornar nivel "critical" si algún recurso supera 90%', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue({
                ...fullInstitute,
                currentStudents: 1900, // 95%
            });
            const summary = await getInstituteUsageSummary('inst-001');
            expect(summary!.alerts.level).toBe('critical');
            expect(summary!.alerts.hasCritical).toBe(true);
        });

        it('debe retornar nivel "ok" si todos los recursos están bajo 75%', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue({
                ...fullInstitute,
                currentStudents: 500,   // 25%
                currentTeachers: 30,    // 30%
                currentStorage: 1,      // 20%
            });
            const summary = await getInstituteUsageSummary('inst-001');
            expect(summary!.alerts.level).toBe('ok');
            expect(summary!.alerts.hasWarning).toBe(false);
            expect(summary!.alerts.hasCritical).toBe(false);
        });

        it('debe retornar null si el instituto no existe', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue(null);
            const summary = await getInstituteUsageSummary('not-a-real-id');
            expect(summary).toBeNull();
        });

        it('los datos de usage deben tener current, max y pct', async () => {
            mockPlatformPrisma.institute.findUnique.mockResolvedValue(fullInstitute);
            const summary = await getInstituteUsageSummary('inst-001');
            for (const key of ['students', 'teachers', 'storage'] as const) {
                expect(summary!.usage[key]).toHaveProperty('current');
                expect(summary!.usage[key]).toHaveProperty('max');
                expect(summary!.usage[key]).toHaveProperty('pct');
            }
        });
    });
});
