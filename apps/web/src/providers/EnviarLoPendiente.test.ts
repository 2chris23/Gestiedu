/**
 * EL CAMBIO ENVENENADO NO ATASCA LA COLA (SINCON-13, 2026-10-04)
 *
 * Un teléfono con la app vieja y cambios de días: si la API cambió, uno de
 * ellos responde 400 para siempre. Ese pasa a «no se pudo» con su motivo y los
 * de detrás siguen subiendo. Un 429 («ahora no») no es un no: espera lo que
 * pide el servidor y no se pierde.
 */

const peticiones: Array<{ url: string }> = [];
const respuestas = new Map<string, () => Promise<unknown>>();

jest.mock('@/lib/axios', () => ({
    __esModule: true,
    default: {
        request: jest.fn((cfg: { url: string }) => {
            peticiones.push({ url: cfg.url });
            return (respuestas.get(cfg.url) ?? (() => Promise.resolve({ status: 200, data: {} })))();
        }),
    },
}));

const cambios = new Map<string, any>();
jest.mock('@/lib/por-enviar', () => {
    const real = jest.requireActual('@/lib/por-enviar');
    return {
        ...real,
        laCola: jest.fn(async () => real.ordenar(Array.from(cambios.values()))),
        pendientesDeOtros: jest.fn(async () => []),
        tirarLosDe: jest.fn(async () => undefined),
        actualizarCambio: jest.fn(async (id: string, c: any) => cambios.set(id, { ...cambios.get(id), ...c })),
        quitarCambio: jest.fn(async (id: string) => cambios.delete(id)),
    };
});

jest.mock('@/lib/estado-del-servidor', () => ({
    esQueNoContesta: (e: any) => !e?.response,
}));

import { subirLaCola } from './EnviarLoPendiente';

const cambio = (id: string, orden: number) => ({
    id,
    dueno: 'liceo:yo',
    tipo: 'observacion',
    grupo: 2,
    metodo: 'post',
    url: `/${id}`,
    objeto: id,
    resumen: id,
    hechoEn: new Date().toISOString(),
    orden,
    estado: 'pendiente',
    intentos: 0,
});

const error = (status: number, data: unknown = {}, headers: Record<string, string> = {}) => () =>
    Promise.reject({ response: { status, data, headers } });

describe('La cola sin conexión (SINCON-13)', () => {
    beforeEach(() => {
        peticiones.length = 0;
        respuestas.clear();
        cambios.clear();
    });

    it('un 400 pasa a «no se pudo» y los de detrás suben igual', async () => {
        cambios.set('a', cambio('a', 1));
        cambios.set('b', cambio('b', 2));
        cambios.set('c', cambio('c', 3));
        respuestas.set('/b', error(400, { error: 'La forma de la petición cambió' }));
        await subirLaCola('liceo:yo');
        expect(peticiones.map((p) => p.url)).toEqual(['/a', '/b', '/c']);
        expect([...cambios.keys()]).toEqual(['b']);
        expect(cambios.get('b')).toMatchObject({ estado: 'rechazado', motivo: 'La forma de la petición cambió' });
    });

    it('un 429 no se pierde: queda pendiente y espera lo que pide el servidor', async () => {
        cambios.set('a', cambio('a', 1));
        cambios.set('b', cambio('b', 2));
        respuestas.set('/a', error(429, {}, { 'retry-after': '120' }));
        const antes = Date.now();
        await subirLaCola('liceo:yo');
        // Se para (no desordena) y no se envía el de detrás.
        expect(peticiones.map((p) => p.url)).toEqual(['/a']);
        expect(cambios.get('a')).toMatchObject({ estado: 'pendiente', intentos: 1 });
        expect(cambios.get('a').noAntesDe).toBeGreaterThanOrEqual(antes + 120_000);
    });

    it('sin red, se para y espera con azar', async () => {
        cambios.set('a', cambio('a', 1));
        respuestas.set('/a', () => Promise.reject(new Error('Network Error')));
        await subirLaCola('liceo:yo');
        expect(cambios.get('a')).toMatchObject({ estado: 'pendiente', intentos: 1 });
        expect(cambios.get('a').noAntesDe - Date.now()).toBeLessThanOrEqual(5000);
    });
});
