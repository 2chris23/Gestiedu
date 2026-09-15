import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { monitorEventLoopDelay } from 'perf_hooks';
import { logger } from '../utils/logger';

/**
 * NO ACEPTAR MÁS TRABAJO DEL QUE SE AGUANTA
 *
 * Medido bajo carga: el servidor **no rechazaba nada**. Iba aceptando peticiones
 * mientras la base no daba abasto, la cola crecía y las respuestas pasaron de 400
 * milisegundos a 39 segundos, con la memoria subiendo a 1,9 GB.
 *
 * Una respuesta que tarda 39 segundos ya no le sirve a nadie: quien la pidió se
 * fue hace rato, pero el servidor sigue gastándose en ella mientras la cola crece
 * por detrás. Eso no es ir lento, es ir hacia la caída.
 *
 * Un servidor que ya no puede con más tiene que decirlo, no tragar. Decir "ahora
 * no puedo, intentá en unos segundos" es honesto y se recupera solo. Aceptar
 * todo y morir es lo peor de los dos mundos: el que pidió tampoco fue atendido,
 * y además se llevó por delante a los que ya estaban dentro.
 *
 * ─── CÓMO SE SABE QUE YA NO PUEDE ────────────────────────────────────────────
 *
 * Dos señales, y basta con una:
 *
 *   1. **Demasiadas peticiones a medio atender a la vez.** Es la cola creciendo.
 *   2. **El bucle de eventos va retrasado.** Es Node sin tiempo ni para
 *      atenderse a sí mismo; a partir de ahí todo lo demás llega tarde.
 *
 * ─── LO QUE NUNCA SE RECHAZA ─────────────────────────────────────────────────
 *
 * `/health` y `/api/time`. El primero porque es como el servidor avisa de que
 * está vivo: rechazarlo haría que lo reiniciaran justo cuando está saliendo
 * adelante. El segundo porque es diminuto y de él depende la hora del liceo.
 */

/** Cuántas peticiones a medio atender se toleran antes de decir que no. */
function topeDeCola(): number {
    const v = Number(process.env.TOPE_PETICIONES_A_LA_VEZ);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1500;
}

/** Cuánto retraso del bucle de eventos se tolera, en milisegundos. */
function topeDeRetraso(): number {
    const v = Number(process.env.TOPE_RETRASO_MS);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1000;
}

const RUTAS_SIEMPRE_ATENDIDAS = ['/health', '/api/time', '/metrics'];

/**
 * Marca puesta en las peticiones que SÍ ocuparon un hueco.
 *
 * Hace falta: una petición rechazada también pasa por `onResponse`, y sin esta
 * marca devolvería un hueco que nunca tomó. El contador se iría vaciando solo y
 * el tope dejaría de servir justo cuando más se necesita.
 */
const OCUPA_HUECO = Symbol('ocupa-hueco');

async function topePlugin(server: FastifyInstance) {
    const tope = topeDeCola();
    const retrasoMaximo = topeDeRetraso();

    let aMedioAtender = 0;
    let rechazadas = 0;
    let avisado = false;

    // El histograma mide cuánto tarda Node en atenderse a sí mismo.
    const reloj = monitorEventLoopDelay({ resolution: 20 });
    reloj.enable();

    /** Retraso reciente en milisegundos (el histograma trabaja en nanosegundos). */
    const retrasoActual = () => reloj.mean / 1e6;

    // Se olvida lo viejo cada tanto: interesa cómo va ahora, no el promedio del día.
    const olvidar = setInterval(() => reloj.reset(), 10000);
    olvidar.unref();

    server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const ruta = request.url.split('?')[0];
        if (RUTAS_SIEMPRE_ATENDIDAS.some((r) => ruta === r || ruta.startsWith(`${r}/`))) return;

        const colaLarga = aMedioAtender >= tope;
        const vaRetrasado = retrasoActual() > retrasoMaximo;

        if (colaLarga || vaRetrasado) {
            rechazadas++;

            if (!avisado) {
                avisado = true;
                logger.warn('El servidor está rechazando peticiones para no caerse', {
                    aMedioAtender,
                    tope,
                    retrasoMs: Math.round(retrasoActual()),
                    motivo: colaLarga ? 'cola larga' : 'bucle de eventos retrasado',
                });
            }

            return reply
                .status(503)
                .header('Retry-After', '3')
                .send({
                    error: 'El sistema está muy ocupado en este momento',
                    message: 'Intentá de nuevo en unos segundos. No se perdió nada.',
                    code: 'SERVIDOR_OCUPADO',
                });
        }

        aMedioAtender++;
        (request as any)[OCUPA_HUECO] = true;
    });

    const soltar = (request: FastifyRequest) => {
        if (!(request as any)[OCUPA_HUECO]) return;
        (request as any)[OCUPA_HUECO] = false;

        if (aMedioAtender > 0) aMedioAtender--;
        if (aMedioAtender === 0 && avisado) {
            logger.info('El servidor volvió a aceptar todo con normalidad', { rechazadasEnTotal: rechazadas });
            avisado = false;
        }
    };

    // Tanto si la petición termina bien como si se cae, el hueco se libera. Si
    // solo se contara en `onResponse`, un error dejaría el contador subido para
    // siempre y el servidor acabaría rechazándolo todo sin motivo.
    server.addHook('onResponse', async (request: FastifyRequest) => soltar(request));
    server.addHook('onTimeout', async (request: FastifyRequest) => soltar(request));

    server.addHook('onClose', async () => {
        clearInterval(olvidar);
        reloj.disable();
    });

    logger.info('Tope de carga activo', { tope, retrasoMaximoMs: retrasoMaximo });
}

export default fp(topePlugin, { name: 'tope-de-carga' });
