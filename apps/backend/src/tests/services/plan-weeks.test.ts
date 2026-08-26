import { planWeekNumberFromRange, planWeekRangeFromRange } from '../../utils/plan-weeks';

/**
 * UNITS — plan-weeks (semanas del plan alineadas a LUNES)
 *
 * Regla: Semana 1 = desde la fecha de inicio hasta el domingo previo al primer
 * lunes posterior a la semana inicial. Semana N (N≥2) es la semana lun→dom
 * que inicia en ese lunes.
 *
 * Escenario usuario: plan inicia 19/08/2026 (miércoles):
 *  - Semana 1 = 19/08 → 30/08/2026 (incluye el viernes 28/08)
 *  - Semana 2 = 31/08/2026 → 06/09/2026 (lunes 31 abre la semana 2)
 */

const LAPSO_START = new Date(2026, 7, 19); // 19/08/2026

describe('utils/plan-weeks — semanas alineadas a lunes', () => {
    it('1. el inicio cae en semana 1 y los 7 días siguientes siguen en semana 1', () => {
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 7, 19))).toBe(1);
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 7, 21))).toBe(1); // vie
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 7, 25))).toBe(1); // mar
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 7, 28))).toBe(1); // vie
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 7, 30))).toBe(1); // dom
    });

    it('2. la semana 2 abre el LUNES 31/08/2026 y dura hasta el domingo 06/09', () => {
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 7, 31))).toBe(2); // lun
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 8, 6))).toBe(2); // dom
    });

    it('3. la semana 3 inicia el lunes 07/09/2026', () => {
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 8, 7))).toBe(3);
        expect(planWeekNumberFromRange(LAPSO_START, new Date(2026, 8, 13))).toBe(3);
    });

    it('4. los rangos coinciden: semana 1 = 19-30/08, semana 2 = 31/08-06/09', () => {
        const w1 = planWeekRangeFromRange(LAPSO_START, 1);
        expect(w1.start.getDate()).toBe(19);
        expect(w1.end.getDate()).toBe(30);
        const w2 = planWeekRangeFromRange(LAPSO_START, 2);
        expect(w2.start.getDate()).toBe(31);
        expect(w2.end.getDate()).toBe(6);
        const w3 = planWeekRangeFromRange(LAPSO_START, 3);
        expect(w3.start.getDate()).toBe(7);
        expect(w3.end.getDate()).toBe(13);
    });

    it('5. con inicio en LUNES las semanas son calendario normales', () => {
        const mondayStart = new Date(2026, 7, 17); // lunes
        expect(planWeekNumberFromRange(mondayStart, new Date(2026, 7, 23))).toBe(1);
        expect(planWeekNumberFromRange(mondayStart, new Date(2026, 7, 24))).toBe(2);
    });
});
