import { API_URL } from '@/config/env';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';
import { conAzar } from '@/lib/azar';
import { ESTADO_GUARDADO, guardarRespuestas, guardarRespuestasCrudas } from '@/lib/respuestas-guardadas';

/**
 * LA DESCARGA EN CUBOS, DEL LADO DEL TELÉFONO (18-oct-2026)
 *
 * Regla de Cristian: lo único que frena la descarga es el teléfono o su
 * internet, nunca el sistema. El servidor ya lo tiene TODO armado
 * (`services/cubos-de-precarga.service.ts`); aquí solo se baja:
 *
 *   1. `POST /precarga/indice`: qué cubos son míos, con su huella y su peso.
 *      El total se sabe desde el primer instante: la barra es exacta.
 *   2. Cada cubo que no tengo (o que cambió de huella), de 3 en 3, con
 *      `Range` para seguir donde se cortó (como WhatsApp al restaurar).
 *   3. Cada cubo se guarda en cuanto llega, no todo al final.
 *
 * La barra: lo recibido y lo guardado frente al total, y NUNCA baja.
 * Después, ponerse al día es lo mismo: el índice dice qué cubos cambiaron.
 */

const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
const A_LA_VEZ = 3;
const LLAVE = 'gestiedu:cubos';

export interface CuboDelIndice {
    clave: string;
    huella: string;
    bytes: number;
}
export interface Indice {
    marca: number;
    paginas: string[];
    cubos: CuboDelIndice[];
    bytes: number;
}
export type RespuestaDelIndice = { listo: Indice } | { preparando: { delante: number } } | 'no-hay' | 'sin-conexion';

interface Guardados {
    dueno: string;
    huellas: Record<string, string>;
}

function leer(dueno: string): Record<string, string> {
    try {
        const g = JSON.parse(localStorage.getItem(LLAVE) || 'null') as Guardados | null;
        return g && g.dueno === dueno ? g.huellas ?? {} : {};
    } catch {
        return {};
    }
}

function escribir(dueno: string, huellas: Record<string, string>) {
    try {
        localStorage.setItem(LLAVE, JSON.stringify({ dueno, huellas }));
    } catch {
        /* teléfono lleno: la próxima vez se vuelven a bajar, no se pierde nada */
    }
}

export function olvidarLosCubos(): void {
    try {
        localStorage.removeItem(LLAVE);
    } catch {
        /* nada */
    }
}

/** ¿Este teléfono bajó ya con cubos lo de esta persona? */
export function tieneCubos(dueno: string): boolean {
    return Object.keys(leer(dueno)).length > 0;
}

async function cabeceras(): Promise<Record<string, string>> {
    const token = await conseguirCredencial();
    const salida: Record<string, string> = {};
    if (token) salida.Authorization = `Bearer ${token}`;
    if (typeof document !== 'undefined') {
        const m = document.cookie.match(/(?:^|;\s*)institute_slug=([^;]*)/);
        if (m) salida['X-Institute-Slug'] = decodeURIComponent(m[1]);
    }
    return salida;
}

export async function pedirElIndice(): Promise<RespuestaDelIndice> {
    try {
        const r = await fetch(`${API_BASE_URL}/precarga/indice`, {
            method: 'POST',
            headers: { ...(await cabeceras()), 'Content-Type': 'application/json' },
            credentials: 'include',
            body: '{}',
        });
        if (r.status === 404) return 'no-hay'; // un servidor de antes de los cubos
        if (r.status === 202) {
            const d = (await r.json().catch(() => ({}))) as { delante?: number };
            return { preparando: { delante: Number(d.delante ?? 0) } };
        }
        if (!r.ok) return 'sin-conexion';
        return { listo: (await r.json()) as Indice };
    } catch {
        return 'sin-conexion';
    }
}

/** Baja un cubo entero; si se corta, sigue desde el último byte (`Range` + `If-Range`). */
async function bajarUnCubo(
    c: CuboDelIndice,
    alRecibir: (n: number) => void,
    cancelada: () => boolean,
    hayConexion: () => boolean,
    /** true: se fue la conexión (la pantalla dice «Esperando…»); false: volvió. */
    alEsperar: (esperando: boolean) => void
): Promise<Uint8Array | 'cancelada'> {
    const trozos: Uint8Array[] = [];
    let recibido = 0;
    let intento = 0;
    for (;;) {
        if (cancelada()) return 'cancelada';
        if (!hayConexion()) {
            alEsperar(true);
            await new Promise((r) => setTimeout(r, 1000));
            continue;
        }
        try {
            const cab = await cabeceras();
            if (recibido > 0) {
                cab.Range = `bytes=${recibido}-`;
                cab['If-Range'] = `"${c.huella}"`;
            }
            const r = await fetch(`${API_BASE_URL}/precarga/cubo/${encodeURIComponent(c.clave)}`, { headers: cab, credentials: 'include' });
            if (r.status === 200 && recibido > 0) {
                // El cubo cambió mientras tanto (If-Range no coincidió): de cero.
                alRecibir(-recibido);
                trozos.length = 0;
                recibido = 0;
            }
            if (r.status !== 200 && r.status !== 206) throw new Error(`cubo ${r.status}`);
            alEsperar(false);
            const lector = r.body!.getReader();
            for (;;) {
                if (cancelada()) {
                    void lector.cancel();
                    return 'cancelada';
                }
                const { done, value } = await lector.read();
                if (done) break;
                trozos.push(value);
                recibido += value.byteLength;
                alRecibir(value.byteLength);
            }
            const todo = new Uint8Array(recibido);
            let o = 0;
            for (const t of trozos) {
                todo.set(t, o);
                o += t.byteLength;
            }
            return todo;
        } catch {
            alEsperar(true);
            intento = Math.min(intento + 1, 5);
            await new Promise((r) => setTimeout(r, conAzar(Math.min(15_000, 800 * 2 ** intento))));
        }
    }
}

