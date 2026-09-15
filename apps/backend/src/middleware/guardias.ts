import { FastifyInstance } from 'fastify';

/**
 * PRIMERO EL GUARDIA, DESPUÉS EL FORMULARIO
 *
 * ─── EL PROBLEMA ─────────────────────────────────────────────────────────────
 *
 * Fastify revisa el formulario (el `schema` de la ruta: qué campos hacen falta,
 * qué valores acepta cada uno) **antes** de ejecutar los `preHandler`, que es
 * donde están los guardias. Resultado: a un desconocido sin ninguna credencial
 * se le respondía
 *
 *     400 — body must have required property 'email'
 *
 * en vez de "no sé quién eres". Probando así, sin entrar, se sacaba la ficha
 * entera del sistema: qué campos existen, cuáles son obligatorios, qué roles
 * acepta, cuántos registros deja pedir de golpe. Eran 30 rutas; se comprobó
 * contra el servidor en marcha.
 *
 * Datos del liceo no entregaba ninguno — la credencial se seguía exigiendo antes
 * de tocar nada. Pero le daba a un extraño el plano del edificio, que es por
 * donde se empieza a buscar la ventana mal cerrada.
 *
 * ─── LA SOLUCIÓN ─────────────────────────────────────────────────────────────
 *
 * Los guardias se adelantan a `onRequest`, que corre antes de la revisión del
 * formulario. Se hace **aquí, en un solo sitio**, y no retocando a mano las 137
 * rutas que llevan guardia: una sola pieza que se lee y se comprueba, en lugar
 * de 137 oportunidades de olvidarse de una.
 *
 * Qué se adelanta y qué no: solo se marcan como guardia las comprobaciones que
 * miran la **cabecera y la dirección** (quién eres, qué rol tienes, de qué
 * sección es esto). Lo que necesita leer el formulario —`validateBody`,
 * `verifyInstitute`, el cupo de intentos de entrar— se queda donde estaba, y
 * ahora corre después del guardia, que es su sitio.
 */

/** Marca en la función que dice "esto es un guardia y va antes del formulario". */
const ES_GUARDIA = Symbol.for('gestiedu.guardia');

/** Declara una comprobación como guardia. Devuelve la misma función. */
export function marcarGuardia<T extends Function>(fn: T): T {
    (fn as any)[ES_GUARDIA] = true;
    return fn;
}

/** Marca como guardia todo lo que devuelva una fábrica de comprobaciones. */
export function fabricaDeGuardias<A extends any[], T extends Function>(
    fabrica: (...args: A) => T
): (...args: A) => T {
    return (...args: A) => marcarGuardia(fabrica(...args));
}

export function esGuardia(fn: unknown): boolean {
    return typeof fn === 'function' && (fn as any)[ES_GUARDIA] === true;
}

const comoLista = (x: unknown): Function[] => {
    if (!x) return [];
    return Array.isArray(x) ? (x as Function[]) : [x as Function];
};

/**
 * Engancha el reordenado a un servidor. Hay que llamarlo ANTES de registrar las
 * rutas: Fastify solo avisa de las que se declaren después.
 */
export function ponerLosGuardiasPrimero(server: FastifyInstance): void {
    server.addHook('onRoute', (opciones) => {
        const enElFormulario = comoLista(opciones.preHandler);
        if (enElFormulario.length === 0) return;

        const guardias = enElFormulario.filter(esGuardia);
        if (guardias.length === 0) return;

        const resto = enElFormulario.filter((f) => !esGuardia(f));

        // Los guardias de la ruta van detrás de los que ya hubiera puestos a mano
        // en `onRequest` (algunas rutas ya lo hacían así), conservando su orden.
        opciones.onRequest = [...comoLista(opciones.onRequest), ...guardias] as any;
        opciones.preHandler = (resto.length > 0 ? resto : undefined) as any;
    });
}
