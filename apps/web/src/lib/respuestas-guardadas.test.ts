import {
    guardarRespuesta,
    guardarRespuestasCrudas,
    leerRespuesta,
    olvidarLasRespuestas,
    TOPE_DE_RESPUESTAS,
} from './respuestas-guardadas';
import { CAJON_RESPUESTAS, conElCajon } from './base-del-telefono';
import { MAXIMO_DE_DIAS } from './lo-guardado-en-el-telefono';

const cajones = new Map<string, Map<string, unknown>>();

function falsoIndexedDB() {
    const transaccion = (nombre: string) => {
        const tx: any = { error: null };
        const almacen = cajones.get(nombre) ?? new Map();
        cajones.set(nombre, almacen);
        const peticiones: Array<() => void> = [];
        const peticion = (valor: unknown) => {
            const p: any = { result: valor };
            peticiones.push(() => p.onsuccess?.());
            return p;
        };
        let operacionesPendientes = 0;
        const verificarCompletado = () => {
            if (operacionesPendientes <= 0) {
                setTimeout(() => tx.oncomplete?.(), 0);
            }
        };

        tx.objectStore = () => ({
            get: (k: string) => peticion(almacen.get(k)),
            put: (v: any, k?: string) => peticion(almacen.set(k ?? v.id, v)),
            delete: (k: string) => peticion(almacen.delete(k)),
            clear: () => peticion(almacen.clear()),
            count: () => peticion(almacen.size),
            openCursor: () => {
                const entries = Array.from(almacen.entries());
                let idx = 0;
                const p: any = {};
                operacionesPendientes++;
                const step = () => {
                    if (idx >= entries.length) {
                        p.result = null;
                        p.onsuccess?.();
                        operacionesPendientes--;
                        verificarCompletado();
                        return;
                    }
                    const [k, v] = entries[idx];
                    const c: any = {
                        key: k,
                        value: v,
                        delete: () => {
                            almacen.delete(k);
                        },
                        continue: () => {
                            idx++;
                            step();
                        },
                    };
                    p.result = c;
                    p.onsuccess?.();
                };
                peticiones.push(step);
                return p;
            },
        });
        setTimeout(() => {
            for (const fn of peticiones) fn();
            verificarCompletado();
        }, 0);
        return tx;
    };
    return {
        open: () => {
            const p: any = {};
            setTimeout(() => {
                p.result = {
                    objectStoreNames: { contains: () => true },
                    transaction: transaccion,
                    close: () => undefined,
                };
                p.onsuccess?.();
            }, 0);
            return p;
        },
    };
}

