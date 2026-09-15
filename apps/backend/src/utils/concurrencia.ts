import { Prisma } from '@prisma/client';

/**
 * DOS COSAS A LA VEZ
 *
 * Un liceo con 5.000 personas conectadas hace cosas al mismo tiempo, y el
 * navegador reintenta solo. Dos patrones se repiten en todo el sistema:
 *
 *   1. "busca y si no existe, créalo" — dos peticiones buscan a la vez, las dos
 *      no encuentran nada, las dos crean, y la segunda choca contra la base;
 *   2. "dos personas corrigen lo mismo" — la última en guardar pisa a la
 *      primera y nadie se entera.
 *
 * Aquí viven las dos respuestas, para no repetirlas en cada controlador.
 */

/** ¿Este error es "ya existe una fila igual"? (P2002 de Prisma) */
export function esConflictoDeUnicidad(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2002';
    const codigo = (error as { code?: unknown })?.code;
    return codigo === 'P2002';
}

/**
 * Crea la fila, y si alguien se adelantó por milisegundos, devuelve la que ya
 * está en vez de reventar. El resultado es el mismo mire quien mire: una sola
 * fila y las dos peticiones contentas.
 *
 * @param crear     lo que se intenta crear
 * @param recuperar cómo encontrar la que ya existía (se llama solo si hubo choque)
 */
export async function crearORecuperar<T>(
    crear: () => Promise<T>,
    recuperar: () => Promise<T | null>
): Promise<T> {
    try {
        return await crear();
    } catch (error) {
        if (!esConflictoDeUnicidad(error)) throw error;

        const existente = await recuperar();
        if (existente) return existente;

        // Chocó contra otra restricción distinta a la que se buscaba: eso sí es
        // un problema de verdad y tiene que subir.
        throw error;
    }
}

/**
 * Aviso de "alguien lo cambió antes que tú".
 *
 * La pantalla manda la versión que tenía a la vista (`expectedUpdatedAt`). Si
 * la fila ya no está en esa versión es que otra persona guardó mientras tanto:
 * se corta y se avisa, en vez de pisar su trabajo en silencio.
 *
 * Quien no manda versión guarda como siempre: las pantallas viejas y la app no
 * se rompen por esto.
 */
export function fueModificadoPorOtro(
    versionEsperada: string | undefined | null,
    versionActual: Date | null | undefined
): boolean {
    if (!versionEsperada) return false;
    if (!versionActual) return false;

    const esperada = new Date(versionEsperada).getTime();
    if (Number.isNaN(esperada)) return false;

    // Comparación exacta: las fechas viajan en ISO con milisegundos y la base
    // guarda milisegundos. Si no es exactamente la misma versión, alguien
    // guardó en medio. Ante la duda se avisa, que es el lado seguro: peor es
    // borrarle el trabajo a alguien sin decírselo.
    return versionActual.getTime() !== esperada;
}

/** El aviso que ve la persona cuando otro se le adelantó. */
export const AVISO_MODIFICADO_POR_OTRO = {
    error: 'Otra persona modificó este dato mientras lo editabas. Vuelve a abrirlo para ver el cambio antes de guardar.',
    code: 'MODIFICADO_POR_OTRO',
} as const;

/**
 * La versión que la pantalla tenía a la vista.
 *
 * Puede llegar por cabecera (`X-Version-Vista`, sirve para cualquier
 * pantalla sin tocar su validación) o dentro del cuerpo
 * (`expectedUpdatedAt`). Quien no la manda guarda como siempre.
 */
export function versionVista(request: {
    headers?: Record<string, unknown>;
    body?: unknown;
}): string | undefined {
    const cabecera = request.headers?.['x-version-vista'];
    if (typeof cabecera === 'string' && cabecera.length > 0) return cabecera;

    const enCuerpo = (request.body as { expectedUpdatedAt?: unknown } | undefined)?.expectedUpdatedAt;
    return typeof enCuerpo === 'string' && enCuerpo.length > 0 ? enCuerpo : undefined;
}
