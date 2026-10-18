/**
 * LAS REGLAS DE LOS GRUPOS ESTABLES DEL LICEO (`academicConfig.gruposEstables`)
 *
 * Cada liceo decide si el alumno elige grupo una vez al año o en cada lapso,
 * y si la elección está abierta ahora. Aparte del servicio para que la
 * configuración académica pueda validarlas sin importarlo.
 */
export interface ReglasDeGrupos {
    /** Una vez al año, o de nuevo en cada lapso. */
    eleccion: 'ANUAL' | 'POR_LAPSO';
    /** Si los alumnos pueden pedir ahora. */
    abierta: boolean;
}

export const REGLAS_DE_GRUPOS_POR_DEFECTO: ReglasDeGrupos = { eleccion: 'ANUAL', abierta: true };

export function esReglasDeGrupos(v: unknown): v is ReglasDeGrupos {
    if (!v || typeof v !== 'object') return false;
    const r = v as Record<string, unknown>;
    return (r.eleccion === 'ANUAL' || r.eleccion === 'POR_LAPSO') && typeof r.abierta === 'boolean';
}

export function limpiarReglasDeGrupos(r: ReglasDeGrupos): ReglasDeGrupos {
    return { eleccion: r.eleccion, abierta: r.abierta };
}