describe('Respuestas guardadas — Caducidad, precedencia y recorte seguro', () => {
    const dueno = 'liceo:admin';

    beforeEach(async () => {
        cajones.clear();
        (globalThis as any).indexedDB = falsoIndexedDB();
        await olvidarLasRespuestas();
    });

    it('un paquete nuevo vence a una fila suelta vieja (Punto 3)', async () => {
        const clave = '/api/students/1';
        const haceDosDias = Date.now() - 2 * 24 * 60 * 60 * 1000;

        // Fila suelta vieja
        await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) =>
            c.put({ dueno, clave, cuando: haceDosDias, datos: { nombre: 'Dato Viejo de Hace Dos Días' } }, `${dueno}|${clave}`)
        );

        // Guardamos paquete nuevo (crudo) hoy
        await guardarRespuestasCrudas(dueno, [
            {
                clave,
                texto: JSON.stringify({ nombre: 'Dato Nuevo del Paquete de Hoy' }),
                bytes: 50,
            },
        ]);

        const respuesta = await leerRespuesta(dueno, clave);
        expect(respuesta).not.toBeNull();
        expect((respuesta?.datos as any)?.nombre).toBe('Dato Nuevo del Paquete de Hoy');
    });

    it('un cambio posterior al paquete vence al paquete (Punto 3)', async () => {
        const clave = '/api/grades/1';

        // Guardamos paquete
        await guardarRespuestasCrudas(dueno, [
            {
                clave,
                texto: JSON.stringify({ calificacion: 15 }),
                bytes: 30,
            },
        ]);

        // Simular que el paquete fue de hoy temprano
        // Llega un cambio posterior (guardarRespuesta)
        await guardarRespuesta(dueno, clave, { calificacion: 19 });

        const respuesta = await leerRespuesta(dueno, clave);
        expect(respuesta).not.toBeNull();
        expect((respuesta?.datos as any)?.calificacion).toBe(19);
    });

    it('el paquete caduca a los 7 días y devuelve null (Punto 2)', async () => {
        const clave = '/api/sections';
        await guardarRespuestasCrudas(dueno, [
            {
                clave,
                texto: JSON.stringify({ lista: ['A', 'B'] }),
                bytes: 40,
            },
        ]);

        // Forzar el índice a tener 8 días de antigüedad
        const haceOchoDias = Date.now() - 8 * 24 * 60 * 60 * 1000;
        await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => {
            c.put(JSON.stringify({ cuando: haceOchoDias, mapa: { [clave]: 0 } }), `${dueno}|__indice__`);
        });
        // Limpiar memoria para que lea de IndexedDB
        await olvidarLasRespuestas();
        await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => {
            c.put(JSON.stringify({ cuando: haceOchoDias, mapa: { [clave]: 0 } }), `${dueno}|__indice__`);
            c.put(JSON.stringify({ [clave]: JSON.stringify({ lista: ['A', 'B'] }) }), `${dueno}|__bloque_0__`);
        });

        const respuesta = await leerRespuesta(dueno, clave);
        expect(respuesta).toBeNull();
    });

    it('una fila suelta caduca a los 7 días y devuelve null', async () => {
        const clave = '/api/teachers/1';
        const haceOchoDias = Date.now() - (MAXIMO_DE_DIAS + 1) * 24 * 60 * 60 * 1000;

        await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) =>
            c.put({ dueno, clave, cuando: haceOchoDias, datos: { profe: 'Carlos' } }, `${dueno}|${clave}`)
        );

        const respuesta = await leerRespuesta(dueno, clave);
        expect(respuesta).toBeNull();
    });

    it('el recorte nunca toca __indice__ ni __bloque_*__ y borra las filas sueltas más viejas (Punto 4)', async () => {
        // Guardamos paquete con su índice y bloque
        await guardarRespuestasCrudas(dueno, [
            {
                clave: '/api/materia/1',
                texto: JSON.stringify({ nombre: 'Matemática' }),
                bytes: 30,
            },
        ]);

        const ahora = Date.now();
        // Insertamos filas sueltas con distintas antigüedades (una caducada, una vieja, una nueva)
        const claveCaducada = '/api/suelta/caducada';
        const claveVieja = '/api/suelta/vieja';
        const claveNueva = '/api/suelta/nueva';

        await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => {
            c.put({ dueno, clave: claveCaducada, cuando: ahora - 8 * 24 * 60 * 60 * 1000, datos: { v: 0 } }, `${dueno}|${claveCaducada}`);
            c.put({ dueno, clave: claveVieja, cuando: ahora - 2 * 24 * 60 * 60 * 1000, datos: { v: 1 } }, `${dueno}|${claveVieja}`);
            c.put({ dueno, clave: claveNueva, cuando: ahora - 1000, datos: { v: 2 } }, `${dueno}|${claveNueva}`);
        });

        const { recortarLasRespuestas } = await import('./respuestas-guardadas');
        await recortarLasRespuestas();

        // 1. El índice y los bloques siguen intactos
        const cajon = cajones.get(CAJON_RESPUESTAS);
        expect(cajon?.has(`${dueno}|__indice__`)).toBe(true);
        expect(cajon?.has(`${dueno}|__bloque_0__`)).toBe(true);

        // 2. La caducada fue eliminada
        expect(cajon?.has(`${dueno}|${claveCaducada}`)).toBe(false);

        // 3. Las vigentes siguen existiendo
        expect(cajon?.has(`${dueno}|${claveVieja}`)).toBe(true);
        expect(cajon?.has(`${dueno}|${claveNueva}`)).toBe(true);
    });
});
