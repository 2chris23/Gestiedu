/**
 * LOS INSTRUMENTOS DE EVALUACIÓN
 *
 * Técnica = cómo se evalúa (prueba oral, práctica, análisis de tareas);
 * instrumento = la hoja con que se registra lo que hizo cada alumno. En los
 * liceos venezolanos, sobre todo:
 *
 *  · COTEJO  — lista de cotejo: indicadores de sí/no; cada uno vale sus puntos
 *              («Portada 2, Plan firmado 5, Firmas 5, Ejercicios 5, Pulcritud 3»).
 *              Nota = suma de lo marcado.
 *  · ESCALA  — escala de estimación: cada criterio en un nivel (AD 4, A 3, B 2,
 *              C 1 por defecto). Nota = suma de valor × peso; sin nota hasta que
 *              todos los criterios tengan nivel.
 *  · RUBRICA — como la escala, con la descripción de cada casilla.
 *  · PUNTOS  — cada criterio de 0 a sus puntos («Ser 1, Hacer 1, Convivir 1,
 *              Conocer 17»). Sin nota hasta que todos tengan puntos.
 *
 * La nota del instrumento es la de la actividad (sobre el máximo del
 * instrumento, que se lleva a 20 como cualquier nota: `lapso-average.ts`), y
 * sigue a la cuenta del plan de siempre. Una sola cuenta, copiada en los dos
 * lados: aquí y en `apps/web/src/lib/instrumentos.ts` (INSTR-*).
 */

export type TipoDeInstrumento = 'COTEJO' | 'ESCALA' | 'RUBRICA' | 'PUNTOS';
export const TIPOS_DE_INSTRUMENTO: TipoDeInstrumento[] = ['COTEJO', 'ESCALA', 'RUBRICA', 'PUNTOS'];

export interface Criterio {
    id: string;
    texto: string;
    /** COTEJO y PUNTOS: lo que vale. */
    puntos?: number;
    /** ESCALA y RUBRICA: por cuánto se multiplica el nivel (1 si no se dice). */
    peso?: number;
}
export interface Nivel {
    id: string;
    nombre: string;
    valor: number;
}
export interface Instrumento {
    v: 1;
    tipo: TipoDeInstrumento;
    criterios: Criterio[];
    niveles?: Nivel[];
    /** RUBRICA: criterio → nivel → lo que describe esa casilla. */
    descriptores?: Record<string, Record<string, string>>;
}
/** Lo marcado a un alumno: criterio → sí/no (COTEJO), id del nivel (ESCALA, RUBRICA) o puntos (PUNTOS). */
export type Marcas = Record<string, boolean | string | number | null>;

export const NIVELES_POR_DEFECTO: Nivel[] = [
    { id: 'AD', nombre: 'Logro destacado', valor: 4 },
    { id: 'A', nombre: 'Logro esperado', valor: 3 },
    { id: 'B', nombre: 'En proceso', valor: 2 },
    { id: 'C', nombre: 'En inicio', valor: 1 },
];

export class InstrumentoInvalido extends Error {}

const redondear = (n: number) => Math.round(n * 100) / 100;
const numero = (n: unknown) => typeof n === 'number' && Number.isFinite(n);

/** Revisa y limpia una definición; lanza `InstrumentoInvalido` con el motivo. */
export function validarInstrumento(entrada: any): Instrumento {
    const mal = (m: string) => {
        throw new InstrumentoInvalido(m);
    };
    const tipo = entrada?.tipo;
    if (!TIPOS_DE_INSTRUMENTO.includes(tipo)) mal('Tipo de instrumento desconocido');
    const criterios: Criterio[] = Array.isArray(entrada?.criterios) ? entrada.criterios : [];
    if (criterios.length === 0) mal('El instrumento necesita al menos un criterio');
    if (criterios.length > 30) mal('Como mucho 30 criterios');
    const ids = new Set<string>();
    const limpios = criterios.map((c: any, i: number) => {
        const id = String(c?.id ?? '').trim() || `c${i + 1}`;
        if (ids.has(id)) mal('Dos criterios con el mismo id');
        ids.add(id);
        const texto = String(c?.texto ?? '').trim();
        if (!texto) mal(`El criterio ${i + 1} no tiene texto`);
        if (texto.length > 500) mal(`El criterio ${i + 1} es demasiado largo`);
        const limpio: Criterio = { id, texto };
        if (tipo === 'COTEJO' || tipo === 'PUNTOS') {
            if (!numero(c?.puntos) || c.puntos <= 0 || c.puntos > 100) mal(`«${texto}»: los puntos van de más de 0 a 100`);
            limpio.puntos = redondear(c.puntos);
        } else {
            const peso = c?.peso ?? 1;
            if (!numero(peso) || peso <= 0 || peso > 20) mal(`«${texto}»: el peso va de más de 0 a 20`);
            limpio.peso = redondear(peso);
        }
        return limpio;
    });
    const def: Instrumento = { v: 1, tipo, criterios: limpios };
    if (tipo === 'ESCALA' || tipo === 'RUBRICA') {
        const niveles: Nivel[] = Array.isArray(entrada?.niveles) && entrada.niveles.length ? entrada.niveles : NIVELES_POR_DEFECTO;
        if (niveles.length < 2 || niveles.length > 8) mal('Entre 2 y 8 niveles');
        const nids = new Set<string>();
        def.niveles = niveles.map((n: any, i: number) => {
            const id = String(n?.id ?? '').trim() || `n${i + 1}`;
            if (nids.has(id)) mal('Dos niveles con el mismo id');
            nids.add(id);
            const nombre = String(n?.nombre ?? '').trim();
            if (!nombre) mal(`El nivel ${i + 1} no tiene nombre`);
            if (!numero(n?.valor) || n.valor < 0 || n.valor > 100) mal(`«${nombre}»: el valor va de 0 a 100`);
            return { id, nombre: nombre.slice(0, 60), valor: redondear(n.valor) };
        });
        if (tipo === 'RUBRICA' && entrada?.descriptores && typeof entrada.descriptores === 'object') {
            const d: Record<string, Record<string, string>> = {};
            for (const c of limpios) {
                const fila = entrada.descriptores[c.id];
                if (!fila || typeof fila !== 'object') continue;
                d[c.id] = {};
                for (const n of def.niveles) {
                    const t = String(fila[n.id] ?? '').trim();
                    if (t) d[c.id][n.id] = t.slice(0, 500);
                }
            }
            def.descriptores = d;
        }
    }
    if (maximoDelInstrumento(def) <= 0) mal('El instrumento no vale nada: revisa los puntos');
    return def;
}

