import { createHash, randomUUID } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type Redis from 'ioredis';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * DOS CLICS A LA VEZ CUENTAN COMO UNO
 *
 * Pasa todos los días: el profesor pulsa "guardar", no ve reacción porque la
 * red va lenta, y vuelve a pulsar antes de que la primera termine. O el
 * navegador reintenta solo. Llegan dos peticiones idénticas pisándose y el
 * sistema hace el trabajo dos veces: dos observaciones iguales, dos de lo que
 * sea. O peor: las dos crean la misma fila, chocan contra la base y la persona
 * ve "Error en el servidor" sin saber si se guardó.
 *
 * La regla es la más estrecha que resuelve eso, a propósito: si una petición
 * idéntica del mismo usuario **todavía se está procesando**, la segunda no
 * ejecuta nada — espera y devuelve la misma respuesta. Dos peticiones que se
 * solapan son un clic torpe, no dos intenciones.
 *
 * Lo que NO hace, y es deliberado: si la primera ya terminó, la segunda se
 * atiende como lo que es, una segunda acción. Así quien intenta crear a
 * propósito algo que ya existe sigue recibiendo su "ya existe" en vez de un
 * "listo" que no creó nada. Esconder esa respuesta sería un botón mintiendo.
 *
 * Debajo sigue estando la red de seguridad de siempre: las reglas de unicidad
 * de la base (una nota por actividad y alumno, una asistencia por alumno y día,
 * una clase por sección, materia y día).
 *
 * ENTRE PROCESOS. Con varios procesos detrás del repartidor, los dos clics
 * pueden caer en procesos distintos, y la marca en memoria de uno no la ve el
 * otro. Por eso la marca también se pone en Redis (`SET NX`): el proceso que
 * llega segundo no ejecuta nada, espera a que el primero deje su respuesta en
 * Redis y devuelve esa. Si Redis no contesta, queda lo de siempre: el freno
 * dentro de cada proceso, y debajo las reglas de unicidad de la base.
 */

const RUTAS_EXCLUIDAS = [
    '/api/auth', // repetir un intento de login tiene que contar como intento
    '/api/superadmin/auth',
    '/api/monitoring',
];

interface RespuestaGuardada {
    status: number;
    payload: unknown;
    contentType?: string;
}

interface MarcaDeEnvio {
    huella: string;
    terminar: (respuesta: RespuestaGuardada) => void;
    /** Si este proceso puso la marca en Redis, con qué ficha (para quitar solo la suya). */
    fichaEnRedis?: string;
}

/** Peticiones que se están procesando ahora mismo. */
const enCurso = new Map<string, Promise<RespuestaGuardada>>();

const MARCA = 'gestion-escolar:envio:';
const RESPUESTA = 'gestion-escolar:envio-respuesta:';
// Más que lo que puede durar una petición que escribe (20 s de transacción).
const DURA_LA_MARCA_MS = 30_000;
// Lo justo para que el que espera la recoja.
const DURA_LA_RESPUESTA_MS = 10_000;
const CADA_CUANTO_MIRAR_MS = 50;
// Una respuesta más grande no se copia a Redis: el segundo clic se atiende
// como una petición normal (la base sigue frenando los duplicados).
const RESPUESTA_MAXIMA = 256 * 1024;

// Quita la marca solo si sigue siendo la de esta petición: si caducó y otra
// petición puso la suya, esa no se toca.
const QUITAR_SI_ES_MIA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
  return 0
