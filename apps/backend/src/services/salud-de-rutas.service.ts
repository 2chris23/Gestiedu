import { platformPrisma } from '../config/database';
import { logger } from '../utils/logger';
import { medidor, percentil, N_CUBETAS, type Cuenta } from '../utils/medidor-de-rutas';
import { agrupador, type ErrorAgrupado } from '../utils/errores-agrupados';
import { nombreDeLaRuta } from '../utils/nombres-de-las-rutas';
import { prever, limites, calibrar, type Entradas } from '../utils/pronostico-de-carga';

/**
 * LO QUE MIDE EL MEDIDOR, GUARDADO Y LEÍDO (salud, 18-oct-2026)
 *
 * Cada minuto, cada proceso SUMA lo suyo a la fila de su ventana de 5 min en
 * la base de la plataforma: una sentencia por tabla, no una por ruta. Con
 * varios procesos las filas se suman solas (`ON CONFLICT DO UPDATE`). Si la
 * base no contesta, lo acumulado se pierde (es una medición, no un dato del
 * liceo) y se dice en el registro: nunca se queda guardando sin fin.
 */

const VENTANA_MS = 5 * 60_000;
const ventanaDe = (t: number) => new Date(Math.floor(t / VENTANA_MS) * VENTANA_MS);
const LOTE = 400;

function filas(mapa: Map<string, Cuenta>, ventana: Date, clave: (k: string) => unknown[]) {
    return [...mapa.entries()].map(([k, c]) => [
        ventana,
        ...clave(k),
        c.total,
        c.e4xx,
        c.e5xx,
        c.e429,
        c.e503,
        c.sumaMs,
        Math.round(c.maxMs),
        c.cubetas,
        JSON.stringify(c.codigos),
        c.personas.size,
    ]);
}

const SUMAR_EN_CONFLICTO = `
    "total" = t."total" + EXCLUDED."total",
    "e4xx" = t."e4xx" + EXCLUDED."e4xx",
    "e5xx" = t."e5xx" + EXCLUDED."e5xx",
    "e429" = t."e429" + EXCLUDED."e429",
    "e503" = t."e503" + EXCLUDED."e503",
    "sumaMs" = t."sumaMs" + EXCLUDED."sumaMs",
    "maxMs" = GREATEST(t."maxMs", EXCLUDED."maxMs"),
    "cubetas" = ARRAY(SELECT a + b FROM unnest(t."cubetas", EXCLUDED."cubetas") AS x(a, b)),
    "codigos" = COALESCE((SELECT jsonb_object_agg(k, s) FROM (
        SELECT k, sum(v::bigint) AS s FROM (
            SELECT * FROM jsonb_each_text(t."codigos") UNION ALL SELECT * FROM jsonb_each_text(EXCLUDED."codigos")
        ) u(k, v) GROUP BY k) z), '{}'::jsonb),
    "personas" = GREATEST(t."personas", EXCLUDED."personas")`;

async function insertar(tabla: string, columnasClave: string[], lote: unknown[][]) {
    for (let i = 0; i < lote.length; i += LOTE) {
        const trozo = lote.slice(i, i + LOTE);
        const anchura = trozo[0].length;
        const valores = trozo
            .map((_, f) => {
                const p = Array.from({ length: anchura }, (_, j) => `$${f * anchura + j + 1}`);
                // cubetas (int[]) y codigos (jsonb) con su tipo
                p[anchura - 3] += '::int[]';
                p[anchura - 2] += '::jsonb';
                return `(${p.join(', ')})`;
            })
            .join(', ');
        const cols = ['"ventana"', ...columnasClave.map((c) => `"${c}"`), '"total"', '"e4xx"', '"e5xx"', '"e429"', '"e503"', '"sumaMs"', '"maxMs"', '"cubetas"', '"codigos"', '"personas"'];
        await platformPrisma.$executeRawUnsafe(
            `INSERT INTO "${tabla}" AS t (${cols.join(', ')}) VALUES ${valores}
             ON CONFLICT ("ventana", ${columnasClave.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ${SUMAR_EN_CONFLICTO}`,
            ...trozo.flat()
        );
    }
}

