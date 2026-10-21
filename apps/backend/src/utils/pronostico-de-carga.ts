/**
 * EL PRONÓSTICO CON MILES DE MILES (salud, 18-oct-2026)
 *
 * Cristian: «quiero ver el pronóstico que tendría con miles de miles de
 * usuarios, cuánto sería su tiempo de respuesta en ms».
 *
 * Es un modelo de colas M/M/c (Erlang C), el de los centros de llamadas y de
 * la planificación de capacidad de cualquier servicio grande:
 *
 *   - S  = lo que tarda una petición sin nadie delante (el tiempo de servicio);
 *   - R  = cuántas peticiones por segundo hace cada persona conectada;
 *   - c  = cuántas puede atender el sistema a la vez (procesos × conexiones
 *          a la base que usa cada uno);
 *   - con N personas, llegan λ = N·R por segundo y cada «servidor» trabaja
 *     ρ = λ·S / c del tiempo. Por debajo de 1 hay cola pero se sale; en 1 la
 *     cola crece sin fin (el sistema se cae).
 *
 * Lo que NO sabe: la red del liceo, el teléfono, que una ruta pesada pueda
 * acaparar la base más que las demás, ni lo que cambie el código mañana. Por
 * eso el panel lo dice como pronóstico y lo compara con lo medido de verdad
 * (`calibrar`): si el modelo se equivoca con lo que ya pasó, no vale para lo
 * que vendrá.
 */

/** Probabilidad de esperar en una M/M/c (fórmula de Erlang C), estable para c grande. */
export function erlangC(c: number, carga: number): number {
    // carga = λ·S (en «servidores ocupados»). Con carga >= c no hay régimen.
    if (carga <= 0) return 0;
    if (carga >= c) return 1;
    // Erlang B por recurrencia (no desborda) y de ahí Erlang C.
    let b = 1;
    for (let k = 1; k <= c; k++) b = (carga * b) / (k + carga * b);
    const rho = carga / c;
    return b / (1 - rho + rho * b);
}

export interface Entradas {
    /** Tiempo de servicio medio, en ms. */
    servicioMs: number;
    /** Peticiones por segundo de cada persona conectada. */
    porPersonaPorSegundo: number;
    /** Peticiones que el sistema atiende a la vez. */
    aLaVez: number;
}

export interface Prevision {
    personas: number;
    porSegundo: number;
    ocupacion: number;
    /** Tiempo medio de respuesta esperado, ms; null = el sistema no da abasto. */
    respuestaMs: number | null;
    esperaMs: number | null;
}

export function prever(e: Entradas, personas: number): Prevision {
    const lambda = personas * e.porPersonaPorSegundo;
    const s = e.servicioMs / 1000;
    const carga = lambda * s;
    const ocupacion = e.aLaVez > 0 ? carga / e.aLaVez : Infinity;
    if (ocupacion >= 1 || !Number.isFinite(ocupacion)) {
        return { personas, porSegundo: lambda, ocupacion, respuestaMs: null, esperaMs: null };
    }
    const pc = erlangC(e.aLaVez, carga);
    const esperaS = pc / (e.aLaVez / s - lambda);
    return {
        personas,
        porSegundo: lambda,
        ocupacion,
        respuestaMs: Math.round((s + esperaS) * 1000 * 10) / 10,
        esperaMs: Math.round(esperaS * 1000 * 10) / 10,
    };
}

/** Cuántas personas a la vez hasta que la respuesta media se doble; y hasta que se cae. */
export function limites(e: Entradas): { seDobla: number | null; seCae: number | null } {
    if (e.porPersonaPorSegundo <= 0 || e.servicioMs <= 0) return { seDobla: null, seCae: null };
    const seCae = Math.floor(e.aLaVez / (e.porPersonaPorSegundo * (e.servicioMs / 1000)) + 1e-9);
    let lo = 0;
    let hi = seCae;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        const p = prever(e, mid);
        if (p.respuestaMs !== null && p.respuestaMs < 2 * e.servicioMs) lo = mid;
        else hi = mid;
    }
    return { seDobla: lo, seCae };
}

/**
 * Lo que ya pasó contra lo que el modelo habría dicho. Cada punto es una
 * ventana medida: cuántas personas había y cuánto tardó de media. Devuelve el
 * error medio relativo (0,12 = se equivoca un 12 %).
 */
export function calibrar(e: Omit<Entradas, 'porPersonaPorSegundo'>, puntos: Array<{ personas: number; porSegundo: number; mediaMs: number }>): { errorMedio: number | null; puntos: Array<{ personas: number; medidoMs: number; previstoMs: number | null }> } {
    const salida = puntos.map((p) => {
        const r = p.personas > 0 ? p.porSegundo / p.personas : 0;
        const pr = prever({ ...e, porPersonaPorSegundo: r }, p.personas);
        return { personas: p.personas, medidoMs: p.mediaMs, previstoMs: pr.respuestaMs };
    });
    const validos = salida.filter((p) => p.previstoMs !== null && p.medidoMs > 0);
    if (!validos.length) return { errorMedio: null, puntos: salida };
    const err = validos.reduce((a, p) => a + Math.abs((p.previstoMs as number) - p.medidoMs) / p.medidoMs, 0) / validos.length;
    return { errorMedio: Math.round(err * 1000) / 1000, puntos: salida };
}
