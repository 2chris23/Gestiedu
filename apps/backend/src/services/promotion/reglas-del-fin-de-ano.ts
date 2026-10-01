/**
 * LAS REGLAS DEL FIN DEL AÑO ESCOLAR, DE CADA LICEO
 *
 * Lo del MPPE es el valor por defecto (CLAUDE.md: «las reglas de negocio son
 * configurables por instituto»). Viven en `academicConfig`, junto a la nota
 * mínima y el tope de materias pendientes, y se leen con `getAcademicConfig`.
 *
 *   - `revision`: cómo se divide la nota de la revisión (por defecto, una sola
 *     nota que vale el 100 %) y hasta cuántas materias reprobadas se pueden
 *     presentar en revisión (vacío: todas).
 *   - `ultimoAnoConPendientes`: qué pasa con el alumno de 5to (o 6to) que
 *     reprueba: REPITE (lo del MPPE: no se egresa con nada pendiente),
 *     SOLO_PENDIENTES (no egresa todavía: cursa solo las pendientes el año
 *     siguiente) o EGRESA (egresa y las presenta aparte).
 *   - `pendienteNoAprobada`: la materia pendiente del año anterior que no se
 *     aprobó en ningún momento: REPITE (no se promueve, lo del MPPE) o
 *     SIGUE_PENDIENTE (se arrastra otro año y cuenta en el tope).
 *   - `pendientes`: en cuántos momentos se evalúa una materia pendiente (4
 *     por defecto) y cómo se aprueba (en un momento aprobado, o por el
 *     promedio de los momentos).
 */

export interface ComponenteDeRevision {
    nombre: string;
    /** Porcentaje; la suma de todos es 100. */
    peso: number;
}

export interface ReglasDeRevision {
    componentes: ComponenteDeRevision[];
    /** Cuántas materias reprobadas puede llevar a revisión un alumno; null = todas. */
    maxMaterias: number | null;
}

export type UltimoAnoConPendientes = 'REPITE' | 'SOLO_PENDIENTES' | 'EGRESA';
export type PendienteNoAprobada = 'REPITE' | 'SIGUE_PENDIENTE';

export interface ReglasDePendientes {
    momentos: number;
    formaDeCalificar: 'MOMENTO_APROBADO' | 'PROMEDIO';
}

export const REVISION_POR_DEFECTO: ReglasDeRevision = {
    componentes: [{ nombre: 'Revisión', peso: 100 }],
    maxMaterias: null,
};

export const PENDIENTES_POR_DEFECTO: ReglasDePendientes = { momentos: 4, formaDeCalificar: 'MOMENTO_APROBADO' };

export function esReglasDeRevision(valor: unknown): valor is ReglasDeRevision {
    const v = valor as ReglasDeRevision;
    if (!v || typeof v !== 'object' || !Array.isArray(v.componentes)) return false;
    if (v.componentes.length < 1 || v.componentes.length > 6) return false;
    const nombres = new Set<string>();
    let suma = 0;
    for (const c of v.componentes) {
        if (!c || typeof c.nombre !== 'string') return false;
        const nombre = c.nombre.trim();
        if (nombre.length < 1 || nombre.length > 40 || nombres.has(nombre.toLowerCase())) return false;
        nombres.add(nombre.toLowerCase());
        if (!Number.isInteger(c.peso) || c.peso < 1 || c.peso > 100) return false;
        suma += c.peso;
    }
    if (suma !== 100) return false;
    if (v.maxMaterias !== null && v.maxMaterias !== undefined) {
        if (!Number.isInteger(v.maxMaterias) || v.maxMaterias < 1 || v.maxMaterias > 20) return false;
    }
    return true;
}

export function limpiarReglasDeRevision(v: ReglasDeRevision): ReglasDeRevision {
    return {
        componentes: v.componentes.map((c) => ({ nombre: c.nombre.trim(), peso: c.peso })),
        maxMaterias: v.maxMaterias ?? null,
    };
}

export function esUltimoAnoConPendientes(valor: unknown): valor is UltimoAnoConPendientes {
    return valor === 'REPITE' || valor === 'SOLO_PENDIENTES' || valor === 'EGRESA';
}

export function esPendienteNoAprobada(valor: unknown): valor is PendienteNoAprobada {
    return valor === 'REPITE' || valor === 'SIGUE_PENDIENTE';
}

/**
 * LA LABOR SOCIAL (Reglamento de la LOE, art. 27): requisito para el título
 * de bachiller, en los últimos años. Cada liceo la mide a su manera: por
 * horas (`horasRequeridas`) o por proyecto (0 horas: se cumple al culminar
 * el proyecto). Para egresar: BLOQUEA (no egresa sin ella), AVISA (egresa,
 * con aviso: lo del MPPE, que no niega el título por un retraso) o NO.
 */
export interface ReglasDeLaborSocial {
    activa: boolean;
    grados: number[];
    horasRequeridas: number;
    paraEgresar: 'BLOQUEA' | 'AVISA' | 'NO';
}

export const LABOR_SOCIAL_POR_DEFECTO: ReglasDeLaborSocial = { activa: true, grados: [5], horasRequeridas: 60, paraEgresar: 'AVISA' };

export function esReglasDeLaborSocial(valor: unknown): valor is ReglasDeLaborSocial {
    const v = valor as ReglasDeLaborSocial;
    return (
        !!v &&
        typeof v === 'object' &&
        typeof v.activa === 'boolean' &&
        Array.isArray(v.grados) &&
        v.grados.length >= 1 &&
        v.grados.length <= 6 &&
        v.grados.every((g) => Number.isInteger(g) && g >= 1 && g <= 6) &&
        typeof v.horasRequeridas === 'number' &&
        Number.isFinite(v.horasRequeridas) &&
        v.horasRequeridas >= 0 &&
        v.horasRequeridas <= 1000 &&
        (v.paraEgresar === 'BLOQUEA' || v.paraEgresar === 'AVISA' || v.paraEgresar === 'NO')
    );
}

export interface AvanceDeLaborSocial {
    horas: number;
    requeridas: number;
    porProyecto: boolean;
    proyectoCulminado: boolean;
    cumplida: boolean;
}

/** Lo que lleva hecho un alumno (todas sus actividades, de cualquier año). */
export function avanceDe(actividades: Array<{ horas: number; culminaElProyecto: boolean }>, reglas: ReglasDeLaborSocial): AvanceDeLaborSocial {
    const horas = Math.round(actividades.reduce((s, a) => s + a.horas, 0) * 100) / 100;
    const porProyecto = reglas.horasRequeridas === 0;
    const proyectoCulminado = actividades.some((a) => a.culminaElProyecto);
    return {
        horas,
        requeridas: reglas.horasRequeridas,
        porProyecto,
        proyectoCulminado,
        cumplida: porProyecto ? proyectoCulminado : horas >= reglas.horasRequeridas,
    };
}

export function esReglasDePendientes(valor: unknown): valor is ReglasDePendientes {
    const v = valor as ReglasDePendientes;
    return (
        !!v &&
        typeof v === 'object' &&
        Number.isInteger(v.momentos) &&
        v.momentos >= 1 &&
        v.momentos <= 8 &&
        (v.formaDeCalificar === 'MOMENTO_APROBADO' || v.formaDeCalificar === 'PROMEDIO')
    );
}