async function guardarErrores(lote: ErrorAgrupado[]) {
    for (const e of lote) {
        await platformPrisma.$executeRawUnsafe(
            `INSERT INTO "errores_agrupados" AS t ("huella","origen","tipo","mensaje","donde","ruta","version","veces","liceos","primera","ultima","muestra")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
             ON CONFLICT ("huella") DO UPDATE SET
               "veces" = t."veces" + EXCLUDED."veces",
               "ultima" = GREATEST(t."ultima", EXCLUDED."ultima"),
               "version" = COALESCE(EXCLUDED."version", t."version"),
               "liceos" = COALESCE((SELECT jsonb_object_agg(k, s) FROM (
                   SELECT k, sum(v::bigint) AS s FROM (
                     SELECT * FROM jsonb_each_text(t."liceos") UNION ALL SELECT * FROM jsonb_each_text(EXCLUDED."liceos")
                   ) u(k, v) GROUP BY k) z), '{}'::jsonb),
               -- Si había quedado resuelto y vuelve a pasar, se reabre.
               "estado" = CASE WHEN t."estado" = 'resuelto' THEN 'volvio' ELSE t."estado" END`,
            e.huella,
            e.origen,
            e.tipo,
            e.mensaje,
            e.donde,
            e.ruta,
            e.version,
            e.veces,
            JSON.stringify(e.liceos),
            new Date(e.primera),
            new Date(e.ultima),
            e.muestra
        );
    }
}

