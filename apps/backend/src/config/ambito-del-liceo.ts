/**
 * DE QUÉ LICEO ES LO QUE SE ESTÁ HACIENDO AHORA MISMO
 *
 * Aquí hay **una base de datos por liceo**, y eso aísla los datos: nadie lee la
 * tabla de otro. Pero la memoria rápida —lo que se guarda para no volver a
 * preguntar— es **una sola para todo el servidor**, y ahí el aislamiento no lo
 * da nadie: lo tiene que dar la clave con la que se guarda cada cosa.
 *
 * ─── EL FALLO QUE DESTAPÓ ESTO ───────────────────────────────────────────────
 *
 * La lista de notas se guardaba con esta clave:
 *
 *     grades:list|stu:-|sub:-|per:-|act:-|tch:-|cls:-|...|pg:1|lm:20
 *
 * Los guiones son «sin filtro». O sea: **pedir «todas las notas» produce
 * exactamente la misma clave en todos los liceos**. El primero que la pedía
 * dejaba sus notas guardadas ahí, y el siguiente liceo que pidiera lo mismo
 * recibía las del primero. Lo mismo pasaba con `grades:stats:{}` y con
 * `report:academic:{}`.
 *
 * Y al revés también: al guardar una nota se limpiaba `grades:list:*`, que
 * borraba lo guardado de **todos** los liceos, no solo el suyo.
 *
 * ─── POR QUÉ NO BASTA CON ARREGLAR ESAS TRES CLAVES ──────────────────────────
 *
 * Porque el resto se salvaba solo por suerte: usan identificadores (`cuid`) que
 * no se repiten entre bases. Pero los liceos que se crean copiando una base de
 * ejemplo **sí llevan los mismos identificadores**, y entonces `attendance:
 * classroom:aula-1` es la misma clave en dos liceos distintos. Arreglar tres
 * claves deja el resto dependiendo de que nadie copie una base.
 *
 * ─── LO QUE SE HACE ──────────────────────────────────────────────────────────
 *
 * El liceo de la petición se guarda aquí, y **la memoria rápida lo pone en la
 * clave sola** (`config/redis.ts`). Quien escribe una clave nueva ya no puede
 * olvidarse del liceo, porque no es él quien lo pone.
 *
 * Fuera de una petición (tareas programadas, arranque) no hay liceo, y entonces
 * la clave cae en el apartado `sin-liceo:`, que no se mezcla con el de nadie.
 */
import { AsyncLocalStorage } from 'async_hooks';

const almacen = new AsyncLocalStorage<string>();

/**
 * Deja dicho de qué liceo es lo que viene a continuación.
 *
 * Se llama desde el guardián de peticiones en cuanto se sabe el liceo, y vale
 * para todo lo que cuelgue de ahí: los ganchos de Fastify, el controlador, los
 * servicios y lo que se lance en segundo plano dentro de la petición.
 */
export function entrarEnElLiceo(instituteId: string): void {
    almacen.enterWith(instituteId);
}

/** El liceo de lo que se está haciendo, o `undefined` si no es de ninguno. */
export function liceoActual(): string | undefined {
    return almacen.getStore();
}

/**
 * Hacer algo como si fuera de un liceo concreto.
 *
 * Para lo que corre fuera de una petición y sí es de un liceo: una tarea
 * programada que recalcula promedios, una migración, una prueba.
 */
export function conLiceo<T>(instituteId: string, hacer: () => T): T {
    return almacen.run(instituteId, hacer);
}

/** Hacer algo expresamente sin liceo (lo de plataforma). */
export function sinLiceo<T>(hacer: () => T): T {
    return almacen.run(undefined as unknown as string, hacer);
}
