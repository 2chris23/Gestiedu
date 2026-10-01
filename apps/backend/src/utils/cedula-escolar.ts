/**
 * LA CÉDULA ESCOLAR
 *
 * El alumno que todavía no tiene cédula de identidad (casi todos los de 1er
 * año) se identifica en el liceo y en los documentos del Ministerio con la
 * **cédula escolar**, de 12 caracteres:
 *
 *   V  1  09  12345678
 *   │  │  │   └ la cédula de la MADRE (8 dígitos; con un 0 delante si tiene 7).
 *   │  │  │     Si no hay madre, la del padre.
 *   │  │  └ los dos últimos dígitos del AÑO de nacimiento del alumno.
 *   │  └ el ORDEN del parto (1; 2 para el segundo de unos morochos…).
 *   └ V (venezolano, o hijo de venezolano nacido fuera) o E (extranjero).
 *
 * Instructivo del MPPE para la asignación de la cédula escolar.
 *
 * Esta cuenta está copiada en `apps/web/src/lib/cedula-escolar.ts`: si cambia
 * aquí, cambia allí (CED-01…03 en los dos lados).
 */

export type Nacionalidad = 'V' | 'E';

export interface DatosDeLaCedulaEscolar {
    nacionalidad: Nacionalidad;
    /** 1 para un parto simple; 2, 3… para el segundo, tercero de un parto múltiple. */
    ordenDelParto: number;
    /** El año de nacimiento del alumno (4 cifras). */
    anioDeNacimiento: number;
    /** La cédula de la madre (o del padre), solo el número. */
    cedulaDeLaMadre: string;
}

const SOLO_DIGITOS = /\D/g;

/** Arma la cédula escolar, o dice qué falta. */
export function armarCedulaEscolar(d: DatosDeLaCedulaEscolar): { cedula: string } | { error: string } {
    if (d.nacionalidad !== 'V' && d.nacionalidad !== 'E') return { error: 'La nacionalidad es V o E.' };
    if (!Number.isInteger(d.ordenDelParto) || d.ordenDelParto < 1 || d.ordenDelParto > 9) {
        return { error: 'El orden del parto va del 1 al 9 (1 si no es morocho).' };
    }
    if (!Number.isInteger(d.anioDeNacimiento) || d.anioDeNacimiento < 1900 || d.anioDeNacimiento > 2100) {
        return { error: 'El año de nacimiento va con sus cuatro cifras (p. ej. 2012).' };
    }
    const madre = String(d.cedulaDeLaMadre ?? '').replace(SOLO_DIGITOS, '');
    if (madre.length < 6 || madre.length > 8) {
        return { error: 'La cédula de la madre (o del padre) tiene de 6 a 8 dígitos.' };
    }
    const anio = String(d.anioDeNacimiento % 100).padStart(2, '0');
    return { cedula: `${d.nacionalidad}${d.ordenDelParto}${anio}${madre.padStart(8, '0')}` };
}

/** ¿Tiene la forma de una cédula escolar? (V|E, orden 1-9, 2 dígitos del año, 8 de la madre). */
export function esCedulaEscolar(valor: unknown): boolean {
    return typeof valor === 'string' && /^[VE][1-9]\d{2}\d{8}$/.test(valor.trim().toUpperCase());
}

/** La cédula escolar como se lee en un documento: «V-1-09-12345678». */
export function cedulaEscolarLegible(valor: string): string {
    const v = valor.trim().toUpperCase();
    if (!esCedulaEscolar(v)) return valor;
    return `${v[0]}-${v[1]}-${v.slice(2, 4)}-${v.slice(4)}`;
}
