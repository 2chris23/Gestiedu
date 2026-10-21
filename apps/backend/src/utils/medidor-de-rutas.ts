/**
 * EL MEDIDOR DE CADA RUTA (salud, 18-oct-2026)
 *
 * Cristian: «quiero ver cómo están trabajando cada botón, el login… el tiempo de
 * respuesta… y saber sin siquiera entrar a un instituto que algo esté fallando».
 *
 * Cada petición suma, en memoria y SIN consultar nada, en dos cuentas:
 *
 *   - por RUTA (molde, `GET /students/:id`, nunca el id) y rol: cuántas, sus
 *     errores (4xx, 5xx, 429, 503), los códigos de error propios
 *     (`CLASE_CON_TRABAJO`…) y un HISTOGRAMA de tiempos en cubetas fijas;
 *   - por LICEO: lo mismo sin el detalle de la ruta (miles de liceos × cientos
 *     de rutas serían millones de filas al día; así son unos miles).
 *
 * Con cubetas fijas, los percentiles (p50, p95, p99) se sacan sumando filas de
 * varios procesos y varias ventanas, sin guardar cada petición: es como lo
 * hacen Prometheus y los paneles de cualquier servicio grande.
 *
 * Cada minuto lo acumulado se vuelca a la base de la plataforma
 * (`servicios/salud-de-rutas.service.ts`) en UNA sentencia y se vacía.
 * Costo por petición: un par de búsquedas en un `Map` y unas sumas (SALUD-01
 * lo mide).
 */

/** Límite superior de cada cubeta, en ms. La última es «más que eso». */
export const CUBETAS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;
export const N_CUBETAS = CUBETAS_MS.length + 1;

export function cubetaDe(ms: number): number {
    for (let i = 0; i < CUBETAS_MS.length; i++) if (ms <= CUBETAS_MS[i]) return i;
    return CUBETAS_MS.length;
}

export interface Cuenta {
    total: number;
    e4xx: number;
    e5xx: number;
    e429: number;
    e503: number;
    sumaMs: number;
    maxMs: number;
    cubetas: number[];
    codigos: Record<string, number>;
    /** Personas distintas que la pidieron en la ventana (aprox.: por proceso). */
    personas: Set<string>;
}

export function cuentaVacia(): Cuenta {
    return { total: 0, e4xx: 0, e5xx: 0, e429: 0, e503: 0, sumaMs: 0, maxMs: 0, cubetas: new Array(N_CUBETAS).fill(0), codigos: {}, personas: new Set() };
}

const MAX_CODIGOS = 20;
const MAX_PERSONAS = 50_000;

export function sumar(c: Cuenta, ms: number, estado: number, codigo: string | null, persona: string | null): void {
    c.total++;
    c.sumaMs += ms;
    if (ms > c.maxMs) c.maxMs = ms;
    c.cubetas[cubetaDe(ms)]++;
    if (estado >= 500) c.e5xx++;
    else if (estado >= 400) c.e4xx++;
    if (estado === 429) c.e429++;
    if (estado === 503) c.e503++;
    if (codigo && (c.codigos[codigo] !== undefined || Object.keys(c.codigos).length < MAX_CODIGOS)) {
        c.codigos[codigo] = (c.codigos[codigo] ?? 0) + 1;
    }
    if (persona && c.personas.size < MAX_PERSONAS) c.personas.add(persona);
}

/**
 * El percentil q (0..1) de un histograma: el límite superior de la cubeta
 * donde cae; dentro de la cubeta se interpola en línea recta. La última
 * cubeta no tiene techo: se da el máximo visto si se sabe.
 */
export function percentil(cubetas: number[], q: number, maxMs?: number): number | null {
    const total = cubetas.reduce((a, b) => a + b, 0);
    if (!total) return null;
    const objetivo = q * total;
    let acumulado = 0;
    for (let i = 0; i < cubetas.length; i++) {
        const antes = acumulado;
        acumulado += cubetas[i];
        if (acumulado >= objetivo && cubetas[i] > 0) {
            const piso = i === 0 ? 0 : CUBETAS_MS[i - 1];
            const techo = i < CUBETAS_MS.length ? CUBETAS_MS[i] : Math.max(maxMs ?? CUBETAS_MS[CUBETAS_MS.length - 1] * 2, CUBETAS_MS[CUBETAS_MS.length - 1]);
            const dentro = (objetivo - antes) / cubetas[i];
            return Math.round(piso + (techo - piso) * dentro);
        }
    }
    return maxMs ?? null;
}

/**
 * La ruta como molde: sin ids ni números, para que `/students/abc` y
 * `/students/xyz` sean UNA fila. Se usa el molde que conoce Fastify
 * (`routeOptions.url`); sin él (404), la dirección con los ids tapados.
 */
export function moldeDeLaRuta(molde: string | undefined, url: string): string {
    if (molde) return molde;
    const camino = url.split('?')[0];
    return camino
        .split('/')
        .map((t) => (/^[0-9a-f-]{16,}$/i.test(t) || /^c[a-z0-9]{20,}$/.test(t) || /^\d+$/.test(t) || /^[VEJ]?-?\d{5,}$/i.test(t) ? ':id' : t))
        .join('/')
        .slice(0, 200);
}

/** Lo que el medidor tiene acumulado en este proceso. */
export class Medidor {
    porRuta = new Map<string, Cuenta>();
    porLiceo = new Map<string, Cuenta>();
    desde = Date.now();

    apuntar(p: { metodo: string; ruta: string; rol: string | null; liceo: string | null; ms: number; estado: number; codigo: string | null; persona: string | null }): void {
        const kRuta = `${p.metodo} ${p.ruta}|${p.rol ?? '-'}`;
        let r = this.porRuta.get(kRuta);
        if (!r) this.porRuta.set(kRuta, (r = cuentaVacia()));
        sumar(r, p.ms, p.estado, p.codigo, p.persona);
        if (p.liceo) {
            let l = this.porLiceo.get(p.liceo);
            if (!l) this.porLiceo.set(p.liceo, (l = cuentaVacia()));
            sumar(l, p.ms, p.estado, p.codigo, p.persona);
        }
    }

    /** Lo acumulado, y se empieza de cero. */
    vaciar(): { desde: number; hasta: number; porRuta: Map<string, Cuenta>; porLiceo: Map<string, Cuenta> } {
        const salida = { desde: this.desde, hasta: Date.now(), porRuta: this.porRuta, porLiceo: this.porLiceo };
        this.porRuta = new Map();
        this.porLiceo = new Map();
        this.desde = salida.hasta;
        return salida;
    }
}

export const medidor = new Medidor();