/** Vuelca lo acumulado en este proceso. Devuelve cuántas filas escribió. */
export async function volcarLaSalud(): Promise<{ rutas: number; liceos: number; errores: number }> {
    const { desde, porRuta, porLiceo } = medidor.vaciar();
    const errores = agrupador.vaciar();
    const ventana = ventanaDe(desde);
    try {
        await insertar('metricas_de_rutas', ['ruta', 'rol'], filas(porRuta, ventana, (k) => k.split('|')));
        await insertar('metricas_de_liceos', ['instituteId'], filas(porLiceo, ventana, (k) => [k]));
        await guardarErrores(errores);
    } catch (error) {
        logger.warn('salud: no se pudo guardar la medición (se pierde esta ventana)', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return { rutas: porRuta.size, liceos: porLiceo.size, errores: errores.length };
}

let temporizador: NodeJS.Timeout | null = null;
export function empezarAVolcar(cadaMs = 60_000): void {
    if (temporizador || process.env.NODE_ENV === 'test') return;
    temporizador = setInterval(() => void volcarLaSalud(), cadaMs);
    temporizador.unref();
}
export async function pararDeVolcar(): Promise<void> {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
    await volcarLaSalud();
}

// ── Leer ─────────────────────────────────────────────────────────────────────

interface FilaSuma {
    clave: string;
    rol?: string;
    total: number;
    e4xx: number;
    e5xx: number;
    e429: number;
    e503: number;
    sumaMs: number;
    maxMs: number;
    codigos: Record<string, number>;
}

const num = (x: unknown) => Number(x ?? 0);

async function cubetasPor(tabla: string, columnas: string[], desde: Date, donde = ''): Promise<Map<string, number[]>> {
    const cols = columnas.map((c) => `m."${c}"`).join(', ');
    const filas = await platformPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT ${cols}, u.i AS i, sum(u.v)::bigint AS v
           FROM "${tabla}" m, unnest(m."cubetas") WITH ORDINALITY u(v, i)
          WHERE m."ventana" >= $1 ${donde}
          GROUP BY ${cols}, u.i`,
        desde
    );
    const salida = new Map<string, number[]>();
    for (const f of filas) {
        const k = columnas.map((c) => String(f[c])).join('|');
        let a = salida.get(k);
        if (!a) salida.set(k, (a = new Array(N_CUBETAS).fill(0)));
        a[num(f.i) - 1] = num(f.v);
    }
    return salida;
}

function resumen(f: FilaSuma, cubetas: number[] | undefined) {
    const c = cubetas ?? new Array(N_CUBETAS).fill(0);
    return {
        total: f.total,
        errores5xx: f.e5xx,
        errores4xx: f.e4xx,
        rechazos: f.e429 + f.e503,
        tasaDeError: f.total ? Math.round((f.e5xx / f.total) * 10000) / 100 : 0,
        mediaMs: f.total ? Math.round(f.sumaMs / f.total) : null,
        p50: percentil(c, 0.5, f.maxMs),
        p95: percentil(c, 0.95, f.maxMs),
        p99: percentil(c, 0.99, f.maxMs),
        maxMs: f.maxMs,
        codigos: Object.entries(f.codigos ?? {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([codigo, veces]) => ({ codigo, veces: Number(veces) })),
    };
}

/** Cada ruta (cada «botón») en las últimas `horas`, lo peor primero. */
export async function lasRutas(horas = 1) {
    const desde = new Date(Date.now() - horas * 3600_000);
    const sumas = await platformPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "ruta", "rol", sum("total")::bigint total, sum("e4xx")::bigint e4xx, sum("e5xx")::bigint e5xx,
                sum("e429")::bigint e429, sum("e503")::bigint e503, sum("sumaMs")::bigint "sumaMs", max("maxMs") "maxMs",
                COALESCE((SELECT jsonb_object_agg(k, s) FROM (SELECT k, sum(v::bigint) s FROM metricas_de_rutas m2, jsonb_each_text(m2."codigos") j(k, v)
                    WHERE m2."ventana" >= $1 AND m2."ruta" = m."ruta" AND m2."rol" = m."rol" GROUP BY k) z), '{}'::jsonb) codigos
           FROM "metricas_de_rutas" m WHERE "ventana" >= $1 GROUP BY "ruta", "rol"`,
        desde
    );
    const cubetas = await cubetasPor('metricas_de_rutas', ['ruta', 'rol'], desde);
    return sumas
        .map((f) => {
            const fila: FilaSuma = { clave: String(f.ruta), rol: String(f.rol), total: num(f.total), e4xx: num(f.e4xx), e5xx: num(f.e5xx), e429: num(f.e429), e503: num(f.e503), sumaMs: num(f.sumaMs), maxMs: num(f.maxMs), codigos: (f.codigos as Record<string, number>) ?? {} };
            return { ruta: fila.clave, nombre: nombreDeLaRuta(fila.clave), rol: fila.rol, ...resumen(fila, cubetas.get(`${fila.clave}|${fila.rol}`)) };
        })
        .sort((a, b) => b.errores5xx - a.errores5xx || (b.p95 ?? 0) - (a.p95 ?? 0));
}

/** Cada liceo en las últimas `horas`, lo peor primero, con su nombre. */
export async function losLiceos(horas = 1) {
    const desde = new Date(Date.now() - horas * 3600_000);
    const sumas = await platformPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "instituteId", sum("total")::bigint total, sum("e4xx")::bigint e4xx, sum("e5xx")::bigint e5xx,
                sum("e429")::bigint e429, sum("e503")::bigint e503, sum("sumaMs")::bigint "sumaMs", max("maxMs") "maxMs",
                max("personas") personas
           FROM "metricas_de_liceos" WHERE "ventana" >= $1 GROUP BY "instituteId"`,
        desde
    );
    const cubetas = await cubetasPor('metricas_de_liceos', ['instituteId'], desde);
    const ids = sumas.map((s) => String(s.instituteId));
    const nombres = ids.length
        ? await platformPrisma.institute.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } })
        : [];
    const porId = new Map(nombres.map((n) => [n.id, n]));
    return sumas
        .map((f) => {
            const id = String(f.instituteId);
            const fila: FilaSuma = { clave: id, total: num(f.total), e4xx: num(f.e4xx), e5xx: num(f.e5xx), e429: num(f.e429), e503: num(f.e503), sumaMs: num(f.sumaMs), maxMs: num(f.maxMs), codigos: {} };
            const r = resumen(fila, cubetas.get(id));
            const semaforo = r.tasaDeError >= 1 || (r.p95 ?? 0) >= 2000 ? 'mal' : r.tasaDeError > 0 || (r.p95 ?? 0) >= 800 ? 'regular' : 'bien';
            return { instituteId: id, nombre: porId.get(id)?.name ?? id, slug: porId.get(id)?.slug ?? null, personas: num(f.personas), semaforo, ...r };
        })
        .sort((a, b) => b.errores5xx - a.errores5xx || (b.p95 ?? 0) - (a.p95 ?? 0));
}

export async function losErrores(limite = 100) {
    const filas = await platformPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "errores_agrupados" ORDER BY CASE "estado" WHEN 'resuelto' THEN 1 ELSE 0 END, "ultima" DESC LIMIT $1`,
        limite
    );
    return filas.map((f) => ({ ...f, veces: num(f.veces), liceos: Object.keys((f.liceos as object) ?? {}).length }));
}

