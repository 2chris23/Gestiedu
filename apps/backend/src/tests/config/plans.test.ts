/**
 * plans.test.ts
 * Tests unitarios para config/plans.ts
 *
 * La estructura real de PlanConfig es:
 *   { name, displayName, description, maxStudents, maxTeachers, maxStorage, monthlyPrice, features }
 * (sin objeto .limits anidado)
 */
import { getAllPlans, getPlanConfig, PLANS, PlanConfig } from '../../config/plans';

describe('Plans Configuration', () => {
    describe('PLANS constant', () => {
        it('debe tener exactamente 3 planes: BASIC, PREMIUM, ENTERPRISE', () => {
            const planNames = Object.keys(PLANS);
            expect(planNames).toHaveLength(3);
            expect(planNames).toContain('BASIC');
            expect(planNames).toContain('PREMIUM');
            expect(planNames).toContain('ENTERPRISE');
        });

        it('BASIC debe ser el plan más barato', () => {
            expect(PLANS.BASIC.monthlyPrice).toBeLessThan(PLANS.PREMIUM.monthlyPrice);
            expect(PLANS.PREMIUM.monthlyPrice).toBeLessThan(PLANS.ENTERPRISE.monthlyPrice);
        });

        it('los límites de estudiantes deben ser ascendentes: BASIC < PREMIUM < ENTERPRISE', () => {
            expect(PLANS.BASIC.maxStudents).toBeLessThan(PLANS.PREMIUM.maxStudents);
            expect(PLANS.PREMIUM.maxStudents).toBeLessThan(PLANS.ENTERPRISE.maxStudents);
        });

        it('los límites de profesores deben ser ascendentes: BASIC < PREMIUM < ENTERPRISE', () => {
            expect(PLANS.BASIC.maxTeachers).toBeLessThan(PLANS.PREMIUM.maxTeachers);
            expect(PLANS.PREMIUM.maxTeachers).toBeLessThan(PLANS.ENTERPRISE.maxTeachers);
        });

        it('los límites de storage deben ser ascendentes: BASIC < PREMIUM < ENTERPRISE', () => {
            expect(PLANS.BASIC.maxStorage).toBeLessThan(PLANS.PREMIUM.maxStorage);
            expect(PLANS.PREMIUM.maxStorage).toBeLessThan(PLANS.ENTERPRISE.maxStorage);
        });

        it('todos los planes deben tener features definidos', () => {
            for (const [name, plan] of Object.entries(PLANS)) {
                expect(plan.features).toBeDefined();
                expect(Array.isArray(plan.features)).toBe(true);
                expect(plan.features.length).toBeGreaterThan(0);
            }
        });

        it('todos los precios deben ser positivos', () => {
            for (const [, plan] of Object.entries(PLANS)) {
                expect(plan.monthlyPrice).toBeGreaterThan(0);
            }
        });

        it('los límites de estudiantes/profesores/storage deben ser enteros positivos', () => {
            for (const [, plan] of Object.entries(PLANS)) {
                expect(plan.maxStudents).toBeGreaterThan(0);
                expect(plan.maxTeachers).toBeGreaterThan(0);
                expect(plan.maxStorage).toBeGreaterThan(0);
                expect(Number.isInteger(plan.maxStudents)).toBe(true);
                expect(Number.isInteger(plan.maxTeachers)).toBe(true);
            }
        });

        it('BASIC debe tener maxStudents=2000, maxTeachers=100, maxStorage=5', () => {
            expect(PLANS.BASIC.maxStudents).toBe(2000);
            expect(PLANS.BASIC.maxTeachers).toBe(100);
            expect(PLANS.BASIC.maxStorage).toBe(5);
        });

        it('ENTERPRISE debe tener más límites que PREMIUM', () => {
            expect(PLANS.ENTERPRISE.maxStudents).toBeGreaterThan(PLANS.PREMIUM.maxStudents);
        });
    });

    describe('getAllPlans()', () => {
        it('debe retornar un array con los 3 planes', () => {
            const plans = getAllPlans();
            expect(Array.isArray(plans)).toBe(true);
            expect(plans).toHaveLength(3);
        });

        it('debe retornar los planes ordenados por precio ascendente', () => {
            const plans = getAllPlans();
            for (let i = 0; i < plans.length - 1; i++) {
                expect(plans[i].monthlyPrice).toBeLessThanOrEqual(plans[i + 1].monthlyPrice);
            }
        });

        it('cada plan debe tener name, displayName, monthlyPrice, maxStudents, maxTeachers, maxStorage, features', () => {
            const plans = getAllPlans();
            for (const plan of plans) {
                expect(plan).toHaveProperty('name');
                expect(plan).toHaveProperty('displayName');
                expect(plan).toHaveProperty('monthlyPrice');
                expect(plan).toHaveProperty('maxStudents');
                expect(plan).toHaveProperty('maxTeachers');
                expect(plan).toHaveProperty('maxStorage');
                expect(plan).toHaveProperty('features');
            }
        });
    });

    describe('getPlanConfig()', () => {
        it('debe retornar la config correcta para BASIC', () => {
            const plan = getPlanConfig('BASIC');
            expect(plan.name).toBe('BASIC');
            expect(plan.maxStudents).toBe(PLANS.BASIC.maxStudents);
            expect(plan.monthlyPrice).toBe(PLANS.BASIC.monthlyPrice);
        });

        it('debe retornar la config correcta para PREMIUM', () => {
            const plan = getPlanConfig('PREMIUM');
            expect(plan.name).toBe('PREMIUM');
            expect(plan.maxStudents).toBe(PLANS.PREMIUM.maxStudents);
        });

        it('debe retornar la config correcta para ENTERPRISE', () => {
            const plan = getPlanConfig('ENTERPRISE');
            expect(plan.name).toBe('ENTERPRISE');
            expect(plan.maxStudents).toBe(PLANS.ENTERPRISE.maxStudents);
        });

        it('con plan no existente debe hacer fallback a BASIC', () => {
            // plans.ts implementa: return PLANS[planName] ?? PLANS.BASIC;
            const plan = getPlanConfig('INVALID_PLAN');
            expect(plan.name).toBe('BASIC');
            expect(plan.maxStudents).toBe(PLANS.BASIC.maxStudents);
        });

        it('el plan BASIC debe tener price=50 y PREMIUM=150', () => {
            expect(getPlanConfig('BASIC').monthlyPrice).toBe(50);
            expect(getPlanConfig('PREMIUM').monthlyPrice).toBe(150);
            expect(getPlanConfig('ENTERPRISE').monthlyPrice).toBe(500);
        });
    });
});
