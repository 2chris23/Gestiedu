import { createHash } from 'crypto';
import { taparEnTexto } from './datos-en-registros';

/**
 * LOS ERRORES, AGRUPADOS POR HUELLA (como Sentry; salud, 18-oct-2026)
 *
 * Trescientas personas pulsando el mismo botón roto son UN problema, no
 * trescientos. Cada error —un 500 del servidor o un fallo de la pantalla que
 * manda el teléfono— se resume en su huella: el tipo, el mensaje sin números
 * ni ids, y el primer sitio de la pila que es nuestro. Se cuenta cuántas veces,
 * en cuántos liceos, la primera y la última vez, y se guarda UNA muestra.
 *
 * Sin datos personales: el mensaje y la pila pasan por `taparEnTexto` (cédulas,
 * correos, teléfonos) y además se tapan los números largos y los ids.
 */

export type OrigenDelError = 'servidor' | 'pantalla';

export interface ErrorAgrupado {
    huella: string;
    origen: OrigenDelError;
    tipo: string;
    mensaje: string;
    donde: string;
    ruta: string | null;
    version: string | null;
    veces: number;
    liceos: Record<string, number>;
    primera: number;
    ultima: number;
    muestra: string;
}

/** El mensaje sin lo que cambia de una vez a otra. */
export function normalizarMensaje(m: string): string {
    // Primero lo que cambia (ids, correos, cédulas, cifras) y después el tapado
    // de los registros: al revés, la cédula dejaba sus 3 últimas cifras y dos
    // errores iguales salían con huellas distintas.
    return taparEnTexto(
        String(m || '')
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
            .replace(/\bc[a-z0-9]{20,}\b/g, ':id')
            .replace(/\b[0-9a-f]{16,}\b/gi, ':id')
            .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ':correo')
            .replace(/\b[VEJ]-?\d{5,}\b/gi, ':cedula')
            .replace(/\d+(\.\d+)?/g, 'N')
    )
        .replace(/(["'`])(?:(?!\1).){40,}\1/g, '$1…$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
}

/**
 * El primer marco de la pila que es NUESTRO (no de node_modules ni de Node):
 * `services/notas.service.ts:120`. Sin pila, vacío.
 */
export function primerMarcoPropio(pila: string | undefined | null): string {
    if (!pila) return '';
    for (const linea of pila.split('\n').slice(1, 30)) {
        if (/node_modules|node:internal|\(internal\//.test(linea)) continue;
        // Lo que va tras el ÚLTIMO `src/` (o `_next/static/`): igual en el
        // servidor, en el ordenador de pruebas y en el teléfono.
        const m = /.*[/\\](?:src|_next[/\\]static)[/\\]([^():]+?):(\d+)(?::\d+)?\)?\s*$/.exec(linea);
        if (m) return `${m[1].replace(/\\/g, '/')}:${m[2]}`.replace(/chunks\/[^/]*?-[0-9a-f]{8,}\./, 'chunks/·.');
    }
    return '';
}

export function huellaDelError(origen: OrigenDelError, tipo: string, mensaje: string, donde: string, ruta: string | null): string {
    return createHash('sha256')
        .update([origen, tipo, normalizarMensaje(mensaje), donde, ruta ?? ''].join('\u0000'))
        .digest('hex')
        .slice(0, 32);
}

const MAX_PENDIENTES = 2000;
const MAX_LICEOS_POR_ERROR = 50;

export class Agrupador {
    pendientes = new Map<string, ErrorAgrupado>();

    apuntar(e: {
        origen: OrigenDelError;
        tipo: string;
        mensaje: string;
        pila?: string | null;
        ruta?: string | null;
        liceo?: string | null;
        version?: string | null;
        ahora?: number;
    }): string {
        const tipo = String(e.tipo || 'Error').slice(0, 80);
        const donde = primerMarcoPropio(e.pila);
        const ruta = e.ruta ? String(e.ruta).slice(0, 200) : null;
        const huella = huellaDelError(e.origen, tipo, e.mensaje, donde, ruta);
        const ahora = e.ahora ?? Date.now();
        let g = this.pendientes.get(huella);
        if (!g) {
            // Lleno (una tormenta de errores distintos): se deja de apuntar lo
            // nuevo hasta el próximo volcado; lo ya apuntado sigue contando.
            if (this.pendientes.size >= MAX_PENDIENTES) return huella;
            g = {
                huella,
                origen: e.origen,
                tipo,
                mensaje: normalizarMensaje(e.mensaje),
                donde,
                ruta,
                version: e.version ? String(e.version).slice(0, 40) : null,
                veces: 0,
                liceos: {},
                primera: ahora,
                ultima: ahora,
                muestra: taparEnTexto(String(e.pila || e.mensaje || '')).slice(0, 4000),
            };
            this.pendientes.set(huella, g);
        }
        g.veces++;
        g.ultima = ahora;
        const liceo = e.liceo || 'sin-liceo';
        if (g.liceos[liceo] !== undefined || Object.keys(g.liceos).length < MAX_LICEOS_POR_ERROR) {
            g.liceos[liceo] = (g.liceos[liceo] ?? 0) + 1;
        }
        return huella;
    }

    vaciar(): ErrorAgrupado[] {
        const lote = [...this.pendientes.values()];
        this.pendientes = new Map();
        return lote;
    }
}

export const agrupador = new Agrupador();
