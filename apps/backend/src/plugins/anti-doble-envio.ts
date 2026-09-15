import { createHash } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
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
 * Límite conocido: la marca vive en la memoria de este proceso. Con varias
 * instancias detrás de un balanceador, los dos clics tienen que caer en la
 * misma para que esto actúe. Cuando haya más de una instancia, esto se mueve a
 * Redis.
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
}

/** Peticiones que se están procesando ahora mismo. */
const enCurso = new Map<string, Promise<RespuestaGuardada>>();

function esRepetible(request: FastifyRequest): boolean {
    if (request.method !== 'POST' && request.method !== 'DELETE') return false;

    const url = request.url.split('?')[0];
    if (RUTAS_EXCLUIDAS.some((ruta) => url.startsWith(ruta))) return false;

    // Las subidas de archivos no se comparan por cuerpo
    const tipo = String(request.headers['content-type'] ?? '');
    if (tipo.includes('multipart/form-data')) return false;

    return true;
}

/** Quién envía + qué envía + a dónde. No se guarda nada legible. */
function huellaDe(request: FastifyRequest): string {
    const quien = String(request.headers.authorization ?? request.ip ?? '');
    const cuerpo = request.body === undefined ? '' : JSON.stringify(request.body);
    return createHash('sha256')
        .update(`${quien}|${request.method}|${request.url}|${cuerpo}`)
        .digest('hex');
}

async function antiDobleEnvioPlugin(server: FastifyInstance) {
    server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!esRepetible(request)) return;

        const huella = huellaDe(request);

        const enVuelo = enCurso.get(huella);
        if (enVuelo) {
            logger.debug('Doble envío: se devuelve la respuesta del primero', { url: request.url });
            const resultado = await enVuelo;
            if (resultado.contentType) reply.header('content-type', resultado.contentType);
            reply.header('x-doble-envio', 'ignorado');
            return reply.status(resultado.status).send(resultado.payload);
        }

        let terminar: (respuesta: RespuestaGuardada) => void = () => undefined;
        enCurso.set(
            huella,
            new Promise<RespuestaGuardada>((resolve) => {
                terminar = resolve;
            })
        );
        (request as FastifyRequest & { marcaDeEnvio?: MarcaDeEnvio }).marcaDeEnvio = { huella, terminar };
    });

    server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
        const marca = (request as FastifyRequest & { marcaDeEnvio?: MarcaDeEnvio }).marcaDeEnvio;
        if (!marca) return payload;

        marca.terminar({
            status: reply.statusCode,
            payload,
            contentType: String(reply.getHeader('content-type') ?? ''),
        });
        enCurso.delete(marca.huella);
        return payload;
    });

    // Red de seguridad: si la petición se corta sin pasar por onSend, se suelta
    // la marca para que nadie se quede esperando una respuesta que no llega.
    server.addHook('onResponse', async (request: FastifyRequest) => {
        const marca = (request as FastifyRequest & { marcaDeEnvio?: MarcaDeEnvio }).marcaDeEnvio;
        if (!marca) return;
        if (enCurso.has(marca.huella)) {
            marca.terminar({ status: 500, payload: null });
            enCurso.delete(marca.huella);
        }
    });
}

/** Para las pruebas: dejar la memoria limpia entre casos. */
export function olvidarEnviosEnCurso() {
    enCurso.clear();
}

export default fp(antiDobleEnvioPlugin, { name: 'anti-doble-envio' });
