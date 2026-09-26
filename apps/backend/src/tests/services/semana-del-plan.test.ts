import { semanaDelPlanCon } from '../../services/semana-del-plan.service';

/**
 * La semana del plan: una sola cuenta para la rejilla, la clase en vivo, el
 * horario en vivo y el calendario. Y el inicio del plan de cada lapso, libre:
 * antes de él, la semana es 0 (diagnóstico).
 */
const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
const LAPSOS = [
    { id: 'l1', startDate: d('2026-09-14'), endDate: d('2026-12-15') },
    { id: 'l2', startDate: d('2027-01-11'), endDate: d('2027-04-02') },
    { id: 'l3', startDate: d('2027-04-12'), endDate: d('2027-07-16') },
];
const INICIO_DEL_ANO = d('2026-09-14');

describe('Semana del plan', () => {
    it('SEMANA-01: sin inicio del plan, cuenta desde el inicio del lapso (lunes 14/09 → semana 1; lunes 21/09 → 2)', () => {
        expect(semanaDelPlanCon(d('2026-09-14'), LAPSOS, INICIO_DEL_ANO)).toMatchObject({ lapso: '1', semana: 1, antesDelPlan: false });
        expect(semanaDelPlanCon(d('2026-09-21'), LAPSOS, INICIO_DEL_ANO).semana).toBe(2);
    });

    it('SEMANA-02: en el 2º lapso cuenta desde el 2º lapso, no desde el inicio del año', () => {
        // 18/01/2027 es la 2ª semana del 2º lapso. Contando desde el año salía la 19.
        expect(semanaDelPlanCon(d('2027-01-18'), LAPSOS, INICIO_DEL_ANO)).toMatchObject({ lapso: '2', semana: 2 });
    });

    it('SEMANA-03: con dos semanas de diagnóstico, antes del plan es la semana 0 y se llama como diga el liceo', () => {
        const conDiagnostico = LAPSOS.map((l) =>
            l.id === 'l1' ? { ...l, inicioDelPlan: d('2026-09-28'), nombreAntesDelPlan: 'Adaptación' } : l
        );
        expect(semanaDelPlanCon(d('2026-09-15'), conDiagnostico, INICIO_DEL_ANO)).toMatchObject({
            lapso: '1',
            semana: 0,
            antesDelPlan: true,
            nombreAntesDelPlan: 'Adaptación',
        });
        expect(semanaDelPlanCon(d('2026-09-28'), conDiagnostico, INICIO_DEL_ANO)).toMatchObject({ semana: 1, antesDelPlan: false });
        expect(semanaDelPlanCon(d('2026-10-05'), conDiagnostico, INICIO_DEL_ANO).semana).toBe(2);
        // Y las semanas del lapso se cuentan desde que empieza el plan.
        expect(semanaDelPlanCon(d('2026-10-05'), conDiagnostico, INICIO_DEL_ANO).semanasDelLapso).toBe(12);
    });

    it('SEMANA-04: sin nombre, las semanas de antes se llaman «Diagnóstico»', () => {
        const conDiagnostico = LAPSOS.map((l) => (l.id === 'l1' ? { ...l, inicioDelPlan: d('2026-09-28') } : l));
        expect(semanaDelPlanCon(d('2026-09-15'), conDiagnostico, INICIO_DEL_ANO).nombreAntesDelPlan).toBe('Diagnóstico');
    });

    it('SEMANA-05: un año sin lapsos cuenta desde el inicio del año (como antes); el fechaDesde del plan manda', () => {
        expect(semanaDelPlanCon(d('2026-09-21'), [], INICIO_DEL_ANO)).toMatchObject({ lapso: null, semana: 2 });
        expect(semanaDelPlanCon(d('2026-09-21'), LAPSOS, INICIO_DEL_ANO, d('2026-09-21')).semana).toBe(1);
    });
});
