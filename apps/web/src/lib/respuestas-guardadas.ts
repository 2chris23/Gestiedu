/**
 * CADA RESPUESTA DEL SERVIDOR, GUARDADA EN EL TELÉFONO
 *
 * Lo que React Query guarda (`MemoriaDelTelefono`) es lo que había en MEMORIA:
 * lo de las pantallas abiertas. Para que sin conexión se vea también lo que se
 * bajó en segundo plano (`DescargaEnSegundoPlano`) y lo de cualquier pantalla
 * que lo pidiera alguna vez, cada lectura que contesta bien se guarda aquí por
 * su dirección, y cuando el servidor no contesta, `lib/axios.ts` devuelve lo
 * guardado en su lugar. Como WhatsApp: se abre y ahí está lo último.
 *
 * Las reglas de lo guardado, las de siempre:
 *  - **Es de quien lo bajó** (`<liceo>:<id>` en la llave): con otra sesión no
 *    se abre, y al entrar otra persona se borra lo del anterior.
 *  - **Se borra al cerrar sesión.**
 *  - **Caduca** a los `MAXIMO_DE_DIAS`, y no pasa de `TOPE_DE_RESPUESTAS`.
 */

import { CAJON_RESPUESTAS, abrirLaBase, conElCajon } from './base-del-telefono';
import { MAXIMO_DE_DIAS } from './lo-guardado-en-el-telefono';

/** Lo que no se guarda: la hora (sin conexión se cuenta aparte), sesiones y salud. */
const NO_SE_GUARDA = [/^\/?auth\/(refresh|logout|sessions)/, /^\/?health/, /^\/?time\b/, /^\/?avisos\/telefonos/];

/** Una respuesta más grande no se guarda: llenaría el teléfono. */
const TAMANO_MAXIMO = 2_000_000;

export const TOPE_DE_RESPUESTAS = 1500;

interface Guardada {
    dueno: string;
    clave: string;
    cuando: number;
    datos: unknown;
}

/**
 * La llave de una lectura: su dirección con los parámetros ordenados, para que
 * `?a=1&b=2` y `?b=2&a=1` sean lo mismo, lleguen por `params` o en la dirección.
 */
export function claveDeLaPeticion(url: string, params?: Record<string, unknown> | null): string {
    const [camino, query = ''] = url.split('?');
    const todos = new URLSearchParams(query);
    for (const [k, v] of Object.entries(params ?? {})) {
        if (v === undefined || v === null) continue;
        todos.append(k, String(v));
    }
    const orden = [...todos.entries()].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
    const limpia = camino.replace(/^\/+/, '/').replace(/\/+$/, '') || '/';
    return orden.length ? `${limpia}?${new URLSearchParams(orden).toString()}` : limpia;
}

export function seGuarda(clave: string): boolean {
    const sinBarra = clave.replace(/^\/+/, '');
    return !NO_SE_GUARDA.some((r) => r.test(sinBarra));
}

const llave = (dueno: string, clave: string) => `${dueno}|${clave}`;

let escrituras = 0;

export async function guardarRespuesta(dueno: string | null, clave: string, datos: unknown): Promise<void> {
    if (!dueno || !seGuarda(clave)) return;
    let tamano = 0;
    try {
        tamano = JSON.stringify(datos)?.length ?? 0;
    } catch {
        return;
    }
    if (tamano > TAMANO_MAXIMO) return;
    const fila: Guardada = { dueno, clave, cuando: Date.now(), datos };
    await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => c.put(fila, llave(dueno, clave)));
    if (++escrituras % 50 === 0) void recortarLasRespuestas();
}

export async function leerRespuesta(dueno: string | null, clave: string): Promise<{ datos: unknown; cuando: number } | null> {
    if (!dueno) return null;
    const fila = await conElCajon<Guardada>(CAJON_RESPUESTAS, 'readonly', (c) => c.get(llave(dueno, clave)));
    if (!fila || fila.dueno !== dueno) return null;
    if (Date.now() - fila.cuando > MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000) return null;
    return { datos: fila.datos, cuando: fila.cuando };
}

/** Al cerrar sesión: todo. */
export async function olvidarLasRespuestas(): Promise<void> {
    await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => c.clear());
}

/** Al entrar alguien: lo de cualquier otro dueño, fuera. */
export async function olvidarLasRespuestasDeOtros(dueno: string): Promise<void> {
    const bd = await abrirLaBase();
    if (!bd) return;
    await new Promise<void>((resolver) => {
        try {
            const t = bd.transaction(CAJON_RESPUESTAS, 'readwrite');
            const cursor = t.objectStore(CAJON_RESPUESTAS).openKeyCursor();
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (!c) return;
                if (!String(c.key).startsWith(`${dueno}|`)) t.objectStore(CAJON_RESPUESTAS).delete(c.key);
                c.continue();
            };
            t.oncomplete = t.onerror = t.onabort = () => resolver();
        } catch {
            resolver();
        }
    });
    bd.close();
}

/** Lo caducado fuera, y si pasa del tope, lo más viejo. */
async function recortarLasRespuestas(): Promise<void> {
    const bd = await abrirLaBase();
    if (!bd) return;
    await new Promise<void>((resolver) => {
        try {
            const t = bd.transaction(CAJON_RESPUESTAS, 'readwrite');
            const almacen = t.objectStore(CAJON_RESPUESTAS);
            const contar = almacen.count();
            contar.onsuccess = () => {
                let sobran = contar.result - TOPE_DE_RESPUESTAS;
                const viejo = Date.now() - MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000;
                const cursor = almacen.index('cuando').openCursor();
                cursor.onsuccess = () => {
                    const c = cursor.result;
                    if (!c) return;
                    const fila = c.value as Guardada;
                    if (sobran > 0 || fila.cuando < viejo) {
                        c.delete();
                        sobran--;
                        c.continue();
                    }
                };
            };
            t.oncomplete = t.onerror = t.onabort = () => resolver();
        } catch {
            resolver();
        }
    });
    bd.close();
}
