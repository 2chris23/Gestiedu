/**
 * LA PAPELERA — NADA SE BORRA DE VERDAD
 *
 * Antes de borrar una fila se guarda aquí una copia completa, tal como estaba.
 * Las consultas no cambian: las pantallas siguen viendo lo mismo que antes. Lo
 * único que cambia es que un borrado por error deja de ser definitivo.
 *
 * Por qué hace falta: borrar un estudiante se lleva por delante sus notas, sus
 * asistencias, sus observaciones y su historial académico. Sin esto, lo único
 * que queda es el respaldo de anoche — y restaurarlo borra todo lo que el liceo
 * hizo hoy. Esta es la red del día en curso.
 *
 * ─── SI NO SE PUEDE GUARDAR LA COPIA, NO SE BORRA ────────────────────────────
 *
 * Si falla el guardado en la papelera, el borrado **no sigue**. Es a propósito:
 * un borrado que se ejecuta sin copia es exactamente lo que esto viene a evitar,
 * y hacerlo en silencio sería peor que no tener papelera. Además, dentro de una
 * transacción, tragarse el error no serviría de nada: PostgreSQL ya habría
 * abortado la transacción entera.
 *
 * ─── LO QUE NO ENTRA ─────────────────────────────────────────────────────────
 *
 * Las sesiones (`refreshToken`) y los avisos (`notification`). Guardar sesiones
 * sería guardar llaves de casa, y los avisos no son información del liceo.
 */

import { Prisma } from '@prisma/client';

/** Cliente Prisma del liceo —o una transacción—, sin tipos para recorrer modelos por nombre. */
type ClienteDelLiceo = any;

/**
 * LO QUE SE LLEVA LA CASCADA, QUE NADIE ESTABA COPIANDO
 *
 * La papelera guardaba **la fila que se nombra y nada más**. Pero PostgreSQL
 * borra en cascada: al borrar una materia se van con ella todas sus notas, su
 * plan de evaluación, sus horarios y sus sesiones de clase. Ninguna de esas
 * filas pasaba por aquí.
 *
 * O sea: la promesa «nada se borra de verdad» se cumplía para una fila y se
 * rompía justo para lo que más duele perder. Un administrador que borra por
 * error una materia de 1er año se llevaba por delante las notas de todos sus
 * alumnos, y en la papelera quedaba **la materia sola**.
 *
 * Esto recorre el mapa de relaciones de Prisma y copia todo lo que la cascada
 * va a arrastrar, hasta el último nivel, antes de borrar nada.
 */
interface HijoEnCascada {
    /** Nombre del modelo hijo, tal como lo llama Prisma. */
    modelo: string;
    /** El delegado del cliente: `grade`, `dailyAttendance`… */
    delegado: string;
    /** La columna del hijo que apunta al padre. */
    columna: string;
}

/** Nunca entran en la papelera: son llaves de casa y avisos, no datos del liceo. */
const FUERA_DE_LA_PAPELERA = new Set(['RefreshToken', 'Notification']);

const delegadoDe = (modelo: string) => modelo.charAt(0).toLowerCase() + modelo.slice(1);

/** Mapa «padre → hijos que se van con él», sacado del propio esquema. */
const HIJOS_POR_CASCADA: Record<string, HijoEnCascada[]> = (() => {
    const mapa: Record<string, HijoEnCascada[]> = {};
    for (const modelo of Prisma.dmmf.datamodel.models) {
        if (FUERA_DE_LA_PAPELERA.has(modelo.name)) continue;
        for (const campo of modelo.fields as unknown as Array<Record<string, any>>) {
            if (campo.kind !== 'object') continue;
            if (campo.relationOnDelete !== 'Cascade') continue;
            const columna = campo.relationFromFields?.[0];
            if (!columna) continue;
            (mapa[campo.type] ||= []).push({
                modelo: modelo.name,
                delegado: delegadoDe(modelo.name),
                columna,
            });
        }
    }
    return mapa;
})();

/**
 * Tope de filas que se copian de una vez.
 *
 * Copiar tiene un límite razonable: borrar un año académico entero puede
 * arrastrar cientos de miles de filas, y meterlas todas en la papelera no es lo
 * que la papelera viene a resolver —para eso está el respaldo—. Si se pasa de
 * aquí, **el borrado no ocurre** y se dice por qué: es la misma regla de
 * siempre, si la copia no cabe, no se borra.
 */
export function topeDeLaPapelera(): number {
    const v = Number(process.env.PAPELERA_MAX_FILAS);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 20000;
}

/** Trocea los identificadores: un `IN (...)` con cien mil elementos no es buena idea. */
function enTrozos<T>(xs: T[], tamano = 500): T[][] {
    const trozos: T[][] = [];
    for (let i = 0; i < xs.length; i += tamano) trozos.push(xs.slice(i, i + tamano));
    return trozos;
}

/**
 * Copia a la papelera todo lo que la cascada va a arrastrar debajo de estas
 * filas. Devuelve cuántas copió.
 */
