import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../utils/logger';

/**
 * LO HECHO SIN CONEXIÓN, QUE LLEGA TARDE (2026-09-30)
 *
 * Cristian lo pidió como WhatsApp: el profesor pone notas y pasa lista sin
 * señal, y se envía solo al volver. Cada cambio sale del teléfono con su
 * número (`X-Cambio`) y la hora en que se hizo (`X-Hecho-En`).
 *
 * **El mismo cambio no se aplica dos veces.** El teléfono puede enviarlo, no
 * enterarse de la respuesta (se fue la señal justo entonces) y volver a
 * enviarlo mañana. El freno del doble clic (`anti-doble-envio.ts`) no sirve
 * para eso: recuerda diez segundos. Aquí se apunta cada número en
 * `cambios_recibidos` ANTES de hacer nada, y a la segunda vez se devuelve la
 * respuesta de la primera, con `x-cambio: repetido`.
 *
 * **No se le da más poder a nadie.** Un cambio que llega tarde pasa por las
 * mismas rutas, los mismos guardias y las mismas reglas que uno en el acto:
 * si el profesor ya no da esa clase, se le dice que no, igual que en línea.
 *
 * Lo que queda por decidir no se da por terminado: un 409 (cambió mientras
 * tanto: hay que elegir), un 401 (hay que volver a entrar) o un fallo del
 * servidor se apuntan como «se puede reintentar» (-1), para que el mismo
 * cambio, ya con la decisión, pueda volver a entrar.
 */

const ID_VALIDO = /^[A-Za-z0-9_-]{8,64}$/;
/** Lo que se guarda de la respuesta, para devolverla igual la segunda vez. */
const RESPUESTA_MAXIMA = 16 * 1024;
/** Una hora del teléfono más adelantada que esto no se cree. */
const MARGEN_DEL_RELOJ_MS = 5 * 60 * 1000;

type ConCambio = FastifyRequest & { cambioSinConexion?: { id: string } };

const EN_CURSO = 0;
const REINTENTABLE = -1;

/** ¿Esta respuesta cierra el cambio, o se podrá volver a intentar? */
export function cierraElCambio(estado: number): boolean {
    if (estado >= 500) return false;
    return ![401, 409, 429].includes(estado);
}

function laHoraDelTelefono(valor: unknown): Date | null {
    if (typeof valor !== 'string') return null;
    const t = Date.parse(valor);
    if (Number.isNaN(t) || t > Date.now() + MARGEN_DEL_RELOJ_MS) return null;
    return new Date(t);
}

async function cambiosSinConexionPlugin(server: FastifyInstance) {
    server.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
        const id = request.headers['x-cambio'];
        if (id === undefined || request.method === 'GET' || request.method === 'HEAD') return;
        if (typeof id !== 'string' || !ID_VALIDO.test(id)) {
            return reply.status(400).send({ error: 'El número del cambio no es válido', code: 'CAMBIO_INVALIDO' });
        }
        const prisma = (request as any).tenantPrisma;
        const usuarioId = request.user?.id;
        // Sin sesión o sin liceo, lo dirán los guardias de la ruta.
        if (!prisma || !usuarioId) return;

        const ruta = request.url.split('?')[0].slice(0, 300);
        const hechoEn = laHoraDelTelefono(request.headers['x-hecho-en']);
        const apuntado: number = await prisma.$executeRaw`
            INSERT INTO cambios_recibidos (id, "usuarioId", metodo, ruta, estado, "hechoEn")
            VALUES (${id}, ${usuarioId}, ${request.method}, ${ruta}, ${EN_CURSO}, ${hechoEn})
            ON CONFLICT (id) DO NOTHING`;

        if (apuntado === 0) {
            const previo = await prisma.cambioRecibido.findUnique({ where: { id } });
            // El número de otro no se contesta: ni se dice que existe.
            if (!previo || previo.usuarioId !== usuarioId) {
                return reply.status(409).send({ error: 'Ese número de cambio no vale', code: 'CAMBIO_AJENO' });
            }
            if (previo.estado === REINTENTABLE) {
                const retomado: number = await prisma.$executeRaw`
                    UPDATE cambios_recibidos SET estado = ${EN_CURSO}, "recibidoEn" = NOW()
                     WHERE id = ${id} AND estado = ${REINTENTABLE}`;
                if (retomado === 0) {
                    return reply.status(409).send({ error: 'Ese cambio se está aplicando ahora mismo', code: 'CAMBIO_EN_CURSO' });
                }
            } else if (previo.estado === EN_CURSO) {
                return reply.status(409).send({ error: 'Ese cambio se está aplicando ahora mismo', code: 'CAMBIO_EN_CURSO' });
            } else {
                reply.header('x-cambio', 'repetido');
                return reply.status(previo.estado).send(previo.respuesta ?? { success: true });
            }
        }
        (request as ConCambio).cambioSinConexion = { id };
    });

    server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
        const cambio = (request as ConCambio).cambioSinConexion;
        if (!cambio) return payload;
        const prisma = (request as any).tenantPrisma;
        const estado = reply.statusCode;
        try {
            if (!cierraElCambio(estado)) {
                await prisma.$executeRaw`UPDATE cambios_recibidos SET estado = ${REINTENTABLE} WHERE id = ${cambio.id}`;
            } else {
                let respuesta: unknown = null;
                if (typeof payload === 'string' && payload.length <= RESPUESTA_MAXIMA) {
                    try {
                        respuesta = JSON.parse(payload);
                    } catch {
                        respuesta = null;
                    }
                }
                await prisma.cambioRecibido.update({ where: { id: cambio.id }, data: { estado, respuesta: respuesta ?? undefined } });
            }
        } catch (e) {
            // Si no se pudo apuntar, lo peor es que el mismo cambio se intente
            // otra vez: las reglas de la ruta siguen valiendo. No se tumba la respuesta.
            logger.warn('No se pudo apuntar el cambio sin conexión', { id: cambio.id, error: e instanceof Error ? e.message : String(e) });
        }
        return payload;
    });
}

export const cambiosSinConexion = fp(cambiosSinConexionPlugin, { name: 'cambios-sin-conexion' });
export default cambiosSinConexion;