/** Lo máximo que se puede sacar con el instrumento. */
export function maximoDelInstrumento(def: Instrumento): number {
    if (def.tipo === 'COTEJO' || def.tipo === 'PUNTOS') return redondear(def.criterios.reduce((s, c) => s + (c.puntos ?? 0), 0));
    const tope = Math.max(0, ...(def.niveles ?? NIVELES_POR_DEFECTO).map((n) => n.valor));
    return redondear(def.criterios.reduce((s, c) => s + tope * (c.peso ?? 1), 0));
}

/**
 * La nota de un alumno con sus marcas; `null` si falta algo (escala, rúbrica y
 * puntos piden todos los criterios; la lista de cotejo, no: lo no marcado es «no»).
 * Lanza `InstrumentoInvalido` si una marca no cabe en el instrumento.
 */
export function notaDelInstrumento(def: Instrumento, marcas: Marcas): number | null {
    const mal = (m: string) => {
        throw new InstrumentoInvalido(m);
    };
    const conocidos = new Set(def.criterios.map((c) => c.id));
    for (const k of Object.keys(marcas ?? {})) if (!conocidos.has(k)) mal('Marca de un criterio que no existe');
    let total = 0;
    for (const c of def.criterios) {
        const m = marcas?.[c.id];
        if (def.tipo === 'COTEJO') {
            if (m !== undefined && m !== null && typeof m !== 'boolean') mal('En la lista de cotejo cada criterio es sí o no');
            if (m === true) total += c.puntos ?? 0;
        } else if (def.tipo === 'PUNTOS') {
            if (m === undefined || m === null) return null;
            if (!numero(m) || (m as number) < 0 || (m as number) > (c.puntos ?? 0)) mal(`«${c.texto}»: de 0 a ${c.puntos}`);
            total += m as number;
        } else {
            if (m === undefined || m === null) return null;
            const nivel = (def.niveles ?? NIVELES_POR_DEFECTO).find((n) => n.id === m);
            if (!nivel) mal(`«${c.texto}»: ese nivel no existe`);
            total += nivel!.valor * (c.peso ?? 1);
        }
    }
    return redondear(total);
}

/** Las plantillas con que se empieza (el profesor las cambia). */
export function plantillaDe(tipo: TipoDeInstrumento): Instrumento {
    if (tipo === 'COTEJO') {
        return {
            v: 1,
            tipo,
            criterios: [
                { id: 'c1', texto: 'Portada', puntos: 2 },
                { id: 'c2', texto: 'Plan de evaluación firmado por el representante', puntos: 5 },
                { id: 'c3', texto: 'Firmas de las clases impartidas', puntos: 5 },
                { id: 'c4', texto: 'Resolución de ejercicios en clase', puntos: 5 },
                { id: 'c5', texto: 'Pulcritud y responsabilidad', puntos: 3 },
            ],
        };
    }
    if (tipo === 'PUNTOS') {
        return {
            v: 1,
            tipo,
            criterios: [
                { id: 'ser', texto: 'Ser', puntos: 1 },
                { id: 'hacer', texto: 'Hacer', puntos: 1 },
                { id: 'convivir', texto: 'Convivir', puntos: 1 },
                { id: 'conocer', texto: 'Conocer', puntos: 17 },
            ],
        };
    }
    return {
        v: 1,
        tipo,
        niveles: NIVELES_POR_DEFECTO,
        criterios: [
            { id: 'c1', texto: 'Presentación', peso: 1 },
            { id: 'c2', texto: 'Estructura', peso: 1 },
            { id: 'c3', texto: 'Diseño', peso: 1 },
            { id: 'c4', texto: 'Redacción', peso: 1 },
            { id: 'c5', texto: 'Proceso', peso: 1 },
        ],
        ...(tipo === 'RUBRICA' ? { descriptores: {} } : {}),
    };
}
