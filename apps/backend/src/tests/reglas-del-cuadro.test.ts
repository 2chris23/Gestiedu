import { esReglasDelCuadro, ordenarElCuadro, puntajeDe, REGLAS_DEL_CUADRO_POR_DEFECTO, sabadoDeLaFoto } from '../services/reglas-del-cuadro';

/**
 * EL CUADRO DE HONOR: LA CUENTA (CUADRO-01…03)
 */
describe('El cuadro de honor: la cuenta (CUADRO)', () => {
    it('CUADRO-01: el puntaje con los pesos del liceo; nunca menos de 0', () => {
        // 18 de 20, 90 % de asistencia, 1 observación, pesos por defecto (80/20/5).
        expect(puntajeDe({ promedio: 18, asistencia: 90, observaciones: 1 }, REGLAS_DEL_CUADRO_POR_DEFECTO)).toEqual({
            puntosNotas: 72,
            puntosAsistencia: 18,
            resta: 5,
            puntaje: 85,
        });
        // Otro liceo: solo notas, y las observaciones no restan.
        expect(puntajeDe({ promedio: 15, asistencia: 50, observaciones: 9 }, { pesoNotas: 100, pesoAsistencia: 0, restaPorObservacion: 0 }).puntaje).toBe(75);
        expect(puntajeDe({ promedio: 2, asistencia: 10, observaciones: 10 }, REGLAS_DEL_CUADRO_POR_DEFECTO).puntaje).toBe(0);
        expect(esReglasDelCuadro({ pesoNotas: 0, pesoAsistencia: 0, restaPorObservacion: 0 })).toBe(false);
        expect(esReglasDelCuadro({ pesoNotas: 70, pesoAsistencia: 30, restaPorObservacion: 2 })).toBe(true);
    });

    it('CUADRO-02: puestos en el liceo y en su año; empate exacto, mismo puesto (no se desempata por el nombre)', () => {
        const filas = ordenarElCuadro(
            [
                { studentId: 'a', grado: 1, promedio: 18, asistencia: 100, observaciones: 0 },
                { studentId: 'b', grado: 1, promedio: 18, asistencia: 100, observaciones: 0 },
                { studentId: 'c', grado: 2, promedio: 19, asistencia: 100, observaciones: 0 },
                { studentId: 'd', grado: 1, promedio: 18, asistencia: 90, observaciones: 0 },
            ],
            REGLAS_DEL_CUADRO_POR_DEFECTO
        );
        const de = (id: string) => filas.find((f) => f.studentId === id)!;
        expect(de('c').puestoLiceo).toBe(1);
        expect([de('a').puestoLiceo, de('b').puestoLiceo]).toEqual([2, 2]);
        expect(de('d').puestoLiceo).toBe(4);
        expect([de('a').puestoAno, de('b').puestoAno, de('d').puestoAno, de('c').puestoAno]).toEqual([1, 1, 3, 1]);
    });

    it('CUADRO-03: el sábado de la foto', () => {
        expect(sabadoDeLaFoto('2026-10-03')).toBe('2026-10-03'); // sábado
        expect(sabadoDeLaFoto('2026-10-04')).toBe('2026-10-03'); // domingo
        expect(sabadoDeLaFoto('2026-10-09')).toBe('2026-10-03'); // viernes
        expect(sabadoDeLaFoto('2026-10-10')).toBe('2026-10-10');
    });
});
