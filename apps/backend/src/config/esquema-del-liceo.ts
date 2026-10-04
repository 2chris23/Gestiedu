import type { PrismaClient } from '@prisma/client';

/**
 * EL ESQUEMA DEL LICEO, EN CADA TRANSACCIÓN (AISLA-*, 2026-10-04)
 *
 * En la base compartida todos los liceos entran con el mismo usuario a la
 * misma base, y PgBouncer (modo transacción) les reparte el MISMO pozo de
 * conexiones: una conexión real pasa de un liceo a otro entre transacción y
 * transacción.
 *
 * Prisma fija el esquema del liceo con `SET search_path` UNA vez, al abrir la
 * conexión. Las consultas de los modelos no lo necesitan (llevan el esquema
 * escrito: `"tenant_x"."users"`), pero el SQL escrito a mano (`FROM payments`)
 * sí: medido con `probar-aislamiento-por-esquema.ts`, a través de PgBouncer
 * un liceo leía los usuarios de OTRO en 359 de 400 consultas (y del esquema
 * `public` en otras). Con el dinero, las notas y los conteos hechos a mano,
 * eso es ver y tocar lo de otro liceo.
 *
 * El arreglo, en un solo sitio y no en las 79 consultas: el cliente del liceo
 * mete cada consulta a mano en su propia transacción con
 * `SET LOCAL search_path` a SU esquema (LOCAL = solo esa transacción, la
 * conexión vuelve limpia al pozo), y cada transacción del código empieza por
 * lo mismo. Sin `public` detrás: allí hay tablas de otro liceo con los mismos
 * nombres, y un error de esquema tiene que fallar, no leer lo ajeno. Las
 * extensiones (`pg_trgm`, `unaccent`) viven en `pg_catalog`, siempre a mano.
 *
 * Límite: una consulta a mano dentro de un `$transaction([...])` de lista no se
 * puede meter en otra transacción; Prisma lo rechaza con un error (no en
 * silencio). Hoy no hay ninguna: dentro de una transacción, `tx.$queryRaw`.
 */

const RAW = new Set(['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe']);

/** El esquema del liceo en la base compartida, o null si vive en su base propia (`public`). */
export function esquemaPropio(esquema: string | null | undefined): string | null {
    const e = esquema?.trim();
    return e && e !== 'public' ? e : null;
}

export function esquemaValido(esquema: string): boolean {
    return /^[a-z0-9_]{1,63}$/.test(esquema);
}

export function fijarElEsquema<T extends PrismaClient>(cliente: T, esquema: string): T {
    if (!esquemaValido(esquema)) throw new Error(`Nombre de esquema no válido: ${esquema}`);
    const fijar = `SET LOCAL search_path TO "${esquema}"`;
    return new Proxy(cliente, {
        get(destino: any, prop, receptor) {
            if (typeof prop === 'string' && RAW.has(prop)) {
                return (...args: unknown[]) =>
                    destino.$transaction([destino.$executeRawUnsafe(fijar), destino[prop](...args)]).then((r: unknown[]) => r[1]);
            }
            if (prop === '$transaction') {
                return (arg: any, opciones?: any) => {
                    if (typeof arg === 'function') {
                        return destino.$transaction(async (tx: any) => {
                            await tx.$executeRawUnsafe(fijar);
                            return arg(tx);
                        }, opciones);
                    }
                    return destino
                        .$transaction([destino.$executeRawUnsafe(fijar), ...arg], opciones)
                        .then((r: unknown[]) => r.slice(1));
                };
            }
            const valor = Reflect.get(destino, prop, receptor);
            return typeof valor === 'function' ? valor.bind(destino) : valor;
        },
    }) as T;
}
