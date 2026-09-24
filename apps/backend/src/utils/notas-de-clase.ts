import { PrismaClient } from '@prisma/client';

/**
 * LAS NOTAS DE UNA ACTIVIDAD DE CLASE: SE AÑADEN, NO SE REESCRIBEN
 *
 * Todas las notas de una actividad de la clase en vivo viven juntas en una sola
 * columna, `class_activities.scores` (alumno → nota). Guardarlas era leer ese
 * mapa, mezclarle lo nuevo aquí y escribirlo ENTERO. En cuanto dos guardados se
 * cruzaban —el guardado automático manda una tanda mientras la anterior sigue
 * en camino; el profesor tiene la clase abierta en el teléfono y en el
 * portátil— los dos leían el mismo mapa y el último en escribir borraba al
 * alumno del otro. Sin error: la nota que el profesor vio guardada no estaba.
 *
 * Ahora la mezcla la hace PostgreSQL en la misma escritura (`scores || nuevo`),
 * que es atómica: da igual cuántos guardados se crucen, cada uno añade lo suyo.
 * `tests/integration/notas-que-no-se-pisan.test.ts`.
 */

/** Una cédula o un identificador: letras, números, punto, guion. */
const ID_DE_ALUMNO = /^[A-Za-z0-9._-]{1,50}$/;
const TOPE_DE_ESCALA = 1000;

export type Notas = Record<string, number | null>;

/**
 * Qué tiene de malo lo que se quiere guardar, o `null` si nada.
 *
 * Una nota fuera de la escala no es una nota: 25 sobre 20 subiría el promedio
 * de ese alumno y nadie sabría de dónde salió. Se rechaza entera, sin guardar
 * a medias: si la tanda trae una mala, no se guarda ninguna, y el profesor ve
 * el aviso en el acto.
 */
export function revisarNotas(scores: unknown, escala: number): string | null {
    if (!Number.isFinite(escala) || escala <= 0 || escala > TOPE_DE_ESCALA) {
        return `La nota máxima tiene que estar entre 1 y ${TOPE_DE_ESCALA}`;
    }
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
        return 'Las notas tienen que ir como alumno → nota';
    }
    for (const [alumno, nota] of Object.entries(scores as Record<string, unknown>)) {
        if (!ID_DE_ALUMNO.test(alumno)) return `Identificador de alumno no válido: ${alumno.slice(0, 20)}`;
        if (nota === null) continue; // quitar la nota
        if (typeof nota !== 'number' || !Number.isFinite(nota)) return 'Cada nota tiene que ser un número';
        if (nota < 0 || nota > escala) return `Cada nota tiene que estar entre 0 y ${escala}`;
    }
    return null;
}

/**
 * Añade (o corrige, o quita con `null`) las notas de unos alumnos sin tocar las
 * del resto. Si viene `maxScore`, se cambia en la misma escritura.
 */
export async function sumarNotas(
    prisma: PrismaClient,
    actividadId: string,
    notas: Notas,
    maxScore?: number
): Promise<void> {
    const nuevas = JSON.stringify(notas);
    const escala = maxScore === undefined ? null : Number(maxScore);

    // Lo guardado como texto por una versión vieja se convierte antes, con
    // `arreglarNotasGuardadasComoTexto`. Si aun así no es un mapa (vacío o
    // roto), se parte de uno vacío: `||` sobre otra cosa daría una lista.
    await prisma.$executeRaw`
        UPDATE class_activities
           SET scores = (CASE jsonb_typeof(scores)
                             WHEN 'object' THEN scores
                             ELSE '{}'::jsonb
                         END) || ${nuevas}::jsonb,
               "maxScore" = COALESCE(${escala}::double precision, "maxScore"),
               "updatedAt" = NOW()
         WHERE id = ${actividadId}`;
}

/**
 * Si una fila vieja guarda las notas como TEXTO (un JSON dentro de una
 * cadena), se convierten a mapa antes de nada. Así la mezcla de arriba parte de
 * ellas y no de un mapa vacío.
 */
export async function arreglarNotasGuardadasComoTexto(
    prisma: PrismaClient,
    actividadId: string,
    guardado: unknown
): Promise<void> {
    if (typeof guardado !== 'string') return;
    let mapa: unknown;
    try {
        mapa = JSON.parse(guardado);
    } catch {
        return;
    }
    if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) return;
    await prisma.$executeRaw`
        UPDATE class_activities
           SET scores = ${JSON.stringify(mapa)}::jsonb
         WHERE id = ${actividadId} AND jsonb_typeof(scores) = 'string'`;
}