async function copiarLoQueArrastraLaCascada(
    prisma: ClienteDelLiceo,
    modelo: string,
    ids: string[],
    quien: QuienBorra,
    yaVistos: Set<string>,
    llevamos: number
): Promise<number> {
    let copiadas = llevamos;

    for (const hijo of HIJOS_POR_CASCADA[modelo] ?? []) {
        const tablaHija = prisma[hijo.delegado];
        if (!tablaHija) continue;

        const suyas: Array<Record<string, unknown>> = [];
        for (const trozo of enTrozos(ids)) {
            const filas = await tablaHija.findMany({ where: { [hijo.columna]: { in: trozo } } });
            for (const fila of filas) {
                // Una misma fila puede colgar de dos padres a la vez (un vínculo
                // alumno-representante cuelga de los dos): se copia una sola vez.
                const marca = `${hijo.modelo}:${String((fila as any)?.id ?? '')}`;
                if (yaVistos.has(marca)) continue;
                yaVistos.add(marca);
                suyas.push(fila);
            }
        }
        if (suyas.length === 0) continue;

        copiadas += suyas.length;
        if (copiadas > topeDeLaPapelera()) {
            throw new Error(
                `Este borrado arrastra más de ${topeDeLaPapelera()} filas y la papelera no las puede guardar. ` +
                `No se ha borrado nada. Haz un respaldo antes (npm run backup:tenants), o sube PAPELERA_MAX_FILAS ` +
                `si de verdad quieres guardar copia de todas.`
            );
        }

        // Se guarda con el nombre que usa Prisma para la tabla (`grade`,
        // `dailyAttendance`), igual que lo hace quien borra a mano: si aquí se
        // escribiera de otra forma, restaurar no encontraría estas filas.
        await guardarEnPapelera(prisma, hijo.delegado, suyas, quien);

        copiadas = await copiarLoQueArrastraLaCascada(
            prisma,
            hijo.modelo,
            suyas.map((f) => String((f as any)?.id ?? '')).filter(Boolean),
            quien,
            yaVistos,
            copiadas
        );
    }

    return copiadas;
}

export interface QuienBorra {
    /** Id de quien pidió el borrado. */
    usuarioId?: string;
    /** Dónde ocurrió: normalmente el método y la ruta. */
    motivo?: string;
}

/**
 * Guarda copias en la papelera.
 *
 * Lanza si no puede guardarlas: quien llama debe dejar el borrado sin hacer.
 */
export async function guardarEnPapelera(
    prisma: ClienteDelLiceo,
    tabla: string,
    filas: Array<Record<string, unknown>>,
    quien: QuienBorra = {}
): Promise<void> {
    if (!filas || filas.length === 0) return;

    await prisma.registroBorrado.createMany({
        data: filas.map((fila) => ({
            tabla,
            registroId: String((fila as any)?.id ?? ''),
            // Pasar por texto deja fechas y decimales en un formato que Postgres
            // acepta como Json sin quejarse.
            contenido: JSON.parse(JSON.stringify(fila)),
            borradoPor: quien.usuarioId ?? null,
            motivo: quien.motivo ?? null,
        })),
    });
}

/**
 * Borra guardando copia: primero lee lo que va a desaparecer, lo guarda, y
 * entonces borra. Devuelve cuántas filas se borraron.
 *
 * Se usa igual que `prisma.<modelo>.deleteMany({ where })`, pasando además el
 * nombre del modelo y quién lo pidió. Sirve tanto con el cliente normal como
 * dentro de una transacción (`tx`).
 */
export async function borrarGuardandoCopia(
    prisma: ClienteDelLiceo,
    modelo: string,
    where: Record<string, unknown>,
    quien: QuienBorra = {}
): Promise<number> {
    const tabla = prisma[modelo];
    if (!tabla) throw new Error(`La papelera no conoce el modelo "${modelo}"`);

    const condenadas = await tabla.findMany({ where });
    if (condenadas.length === 0) return 0;

    await guardarEnPapelera(prisma, modelo, condenadas, quien);

    // Y lo que se va con ellas sin que nadie lo haya nombrado. Va DESPUÉS de
    // guardar el padre y ANTES de borrar: si no cabe, esto lanza y el borrado
    // no llega a ocurrir.
    const nombreDelModelo = modelo.charAt(0).toUpperCase() + modelo.slice(1);
    await copiarLoQueArrastraLaCascada(
        prisma,
        nombreDelModelo,
        condenadas.map((f: any) => String(f?.id ?? '')).filter(Boolean),
        quien,
        new Set<string>(),
        condenadas.length
    );

    const resultado = await tabla.deleteMany({ where });
    return resultado?.count ?? condenadas.length;
}

/**
 * De una petición saca quién borra y desde dónde, para anotarlo en la papelera.
 */
export function quienBorra(request: {
    user?: { id?: string; userId?: string } | null;
    method?: string;
    url?: string;
}): QuienBorra {
    const usuario = request?.user as any;
    return {
        usuarioId: usuario?.userId ?? usuario?.id ?? undefined,
        motivo:
            request?.method && request?.url
                ? `${request.method} ${String(request.url).split('?')[0]}`
                : undefined,
    };
}

/** Cuánto se guarda lo borrado antes de tirarlo de verdad. */
export function diasQueSeGuardaLoBorrado(): number {
    const v = Number(process.env.PAPELERA_DIAS);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 90;
}

/**
 * Vacía lo que lleva demasiado tiempo en la papelera.
 *
 * 90 días por defecto: un error de borrado se nota dentro del mismo lapso. Más
 * allá de eso, quien tiene que guardar la historia es el respaldo, no esto.
 */
export async function limpiarPapeleraVieja(
    prisma: ClienteDelLiceo,
    dias = diasQueSeGuardaLoBorrado()
): Promise<number> {
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const r = await prisma.registroBorrado.deleteMany({ where: { createdAt: { lt: corte } } });
    return r?.count ?? 0;
}