`;

type ClienteRedis = Pick<Redis, 'status' | 'set' | 'get' | 'eval'>;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Otro proceso tiene la marca: se espera a su respuesta. Devuelve null si la
 * marca desaparece sin respuesta (la primera se cortó, o era demasiado grande
 * para copiarla), si pasa el tiempo o si Redis deja de contestar: entonces
 * esta petición se atiende como una normal.
 */
async function laRespuestaDelOtro(cliente: ClienteRedis, huella: string): Promise<RespuestaGuardada | null> {
    const hasta = Date.now() + DURA_LA_MARCA_MS;
    try {
        while (Date.now() < hasta) {
            const guardada = await cliente.get(RESPUESTA + huella);
            if (guardada) return JSON.parse(guardada) as RespuestaGuardada;
            if (!(await cliente.get(MARCA + huella))) {
                // Pudo dejar la respuesta justo entre las dos lecturas.
                const ultima = await cliente.get(RESPUESTA + huella);
                return ultima ? (JSON.parse(ultima) as RespuestaGuardada) : null;
            }
            await esperar(CADA_CUANTO_MIRAR_MS);
        }
    } catch {
        return null;
    }
    return null;
}

function quitarMarca(cliente: ClienteRedis, huella: string, ficha: string) {
    try {
        Promise.resolve(cliente.eval(QUITAR_SI_ES_MIA, 1, MARCA + huella, ficha)).catch(() => undefined);
    } catch {
        /* Redis no está: la marca caduca sola. */
    }
}

function esRepetible(request: FastifyRequest): boolean {
    if (request.method !== 'POST' && request.method !== 'DELETE') return false;

    const url = request.url.split('?')[0];
    if (RUTAS_EXCLUIDAS.some((ruta) => url.startsWith(ruta))) return false;

    // Las subidas de archivos no se comparan por cuerpo
    const tipo = String(request.headers['content-type'] ?? '');
    if (tipo.includes('multipart/form-data')) return false;

    return true;
}

/**
 * Quién envía + a qué liceo + qué envía + a dónde. No se guarda nada legible.
 * El liceo va aparte porque quien llega sin credencial se reconoce solo por su
 * dirección, y la misma dirección puede estar hablando con dos liceos.
 */
function huellaDe(request: FastifyRequest): string {
    const quien = String(request.headers.authorization ?? request.ip ?? '');
    const liceo = String(request.headers['x-institute-slug'] ?? request.headers['x-institute-id'] ?? request.hostname ?? '');
    const cuerpo = request.body === undefined ? '' : JSON.stringify(request.body);
    return createHash('sha256')
        .update(`${quien}|${liceo}|${request.method}|${request.url}|${cuerpo}`)
        .digest('hex');
}

type ConMarca = FastifyRequest & { marcaDeEnvio?: MarcaDeEnvio };

function responderCon(reply: FastifyReply, resultado: RespuestaGuardada) {
    if (resultado.contentType) reply.header('content-type', resultado.contentType);
    reply.header('x-doble-envio', 'ignorado');
    return reply.status(resultado.status).send(resultado.payload);
}

async function antiDobleEnvioPlugin(server: FastifyInstance, opciones: { cliente?: ClienteRedis }) {
    const cliente: ClienteRedis = opciones.cliente ?? redis;

    server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!esRepetible(request)) return;

        const huella = huellaDe(request);

        const enVuelo = enCurso.get(huella);
        if (enVuelo) {
            logger.debug('Doble envío: se devuelve la respuesta del primero', { url: request.url });
            return responderCon(reply, await enVuelo);
        }

        let terminar: (respuesta: RespuestaGuardada) => void = () => undefined;
        enCurso.set(
            huella,
            new Promise<RespuestaGuardada>((resolve) => {
                terminar = resolve;
            })
        );
        const marca: MarcaDeEnvio = { huella, terminar };
        (request as ConMarca).marcaDeEnvio = marca;

        // La marca de todos los procesos. Si Redis no contesta, se sigue: el
        // freno de este proceso ya está puesto.
        if (cliente.status !== 'ready') return;
        const ficha = randomUUID();
        let puesta: unknown = null;
        try {
            puesta = await cliente.set(MARCA + huella, ficha, 'PX', DURA_LA_MARCA_MS, 'NX');
        } catch {
            return;
        }
        if (puesta === 'OK') {
            marca.fichaEnRedis = ficha;
            return;
        }

        // Otro proceso está con esta misma petición.
        const delOtro = await laRespuestaDelOtro(cliente, huella);
        if (!delOtro) return; // terminó sin dejar respuesta: esta se atiende normal

        logger.debug('Doble envío en otro proceso: se devuelve su respuesta', { url: request.url });
        (request as ConMarca).marcaDeEnvio = undefined;
        marca.terminar(delOtro);
        enCurso.delete(huella);
        return responderCon(reply, delOtro);
    });

    server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
        const marca = (request as ConMarca).marcaDeEnvio;
        if (!marca) return payload;

        const respuesta: RespuestaGuardada = {
            status: reply.statusCode,
            payload,
            contentType: String(reply.getHeader('content-type') ?? ''),
        };
        marca.terminar(respuesta);
        enCurso.delete(marca.huella);

        if (marca.fichaEnRedis) {
            // Primero la respuesta, luego quitar la marca: quien espera mira en
            // ese orden. Van por la misma conexión, así que llegan en orden, y no
            // se espera a Redis para contestar.
            if (typeof payload === 'string' && payload.length <= RESPUESTA_MAXIMA) {
                try {
                    Promise.resolve(
                        cliente.set(RESPUESTA + marca.huella, JSON.stringify(respuesta), 'PX', DURA_LA_RESPUESTA_MS)
                    ).catch(() => undefined);
                } catch {
                    /* sin Redis: el que espera se atiende como una petición normal */
                }
            }
            quitarMarca(cliente, marca.huella, marca.fichaEnRedis);
            marca.fichaEnRedis = undefined;
        }
        return payload;
    });

    // Red de seguridad: si la petición se corta sin pasar por onSend, se suelta
    // la marca para que nadie se quede esperando una respuesta que no llega.
    server.addHook('onResponse', async (request: FastifyRequest) => {
        const marca = (request as ConMarca).marcaDeEnvio;
        if (!marca) return;
        if (enCurso.has(marca.huella)) {
            marca.terminar({ status: 500, payload: null });
            enCurso.delete(marca.huella);
        }
        if (marca.fichaEnRedis) {
            quitarMarca(cliente, marca.huella, marca.fichaEnRedis);
            marca.fichaEnRedis = undefined;
        }
    });
}

/** Para las pruebas: dejar la memoria limpia entre casos. */
export function olvidarEnviosEnCurso() {
    enCurso.clear();
}

export default fp(antiDobleEnvioPlugin, { name: 'anti-doble-envio' });
