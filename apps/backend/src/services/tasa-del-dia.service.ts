import { RedisCache } from '../config/redis';

/**
 * LA TASA DEL DÍA DEL BCV (2026-10-14)
 *
 * Cristian: «existen APIs gratuitas que te dan la tasa del Banco Central de
 * Venezuela». Ninguna es del BCV (el BCV no publica una): son servicios
 * gratuitos, sin clave, que leen la tasa oficial que publica. Se preguntan EN
 * ORDEN y la primera que conteste bien gana; si todas fallan, vale la última
 * buena que se guardó (dicha como vieja), y si nunca hubo una, no hay tasa y
 * se escribe a mano como antes. Nunca se inventa.
 *
 * Probadas el 14-oct-2026 y las tres dijeron lo mismo (877,9023 Bs/$):
 *   1. ve.dolarapi.com       (DolarApi, de código abierto)
 *   2. bcv.today
 *   3. bcv-api-ashy.vercel.app (proyecto personal: el último recurso)
 *
 * La tasa es del país, no de un liceo: va con la llave `platform:` (fuera del
 * ámbito del liceo), una hora en la memoria rápida y 30 días la última buena.
 */

export interface TasaDelDia {
    /** Bolívares por un dólar. */
    usd: number;
    /** Bolívares por un euro (si la fuente lo da). */
    eur: number | null;
    /** El día de la tasa, «AAAA-MM-DD» (la que publica el BCV para ese día). */
    fecha: string;
    fuente: string;
    /** true: ninguna fuente contestó y es la última buena guardada. */
    vieja: boolean;
}

type Lector = (cuerpo: any) => { usd: number; eur: number | null; fecha: string } | null;

const dia = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : new Date().toISOString().slice(0, 10));

export const FUENTES: Array<{ nombre: string; url: string; leer: Lector }> = [
    {
        nombre: 'DolarApi (BCV)',
        url: 'https://ve.dolarapi.com/v1/dolares/oficial',
        leer: (b) => (b && typeof b.promedio === 'number' ? { usd: b.promedio, eur: null, fecha: dia(b.fechaActualizacion) } : null),
    },
    {
        nombre: 'bcv.today',
        url: 'https://bcv.today/api/v1/rate.json',
        leer: (b) => (b && typeof b.USD === 'number' ? { usd: b.USD, eur: typeof b.EUR === 'number' ? b.EUR : null, fecha: dia(b.effective_date ?? b.date) } : null),
    },
    {
        nombre: 'BCV-API',
        url: 'https://bcv-api-ashy.vercel.app/api/tasa',
        leer: (b) =>
            b?.bcv && typeof b.bcv.usd === 'number' && b.stale !== true
                ? { usd: b.bcv.usd, eur: typeof b.bcv.eur === 'number' ? b.bcv.eur : null, fecha: dia(b.updated_at) }
                : null,
    },
];

const LLAVE = 'platform:tasa-bcv';
const LLAVE_ULTIMA = 'platform:tasa-bcv:ultima-buena';
const UNA_HORA = 3600;
const TREINTA_DIAS = 30 * 24 * 3600;
const ESPERA_MS = 5000;
/** Si ninguna contestó, no se vuelve a preguntar en 5 min: si no, cada petición esperaría 15 s. */
const PAUSA_TRAS_FALLAR_MS = 5 * 60_000;
let fallaronEn = 0;

/** Una tasa creíble: un número, positivo y sin disparates (ni 0, ni 10 millones). */
export const esCreible = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0.01 && n < 10_000_000;

async function preguntar(url: string, buscar: typeof fetch): Promise<unknown> {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), ESPERA_MS);
    try {
        const r = await buscar(url, { signal: corte.signal, headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(reloj);
    }
}

/**
 * La tasa de hoy. `buscar` se cambia en las pruebas (TASA-*): ninguna prueba
 * sale a internet.
 */
export async function tasaDelDia(buscar: typeof fetch = fetch, { sinMemoria = false } = {}): Promise<TasaDelDia | null> {
    if (!sinMemoria) {
        const guardada = await RedisCache.get<TasaDelDia>(LLAVE).catch(() => null);
        if (guardada) return guardada;
    }
    const enPausa = !sinMemoria && Date.now() - fallaronEn < PAUSA_TRAS_FALLAR_MS;
    for (const f of enPausa ? [] : FUENTES) {
        try {
            const leida = f.leer(await preguntar(f.url, buscar));
            if (!leida || !esCreible(leida.usd)) continue;
            const tasa: TasaDelDia = { usd: leida.usd, eur: esCreible(leida.eur) ? leida.eur : null, fecha: leida.fecha, fuente: f.nombre, vieja: false };
            await RedisCache.set(LLAVE, tasa, UNA_HORA).catch(() => undefined);
            await RedisCache.set(LLAVE_ULTIMA, tasa, TREINTA_DIAS).catch(() => undefined);
            return tasa;
        } catch {
            /* la siguiente */
        }
    }
    if (!enPausa) fallaronEn = Date.now();
    const ultima = await RedisCache.get<TasaDelDia>(LLAVE_ULTIMA).catch(() => null);
    return ultima ? { ...ultima, vieja: true } : null;
}
