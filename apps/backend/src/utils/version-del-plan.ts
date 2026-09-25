import { createHash } from 'crypto';

/**
 * LA VERSIÓN DE UN PLAN DE EVALUACIÓN
 *
 * Guardar el plan manda el plan ENTERO, y lo que no viene se borra. Eso está
 * bien mientras quien guarda tenga delante lo último. Pero un profesor con el
 * plan abierto en dos pestañas (o en el teléfono y en el portátil) añadía una
 * semana en una, guardaba, y al guardar desde la otra —la vieja— esa semana
 * desaparecía. Iba a la papelera, sí, pero él veía que su trabajo se esfumó.
 *
 * La versión es una huella de las filas tal como están guardadas: cada fila con
 * su última modificación. Cualquier fila añadida, quitada o cambiada la mueve.
 * La pantalla la recibe al leer el plan y la devuelve al guardar; si ya no
 * coincide, el servidor responde 409 y no toca nada.
 */
export function versionDelPlan(filas: Array<{ id: string; updatedAt: Date | string }>): string {
    const partes = filas
        .map((f) => `${f.id}:${new Date(f.updatedAt).getTime()}`)
        .sort();
    return createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 16);
}

/** Los campos que dicen si una fila del plan cambió. */
const CAMPOS = [
    'rowType', 'weekNumber', 'endWeekNumber', 'orderIndex', 'title', 'headingLevel',
    'label', 'content', 'textContent', 'actividadEval', 'tecnicas', 'instrumentos',
    'criterios', 'ponderacion', 'puntos', 'tipoEvaluacion', 'indicadores', 'extraData',
] as const;

/**
 * ¿Es esta fila igual a la guardada? Si lo es, no se reescribe.
 *
 * Guardar reescribía TODAS las filas del plan aunque solo hubiera cambiado una
 * celda: cuarenta escrituras dentro de una transacción de cinco segundos, y
 * cada una movía la fecha de la fila (así que la versión cambiaba sin que nada
 * hubiera cambiado).
 */
export function filaSinCambios(guardada: Record<string, any>, nueva: Record<string, any>): boolean {
    return CAMPOS.every((campo) => {
        const a = guardada[campo] ?? null;
        const b = nueva[campo] ?? null;
        if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
        return a === b;
    });
}
