import { generateSlug } from './slug';

/**
 * EL NOMBRE Y LA DIRECCIÓN DE UNA SECCIÓN
 *
 * «1er Año A», «3er Año B (Tarde)»; y su dirección, con el año escolar para
 * que no choque con la del año anterior («1er-ano-a-2026-2027»). La misma
 * cuenta que al crear una sección a mano (`classrooms.controller`); el cierre
 * del año hacía otra («3er-ano-» para todos los grados).
 */
export const NOMBRE_DEL_GRADO: Record<number, string> = {
    1: '1er Año',
    2: '2do Año',
    3: '3er Año',
    4: '4to Año',
    5: '5to Año',
    6: '6to Año',
};

export function nombreDeLaSeccion(grado: number, seccion: string, turno?: string | null): string {
    const grado_ = NOMBRE_DEL_GRADO[grado] || `${grado}º Año`;
    const sufijo = turno === 'TARDE' ? ' (Tarde)' : turno === 'INTEGRAL' ? ' (Integral)' : '';
    return `${grado_} ${seccion}${sufijo}`;
}

export function slugDeLaSeccion(nombre: string, nombreDelAno: string): string {
    return generateSlug(`${nombre} ${nombreDelAno}`);
}
