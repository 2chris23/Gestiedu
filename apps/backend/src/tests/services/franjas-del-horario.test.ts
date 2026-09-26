import {
    calcularTurno,
    erroresDelHorario,
    franjasDelTurno,
    horarioParaGuardar,
    turnosDeLaConfig,
} from '../../utils/franjas-del-horario';

/**
 * El horario del liceo: el admin pone inicio y fin; el sistema cuenta las
 * horas y no deja guardar lo que no cuadra. Estas mismas cuentas están en la
 * copia de la web (`apps/web/src/lib/franjas-del-horario.test.ts`).
 */
describe('Franjas del horario', () => {
    const manana = { inicio: '07:00', fin: '12:30', duracion: 45, recreos: [{ despuesDe: 3, minutos: 15 }] };

    it('FRANJA-01: 07:00–12:30, horas de 45 y un recreo de 15 → 7 horas, el recreo 09:15–09:30', () => {
        const r = calcularTurno(manana);
        expect(r.errores).toEqual([]);
        expect(r.bloques).toBe(7);
        expect(r.franjas.filter((f) => f.type === 'class')).toHaveLength(7);
        expect(r.franjas.find((f) => f.type === 'break')).toMatchObject({ startTime: '09:15', endTime: '09:30' });
        expect(r.franjas[r.franjas.length - 1].endTime).toBe('12:30');
    });

    it('FRANJA-02: horas de 40 min hasta las 12:30 no cuadran: dice cuánto sobra y a qué hora acabar', () => {
        const r = calcularTurno({ ...manana, duracion: 40 });
        expect(r.bloques).toBe(0);
        expect(r.errores).toHaveLength(1);
        // 330 − 15 = 315 min de clase: 7 horas de 40 (280) y sobran 35.
        expect(r.errores[0]).toContain('caben 7 horas de 40 min');
        expect(r.errores[0]).toContain('sobran 35 min');
        expect(r.errores[0]).toContain('11:55');
        expect(r.errores[0]).toContain('12:35');
    });

    it('FRANJA-03: el fin antes del inicio, una duración absurda o un recreo al final no se aceptan', () => {
        expect(calcularTurno({ ...manana, fin: '06:00' }).errores[0]).toContain('tiene que ser después');
        expect(calcularTurno({ ...manana, duracion: 5 }).errores[0]).toContain('entre 15 y 180');
        expect(calcularTurno({ ...manana, recreos: [{ despuesDe: 7, minutos: 15 }] }).errores[0]).toContain('última hora');
        expect(calcularTurno({ ...manana, recreos: [{ despuesDe: 9, minutos: 15 }] }).errores[0]).toContain('solo hay');
        expect(
            calcularTurno({ ...manana, recreos: [{ despuesDe: 3, minutos: 15 }, { despuesDe: 3, minutos: 10 }] }).errores[0]
        ).toContain('dos recreos');
    });

    it('FRANJA-04: dos recreos se ponen cada uno en su sitio', () => {
        const r = calcularTurno({ inicio: '07:00', fin: '12:40', duracion: 45, recreos: [{ despuesDe: 2, minutos: 10 }, { despuesDe: 5, minutos: 15 }] });
        expect(r.errores).toEqual([]);
        expect(r.bloques).toBe(7);
        const recreos = r.franjas.filter((f) => f.type === 'break');
        expect(recreos.map((f) => f.startTime)).toEqual(['08:30', '10:55']);
    });

    it('FRANJA-05: lo guardado a la vieja se lee igual que antes (mañana 07:00–12:30; tarde 13:00 con las mismas horas)', () => {
        const viejo = { startTime: '07:00', blockDuration: 45, totalBlocks: 7, breakAfterBlock: 3, breakDuration: 15 };
        const t = turnosDeLaConfig(viejo);
        expect(t.MANANA).toMatchObject({ inicio: '07:00', fin: '12:30', duracion: 45 });
        expect(t.TARDE).toMatchObject({ inicio: '13:00', fin: '18:30', duracion: 45 });
        expect(franjasDelTurno(viejo, 'TARDE')[0]).toMatchObject({ startTime: '13:00', endTime: '13:45' });
        expect(franjasDelTurno(null, 'MANANA')).toHaveLength(8);
    });

    it('FRANJA-06: la tarde no puede empezar antes de que acabe la mañana', () => {
        const errores = erroresDelHorario({
            turnos: { MANANA: manana, TARDE: { inicio: '12:00', fin: '17:30', duracion: 45, recreos: [{ despuesDe: 3, minutos: 15 }] } },
        });
        expect(errores.join(' ')).toContain('antes de que acabe la mañana');
    });

    it('FRANJA-07: al guardar, la forma vieja se rellena con la mañana (para lo que aún la lea)', () => {
        const g = horarioParaGuardar({
            turnos: { MANANA: { inicio: '07:00', fin: '12:00', duracion: 40, recreos: [{ despuesDe: 4, minutos: 20 }] } },
        });
        expect(g).toMatchObject({ startTime: '07:00', blockDuration: 40, totalBlocks: 7, breakAfterBlock: 4, breakDuration: 20 });
        expect(g.turnos?.TARDE).toBeDefined();
    });
});
