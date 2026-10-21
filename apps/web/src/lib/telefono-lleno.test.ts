import { CAJON_POR_ENVIAR, CAJON_RESPUESTAS, SinEspacio, conElCajon } from './base-del-telefono';
import { encolar, type NuevoCambio } from './por-enviar';

/**
 * EL TELÉFONO LLENO (GUARDA-01, 2026-10-04)
 *
 * Antes, si no cabía, el cajón respondía `null` y `encolar` devolvía un número
 * como si lo hubiera guardado: la pantalla decía «pendiente» y no había nada.
 * Ahora: se tira lo que se vuelve a bajar y se intenta otra vez; si aun así no
 * cabe, es un error que la pantalla dice.
 *
 * Una IndexedDB de mentira, mínima: cada cajón es un Map y `lleno` dice cuántos
 * bytes caben (lo de `respuestas` ocupa sitio hasta que se vacía).
 */

const cajones = new Map<string, Map<string, unknown>>();
let sitio = 0;
const ocupado = () => Array.from(cajones.values()).reduce((n, m) => n + m.size, 0);

function falsoIndexedDB() {
    const transaccion = (nombre: string) => {
        const tx: any = { error: null };
        const almacen = cajones.get(nombre) ?? new Map();
        cajones.set(nombre, almacen);
        const copia = new Map(almacen);
        const peticion = (valor: unknown) => {
            const p: any = { result: valor };
            setTimeout(() => p.onsuccess?.(), 0);
            return p;
        };
        tx.objectStore = () => ({
            put: (v: any, k?: string) => peticion(copia.set(k ?? v.id, v)),
            delete: (k: string) => peticion(copia.delete(k)),
            clear: () => peticion(copia.clear()),
            getAll: () => peticion(Array.from(copia.values())),
        });
        setTimeout(() => {
            const otros = ocupado() - almacen.size;
            if (otros + copia.size > sitio) {
                tx.error = Object.assign(new Error('lleno'), { name: 'QuotaExceededError' });
                tx.onabort?.();
            } else {
                almacen.clear();
                for (const [k, v] of copia) almacen.set(k, v);
                tx.oncomplete?.();
            }
        }, 1);
        return tx;
    };
    return {
        open: () => {
            const p: any = {};
            setTimeout(() => {
                p.result = { objectStoreNames: { contains: () => true }, transaction: transaccion, close: () => undefined };
                p.onsuccess?.();
            }, 0);
            return p;
        },
    };
}

const cambio = (n: number): NuevoCambio => ({
    tipo: 'observacion',
    grupo: 2,
    metodo: 'post',
    url: '/observations',
    datos: { n },
    objeto: `obs-${n}`,
    resumen: `Observación ${n}`,
});

describe('El teléfono lleno (GUARDA-01)', () => {
    beforeEach(() => {
        cajones.clear();
        (globalThis as any).indexedDB = falsoIndexedDB();
    });

    it('sin sitio, se tira lo que se vuelve a bajar y lo pendiente se guarda', async () => {
        sitio = 3;
        cajones.set(CAJON_RESPUESTAS, new Map([['a', 1], ['b', 2], ['c', 3]]));
        await encolar('liceo:yo', cambio(1));
        expect(cajones.get(CAJON_POR_ENVIAR)!.size).toBe(1);
        expect(cajones.get(CAJON_RESPUESTAS)!.size).toBe(0);
    });

    it('si aun así no cabe, es un error (nunca «pendiente» sin nada)', async () => {
        sitio = 0;
        await expect(encolar('liceo:yo', cambio(2))).rejects.toBeInstanceOf(SinEspacio);
    });

    it('lo descargado sigue siendo una ayuda: sin sitio, nada se rompe', async () => {
        sitio = 0;
        await expect(conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => c.put(1, 'x'))).resolves.toBeNull();
    });
});
