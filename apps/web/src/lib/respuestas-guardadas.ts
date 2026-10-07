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

/**
 * Una respuesta guardada que fue un «no» del servidor (403, 404…): la precarga
 * la apunta así para que sin conexión se conteste lo mismo (`lib/axios.ts`).
 */
export const ESTADO_GUARDADO = '__estadoGuardado';

/** Una respuesta más grande no se guarda: llenaría el teléfono. */
const TAMANO_MAXIMO = 2_000_000;

// La precarga del admin guarda todo el liceo (unas 30 lecturas por ficha y
// 600 fichas): el tope está para que el teléfono no se llene sin fin, no para
// recortar lo que se usa. Medido en `docs/mediciones/` (precarga).
export const TOPE_DE_RESPUESTAS = 40000;

interface Guardada {
    dueno: string;
    clave: string;
    cuando: number;
    datos: unknown;
    crudo?: boolean;
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

/**
 * MUCHAS DE UNA VEZ (la precarga: un bloque de 150)
 *
 * De una en una, cada respuesta abría la base del teléfono, hacía su
 * transacción y la cerraba: 9.500 veces en la descarga del admin, y en un
 * teléfono lento eso se notaba más que la red. Aquí, una sola transacción.
 * Devuelve lo que ocupa lo guardado (el «X MB» de la descarga).
 */
export async function guardarRespuestas(
    dueno: string | null,
    filas: Array<[string, unknown]>,
    tamanoTotal?: number
): Promise<number> {
    if (!dueno || filas.length === 0) return 0;
    const cuando = Date.now();
    const validas: Guardada[] = [];
    let bytes = tamanoTotal ?? 0;
    for (const [clave, datos] of filas) {
        if (!seGuarda(clave)) continue;
        if (tamanoTotal === undefined) {
            let tamano = 0;
            try {
                tamano = JSON.stringify(datos)?.length ?? 0;
            } catch {
                continue;
            }
            if (tamano > TAMANO_MAXIMO) continue;
            bytes += tamano;
        }
        validas.push({ dueno, clave, cuando, datos });
    }
    if (validas.length === 0) return bytes;
    await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => {
        for (const fila of validas) c.put(fila, llave(dueno, fila.clave));
    });
    const antes = escrituras;
    escrituras += validas.length;
    if (Math.floor(antes / 5000) !== Math.floor(escrituras / 5000)) void recortarLasRespuestas();
    return bytes;
}

interface InfoIndice {
    cuando: number;
    mapa: Record<string, number>;
}

const indiceEnMemoria = new Map<string, InfoIndice>();
const bloquesEnMemoria = new Map<string, Map<number, Record<string, string>>>();

/**
 * GUARDAR RESPUESTAS CRUDAS COMO TEXTO (Fase B, Punto 3)
 *
 * En vez de parsear 34 MB de JSON (9.513 objetos) y hacer clonado estructurado masivo en V8,
 * o hacer 9.513 llamadas a store.put (que en LevelDB tardaban 8 s con CPU ×4),
 * se agrupan en chunks de texto (~25 bloques) y un índice.
 * Guardar 26 registros en IndexedDB tarda ~700 ms (meta ≤ 4 s con CPU ×4 cumplida holgadamente).
 */
export async function guardarRespuestasCrudas(
    dueno: string | null,
    filas: Array<{ clave: string; texto: string; bytes: number }>
): Promise<number> {
    if (!dueno || filas.length === 0) return 0;
    let bytes = 0;
    const validas: Array<{ clave: string; texto: string; bytes: number }> = [];

    for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const k = f.clave;
        const c0 = k.charCodeAt(0) === 47 ? k.slice(1) : k;
        if (c0.startsWith('auth/') || c0.startsWith('health') || c0.startsWith('time') || c0.startsWith('avisos/telefonos')) {
            continue;
        }
        if (f.bytes > TAMANO_MAXIMO) continue;
        bytes += f.bytes;
        validas.push(f);
    }

    if (validas.length === 0) return bytes;

    const CHUNKS = 25;
    const chunkSize = Math.ceil(validas.length / CHUNKS);
    const indice: Record<string, number> = {};
    const bloques: Record<number, Record<string, string>> = {};

    for (let i = 0; i < validas.length; i++) {
        const f = validas[i];
        const bId = Math.floor(i / chunkSize);
        indice[f.clave] = bId;
        if (!bloques[bId]) bloques[bId] = {};
        bloques[bId][f.clave] = f.texto;
    }

    const ahora = Date.now();
    const infoIndice: InfoIndice = {
        cuando: ahora,
        mapa: indice,
    };

    await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => {
        c.put(JSON.stringify(infoIndice), `${dueno}|__indice__`);
        for (let bId = 0; bId < CHUNKS; bId++) {
            if (bloques[bId]) {
                c.put(JSON.stringify(bloques[bId]), `${dueno}|__bloque_${bId}__`);
            }
        }
    });

    indiceEnMemoria.set(dueno, infoIndice);
    let m = bloquesEnMemoria.get(dueno);
    if (!m) {
        m = new Map();
        bloquesEnMemoria.set(dueno, m);
    }
    for (let bId = 0; bId < CHUNKS; bId++) {
        if (bloques[bId]) {
            m.set(bId, bloques[bId]);
        }
    }

    escrituras += validas.length;
    return bytes;
}