export async function marcarError(huella: string, estado: 'abierto' | 'visto' | 'resuelto') {
    await platformPrisma.$executeRawUnsafe(
        `UPDATE "errores_agrupados" SET "estado" = $2, "resueltoEn" = CASE WHEN $2 = 'resuelto' THEN now() ELSE NULL END WHERE "huella" = $1`,
        huella,
        estado
    );
}

// ── El pronóstico ───────────────────────────────────────────────────────────

/** Cuántas peticiones atiende el sistema a la vez (supuesto, configurable). */
export function capacidadALaVez(): { aLaVez: number; como: string } {
    const procesos = Math.max(1, Number(process.env.PROCESOS_DEL_SERVIDOR) || 1);
    const conexiones = Math.max(1, Number(process.env.CONEXIONES_POR_PROCESO) || Number(/connection_limit=(\d+)/.exec(process.env.DATABASE_URL ?? '')?.[1]) || 10);
    return { aLaVez: procesos * conexiones, como: `${procesos} proceso(s) × ${conexiones} conexiones a la base` };
}

export async function elPronostico(horas = 24) {
    const desde = new Date(Date.now() - horas * 3600_000);
    const ventanas = await platformPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "ventana", sum("total")::bigint total, sum("sumaMs")::bigint "sumaMs", sum("personas")::bigint personas
           FROM "metricas_de_liceos" WHERE "ventana" >= $1 GROUP BY "ventana" ORDER BY "ventana"`,
        desde
    );
    const cap = capacidadALaVez();
    const puntos = ventanas
        .map((v) => ({ personas: num(v.personas), porSegundo: num(v.total) / (VENTANA_MS / 1000), mediaMs: num(v.total) ? num(v.sumaMs) / num(v.total) : 0 }))
        .filter((p) => p.personas > 0 && p.porSegundo > 0);
    if (!puntos.length) {
        return { hayDatos: false as const, capacidad: cap, supuestos: SUPUESTOS };
    }
    // El servicio sin cola: la media de las ventanas MÁS TRANQUILAS (el cuartil
    // de menos peticiones por segundo), donde casi nadie espera.
    const ordenadas = [...puntos].sort((a, b) => a.porSegundo - b.porSegundo);
    const tranquilas = ordenadas.slice(0, Math.max(1, Math.ceil(ordenadas.length / 4)));
    const servicioMs = tranquilas.reduce((a, p) => a + p.mediaMs, 0) / tranquilas.length;
    const porPersonaPorSegundo = puntos.reduce((a, p) => a + p.porSegundo / p.personas, 0) / puntos.length;
    const e: Entradas = { servicioMs, porPersonaPorSegundo, aLaVez: cap.aLaVez };
    const escalas = [100, 1000, 5000, 15000, 50000, 100000, 500000];
    return {
        hayDatos: true as const,
        capacidad: cap,
        servicioMs: Math.round(servicioMs * 10) / 10,
        porPersonaPorMinuto: Math.round(porPersonaPorSegundo * 60 * 100) / 100,
        previsiones: escalas.map((n) => prever(e, n)),
        limites: limites(e),
        calibracion: calibrar({ servicioMs, aLaVez: cap.aLaVez }, puntos.slice(-48)),
        supuestos: SUPUESTOS,
    };
}

const SUPUESTOS = [
    'Modelo de colas M/M/c (Erlang C): todas las peticiones compiten por los mismos huecos.',
    'El tiempo de servicio es la media de las ventanas más tranquilas de lo medido.',
    'Cada persona pide lo mismo que pidió de media la gente conectada en lo medido.',
    'Los huecos a la vez = procesos × conexiones a la base (PROCESOS_DEL_SERVIDOR, CONEXIONES_POR_PROCESO).',
    'No mide la red del liceo ni el teléfono; una ruta muy pesada puede acaparar más de lo que dice la media.',
    '«Personas» por ventana se cuenta por proceso: con varios procesos puede contar de más.',
];