/** Abre el cubo (gzip, una lectura por línea) y lo guarda. Devuelve lo que ocupa guardado. */
async function guardarElCubo(dueno: string, clave: string, gz: Uint8Array): Promise<number> {
    const texto = await new Response(new Blob([gz as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const datos: Array<{ clave: string; texto: string; bytes: number }> = [];
    const negadas: Array<[string, unknown]> = [];
    for (const linea of texto.split('\n')) {
        if (!linea) continue;
        const d = linea.indexOf(',"d":');
        if (d !== -1) {
            try {
                const clave = JSON.parse(linea.slice(5, d)) as string;
                datos.push({ clave, texto: linea.slice(d + 5, -1), bytes: linea.length });
            } catch {
                /* línea rota: la siguiente pasada la trae */
            }
            continue;
        }
        try {
            const f = JSON.parse(linea) as { c: string; f: number };
            // Un «no es tuyo» se guarda como respuesta; un 5xx, no (llegará al rehacerse el cubo).
            if (f.f >= 400 && f.f < 500 && f.f !== 429) negadas.push([f.c, { [ESTADO_GUARDADO]: f.f }]);
        } catch {
            /* nada */
        }
    }
    const bytes = await guardarRespuestasCrudas(dueno, datos, clave);
    await guardarRespuestas(dueno, negadas);
    return bytes;
}

export interface AvanceDeCubos {
    recibidos: number;
    guardados: number;
    total: number;
    /** 0..100, nunca baja. */
    porcentaje: number;
    velocidad: number | null;
    /** Sin conexión: se espera y se sigue sola en cuanto vuelva. */
    esperando: boolean;
}

/**
 * Baja los cubos del índice que este teléfono no tiene con esa huella.
 * Devuelve cuánto ocupa lo guardado, o 'cancelada'.
 */
export async function bajarLosCubos(
    dueno: string,
    indice: Indice,
    o: { alAvanzar?: (a: AvanceDeCubos) => void; cancelada: () => boolean; hayConexion: () => boolean }
): Promise<{ guardado: number; bajados: number } | 'cancelada'> {
    const tengo = leer(dueno);
    // Primero lo compartido (lo del liceo y la sección: el Inicio), luego lo suyo.
    const orden = (k: string) => (k.startsWith('liceo:') ? 0 : k.startsWith('seccion:') ? 1 : 2);
    const faltan = indice.cubos.filter((c) => tengo[c.clave] !== c.huella).sort((a, b) => orden(a.clave) - orden(b.clave));
    const total = faltan.reduce((a, c) => a + c.bytes, 0);
    let recibidos = 0;
    let guardados = 0;
    let mejor = 0;
    const sinRed = new Set<string>();
    let guardado = 0;
    const empezo = performance.now();
    const muestras: Array<[number, number]> = [];
    const avisar = () => {
        const ahora = performance.now();
        muestras.push([ahora, recibidos]);
        while (muestras.length > 2 && ahora - muestras[0][0] > 4000) muestras.shift();
        const [t0, b0] = muestras[0];
        const velocidad = ahora - t0 > 800 ? ((recibidos - b0) * 1000) / (ahora - t0) : ahora - empezo > 800 ? (recibidos * 1000) / (ahora - empezo) : null;
        // Bajar es el 90 % del camino y guardar el 10 %: las dos cosas solo suben.
        const p = total > 0 ? Math.floor(((Math.min(recibidos, total) / total) * 0.9 + (Math.min(guardados, total) / total) * 0.1) * 100) : 100;
        mejor = Math.max(mejor, Math.min(p, 99));
        o.alAvanzar?.({ recibidos: Math.min(recibidos, total), guardados, total, porcentaje: mejor, velocidad, esperando: sinRed.size > 0 });
    };
    avisar();

    let i = 0;
    let cancelada = false;
    const trabajador = async () => {
        while (i < faltan.length && !cancelada) {
            const c = faltan[i++];
            const gz = await bajarUnCubo(
                c,
                (n) => {
                    recibidos += n;
                    avisar();
                },
                o.cancelada,
                o.hayConexion,
                (esperando) => {
                    const antes = sinRed.size;
                    if (esperando) sinRed.add(c.clave);
                    else sinRed.delete(c.clave);
                    if (antes !== sinRed.size) avisar();
                }
            );
            if (gz === 'cancelada') {
                cancelada = true;
                return;
            }
            guardado += await guardarElCubo(dueno, c.clave, gz);
            guardados += c.bytes;
            tengo[c.clave] = c.huella;
            escribir(dueno, tengo); // así, si se cierra la app, lo bajado no se baja otra vez
            avisar();
        }
    };
    await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, Math.max(1, faltan.length)) }, trabajador));
    if (cancelada || o.cancelada()) return 'cancelada';
    // Lo que ya no está en el índice (otro año, otra sección) se olvida.
    const deAhora = new Set(indice.cubos.map((c) => c.clave));
    for (const k of Object.keys(tengo)) if (!deAhora.has(k)) delete tengo[k];
    escribir(dueno, tengo);
    o.alAvanzar?.({ recibidos: total, guardados: total, total, porcentaje: 100, velocidad: null, esperando: false });
    return { guardado, bajados: faltan.length };
}