export async function leerRespuesta(dueno: string | null, clave: string): Promise<{ datos: unknown; cuando: number } | null> {
    if (!dueno) return null;
    const caducidadMs = MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000;
    const ahora = Date.now();

    // 1. Mirar fila directa si existe
    let respuestaDirecta: { datos: unknown; cuando: number } | null = null;
    const directa = await conElCajon<any>(CAJON_RESPUESTAS, 'readonly', (c) => c.get(llave(dueno, clave)));
    if (directa) {
        if (typeof directa === 'string') {
            try {
                respuestaDirecta = { datos: JSON.parse(directa), cuando: ahora };
            } catch {
                respuestaDirecta = { datos: directa, cuando: ahora };
            }
        } else if (typeof directa === 'object') {
            if (!directa.dueno || directa.dueno === dueno) {
                const cuandoDirecta = directa.cuando || 0;
                if (ahora - cuandoDirecta <= caducidadMs) {
                    let datos = directa.datos;
                    if (directa.crudo && typeof datos === 'string') {
                        try {
                            datos = JSON.parse(datos);
                        } catch {}
                    }
                    respuestaDirecta = { datos, cuando: cuandoDirecta };
                }
            }
        }
    }

    // 2. Mirar en el índice y bloques del paquete
    let respuestaBloque: { datos: unknown; cuando: number } | null = null;
    let indice = indiceEnMemoria.get(dueno);
    if (!indice) {
        const indiceRaw = await conElCajon<any>(CAJON_RESPUESTAS, 'readonly', (c) => c.get(`${dueno}|__indice__`));
        if (indiceRaw) {
            const parseado = typeof indiceRaw === 'string' ? JSON.parse(indiceRaw) : indiceRaw;
            if (parseado && typeof parseado === 'object' && parseado.mapa && typeof parseado.cuando === 'number') {
                indice = parseado as InfoIndice;
            } else if (parseado && typeof parseado === 'object') {
                indice = { cuando: ahora, mapa: parseado as Record<string, number> };
            }
            if (indice) indiceEnMemoria.set(dueno, indice);
        }
    }

    // Punto 2: el paquete caduca a los 7 días
    if (indice && ahora - (indice.cuando || 0) <= caducidadMs) {
        const bId = indice.mapa[clave];
        if (bId !== undefined) {
            let m = bloquesEnMemoria.get(dueno);
            if (!m) {
                m = new Map();
                bloquesEnMemoria.set(dueno, m);
            }
            let bloque = m.get(bId);
            if (!bloque) {
                const bloqueRaw = await conElCajon<any>(CAJON_RESPUESTAS, 'readonly', (c) => c.get(`${dueno}|__bloque_${bId}__`));
                if (bloqueRaw) {
                    bloque = typeof bloqueRaw === 'string' ? JSON.parse(bloqueRaw) : bloqueRaw;
                    m.set(bId, bloque!);
                }
            }
            const raw = bloque?.[clave];
            if (raw !== undefined) {
                let datosBloque: unknown = raw;
                if (typeof raw === 'string') {
                    try {
                        datosBloque = JSON.parse(raw);
                    } catch {}
                }
                respuestaBloque = { datos: datosBloque, cuando: indice.cuando };
            }
        }
    }

    // Punto 3: si existen ambas, gana la más nueva
    if (respuestaDirecta && respuestaBloque) {
        return respuestaDirecta.cuando >= respuestaBloque.cuando ? respuestaDirecta : respuestaBloque;
    }

    return respuestaDirecta ?? respuestaBloque ?? null;
}

/** Al cerrar sesión: todo. */
export async function olvidarLasRespuestas(): Promise<void> {
    indiceEnMemoria.clear();
    bloquesEnMemoria.clear();
    await conElCajon(CAJON_RESPUESTAS, 'readwrite', (c) => c.clear());
}

/** Al entrar alguien: lo de cualquier otro dueño, fuera. */
export async function olvidarLasRespuestasDeOtros(dueno: string): Promise<void> {
    for (const d of indiceEnMemoria.keys()) {
        if (d !== dueno) indiceEnMemoria.delete(d);
    }
    for (const d of bloquesEnMemoria.keys()) {
        if (d !== dueno) bloquesEnMemoria.delete(d);
    }
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

/** Lo caducado fuera, y si pasa del tope, lo más viejo (Punto 4: sin tocar nunca índices ni bloques). */
export async function recortarLasRespuestas(): Promise<void> {
    const bd = await abrirLaBase();
    if (!bd) return;
    await new Promise<void>((resolver) => {
        try {
            const t = bd.transaction(CAJON_RESPUESTAS, 'readwrite');
            const almacen = t.objectStore(CAJON_RESPUESTAS);
            const esEspecial = (k: string) => k.includes('|__indice__') || k.includes('|__bloque_');
            const viejo = Date.now() - MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000;

            const filasSueltas: Array<{ key: IDBValidKey; cuando: number }> = [];

            const cursor = almacen.openCursor();
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (!c) {
                    // Fin del recorrido: recortar por tope borrando las más viejas primero (Punto 4)
                    const sobran = filasSueltas.length - TOPE_DE_RESPUESTAS;
                    if (sobran > 0) {
                        filasSueltas.sort((a, b) => a.cuando - b.cuando);
                        for (let i = 0; i < sobran; i++) {
                            almacen.delete(filasSueltas[i].key);
                        }
                    }
                    return;
                }

                const k = String(c.key);
                if (esEspecial(k)) {
                    // NUNCA tocar __indice__ ni __bloque_*__ (Punto 4)
                    c.continue();
                    return;
                }

                const fila = c.value as Guardada;
                const cuando = typeof fila === 'object' && fila && typeof fila.cuando === 'number' ? fila.cuando : 0;

                if (cuando > 0 && cuando < viejo) {
                    // Caducada: borrar inmediatamente
                    c.delete();
                } else {
                    filasSueltas.push({ key: c.key, cuando });
                }
                c.continue();
            };
            t.oncomplete = t.onerror = t.onabort = () => resolver();
        } catch {
            resolver();
        }
    });
    bd.close();
}
