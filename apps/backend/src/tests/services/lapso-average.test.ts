import {
    calculateLapsoAverage,
    criterionNote,
    criterionRawAverage,
    normalizeScore,
    normalizeScore as n,
    CriterionInput,
} from '../../../src/utils/lapso-average';

/**
 * Tests de la función pura de promedio ponderado por criterio.
 * Todos los casos están calculados a mano.
 */
describe('lapso-average — función pura de promedio ponderado (escala 01-20)', () => {

    it('normaliza notas de escalas distintas a 0-20', () => {
        expect(normalizeScore(15, 20)).toBe(15);
        expect(normalizeScore(8, 10)).toBe(16);      // 8/10 → 16/20
        expect(normalizeScore(16, 20)).toBe(16);
        expect(normalizeScore(25, 20)).toBe(20);     // acota a 20
        expect(normalizeScore(-3, 20)).toBe(0);      // acota a 0
    });

    it('promedio simple dentro de un criterio (sin pesos)', () => {
        const crit: CriterionInput = {
            puntos: 4,
            activities: [
                { score: 20, maxScore: 20 }, // 20
                { score: 10, maxScore: 20 }, // 10
                { score: 0, maxScore: 20 },  // 0
            ],
        };
        // (20+10+0)/3 = 10
        expect(criterionRawAverage(crit)).toBe(10);
        // nota = (10/20)*4 = 2
        expect(criterionNote(crit)).toBe(2);
    });

    it('excluye actividades sin calificar del promedio', () => {
        const crit: CriterionInput = {
            puntos: 4,
            activities: [
                { score: 20, maxScore: 20 },
                { score: 6, maxScore: 20 },
                // null → sin calificar, se excluye
                { score: null as any, maxScore: 20 },
                { score: undefined as any, maxScore: 20 },
            ],
        };
        // (20+6)/2 = 13 → nota (13/20)*4 = 2.6
        expect(criterionRawAverage(crit)).toBe(13);
        expect(criterionNote(crit)).toBe(2.6);
    });

    it('actividades sin calificar en el criterio NO cuentan como 0 (solo las calificadas)', () => {
        const crit: CriterionInput = {
            puntos: 4,
            activities: [{ score: 18, maxScore: 20 }], // sólo 1 calificada
        };
        expect(criterionNote(crit)).toBe(3.6); // (18/20)*4
    });

    it('peso individual opcional dentro del criterio (promedio ponderado)', () => {
        const crit: CriterionInput = {
            puntos: 12,
            activities: [
                { score: 10, maxScore: 20, weight: 3 }, // 10 * 3 = 30
                { score: 18, maxScore: 20, weight: 1 }, // 18 * 1 = 18
            ],
        };
        // ponderado: (10*3 + 18*1)/(3+1) = 48/4 = 12 → nota (12/20)*12 = 7.2
        expect(criterionRawAverage(crit)).toBe(12);
        expect(criterionNote(crit)).toBe(7.2);
    });

    it('CASO COMPLETO 4+4+12: resultado calculado a mano', () => {
        const plan: CriterionInput[] = [
            {
                puntos: 4,
                activities: [
                    { score: 20, maxScore: 20 }, // 20
                    { score: 10, maxScore: 20 }, // 10
                ],
            }, // avg 15 → nota (15/20)*4 = 3
            {
                puntos: 4,
                activities: [
                    { score: 15, maxScore: 20 }, // 15
                    // sin calificar excluida
                    { score: null as any, maxScore: 20 },
                ],
            }, // avg 15 → nota 3
            {
                puntos: 12,
                activities: [
                    { score: 8, maxScore: 10 },  // 16/20
                    { score: 16, maxScore: 20 }, // 16
                    { score: 4, maxScore: 20 },  // 4
                ],
            }, // avg (16+16+4)/3 = 12 → nota (12/20)*12 = 7.2
        ];

        const result = calculateLapsoAverage(plan);

        // Suma criterio 3 + 3 + 7.2 = 13.2
        expect(result.total).toBe(13.2);
        expect(result.criteria[0].note).toBe(3);
        expect(result.criteria[1].note).toBe(3);
        expect(result.criteria[2].note).toBe(7.2);
        // Hay una actividad sin calificar (criterio 2) → lapso incompleto
        expect(result.incomplete).toBe(true);
        expect(result.plannedActivities).toBe(7);
        expect(result.gradedActivities).toBe(6);
    });

    it('criterio sin calificaciones → note 0 y lapso marcado incompleto', () => {
        // Criterio 2 tiene 1 actividad planificada pero SIN nota (null) → incompleto
        const result = calculateLapsoAverage([
            { puntos: 12, activities: [{ score: 15, maxScore: 20 }] },
            { puntos: 8, activities: [{ score: null as any, maxScore: 20 }] },
        ]);
        expect(result.criteria[1].note).toBe(0);
        expect(result.total).toBe(9);
        expect(result.incomplete).toBe(true);
    });

    it('todas las actividades calificadas → lapso completo (incomplete=false)', () => {
        const result = calculateLapsoAverage([
            { puntos: 12, activities: [{ score: 20, maxScore: 20 }, { score: 20, maxScore: 20 }] },
        ]);
        expect(result.total).toBe(12);
        expect(result.incomplete).toBe(false);
    });
});
