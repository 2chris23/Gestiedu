import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';
import { AQuienAfecta, resolverDestinatarios } from '../services/a-quien-afecta.service';

/**
 * EL ESCÁNER DE LA PUERTA
 *
 * Por aquí pasa **toda** escritura que sale bien. Se hace una sola cosa, en un
 * solo sitio: avisar a quien le toca que lo suyo cambió, y tirar la copia
 * guardada de esos datos para que al pedirlos otra vez no le devuelvan lo viejo.
 *
 * Se hace aquí y no en cada controlador a propósito: son más de cien sitios
 * donde se escribe, y uno que se olvide es una pantalla que se queda vieja.
 *
 * ─── A QUIÉN SE AVISA ────────────────────────────────────────────────────────
 *
 * Antes se avisaba al liceo entero y se tiraba su caché completa. Cuando un
 * profesor le ponía una nota a Sofía, Luis —que no tiene nada que ver— también
 * perdía sus datos guardados y tenía que volver a pedirlos. Con 5.000 personas
 * conectadas, cada nota provocaba una estampida. Medido: los aciertos de caché
 * caían del 96,9% al 10% en cuanto había escritura.
 *
 * Ahora el controlador que sabe a quién afecta el cambio lo dice
 * (`request.aQuienAfecta`), y solo se toca a esa gente:
 *
 *   - **el alumno** y **sus representantes** reciben lo suyo;
 *   - **los profesores de la sección y los admins** reciben además el aviso de
 *     los medidores, que son los únicos que los ven.
 *
 * Si un controlador no dice nada, se avisa al liceo entero como antes. Eso
 * cuesta más, pero nunca deja una pantalla con datos viejos — que es lo que no
 * se puede permitir.
 */

/**
 * EL BUZÓN PERSONAL DE ALGUIEN, CON SU LICEO DELANTE
 *
 * **El identificador de una persona es su cédula, y la cédula se repite entre
 * liceos**: es un número del Estado, no del sistema. El buzón se llamaba solo
 * `user:<cédula>`, así que el aviso dirigido a alguien del Liceo A **también le
 * sonaba a quien tuviera esa cédula en el Liceo B**: su pantalla salía a
 * recargar sin motivo, y se enteraba de que en algún sitio acababan de tocar las
 * notas. Datos del otro liceo no se le iban —el aviso solo lleva el tipo de cosa
 * que cambió y la hora—, pero era un hilo que cruzaba de un liceo a otro.
 *
 * Con el liceo delante son dos buzones distintos. Quien se apunta tiene que usar
 * este mismo nombre: ver `plugins/socket.ts`.
 */
const buzonDe = (instituteId: string, userId: string) => `user:${instituteId}:${userId}`;

declare module 'fastify' {
    interface FastifyRequest {
        /** Lo rellena el controlador que sabe a quién afecta lo que acaba de escribir. */
        aQuienAfecta?: AQuienAfecta;
    }
}

/** De la dirección de la petición sale el nombre de lo que cambió. */
function recursoDeLaUrl(url: string): string | null {
    const limpia = url.split('?')[0];
    const partes = limpia.split('/').filter(Boolean);

    const i = partes.indexOf('api');
    if (i === -1 || !partes[i + 1]) return null;

    const recurso = partes[i + 1];
    if (recurso === 'superadmin' || recurso === 'auth' || recurso === 'time') return null;

    return recurso;
}

const METODOS_QUE_ESCRIBEN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AvisoDeCambio {
    recurso: string;
    accion: 'creado' | 'actualizado' | 'borrado';
    momento: number;
}

function accionDelMetodo(metodo: string): AvisoDeCambio['accion'] {
    if (metodo === 'POST') return 'creado';
    if (metodo === 'DELETE') return 'borrado';
    return 'actualizado';
}

async function avisarCambiosPlugin(server: FastifyInstance) {
    /**
     * LO PRIMERO: LIMPIAR LA COPIA DE QUIEN ACABA DE ESCRIBIR
     *
     * Esto va en `onSend` —justo ANTES de que salga la respuesta— y no con todo
     * lo demás, que va después.
     *
     * El motivo es una carrera pequeña pero real: quien guarda algo suele volver
     * a pedir los datos de inmediato. Si su copia guardada se limpiara *después*
     * de responderle, esa segunda petición podría llegar antes y devolverle lo
     * de antes de guardar. Vería su propio cambio desaparecido.
     *
     * Limpiando lo suyo antes de responder, eso no puede pasar: cuando recibe el
     * "guardado", su copia ya no existe. Lo de los demás sigue yendo después,
     * que no corre prisa.
     */
    server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
        if (!METODOS_QUE_ESCRIBEN.has(request.method)) return payload;
        if (reply.statusCode >= 400) return payload;

        const instituteId = (request as any).institute?.id ?? (request.user as any)?.instituteId;
        const quien = (request.user as any)?.userId ?? (request.user as any)?.id;
        if (!instituteId || !quien) return payload;

        await conLiceo(instituteId, () =>
            RedisCache.clearPattern(`cache:${instituteId}:*:${quien}:*`)
        ).catch(() => undefined);
        return payload;
    });

    server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!METODOS_QUE_ESCRIBEN.has(request.method)) return;
        if (reply.statusCode >= 400) return;

        // Un doble clic ya se respondió con la respuesta del primero: no es un
        // cambio nuevo y no hay que avisar dos veces.
        if (reply.getHeader('x-doble-envio')) return;

        const recurso = recursoDeLaUrl(request.url);
        if (!recurso) return;

        const instituteId = (request as any).institute?.id ?? (request.user as any)?.instituteId;
        if (!instituteId) return;

        const io = (server as unknown as { io?: Server }).io;
        const aviso: AvisoDeCambio = {
            recurso,
            accion: accionDelMetodo(request.method),
            momento: Date.now(),
        };

        let destinatarios = null;
        try {
            destinatarios = await conLiceo(instituteId, () =>
                resolverDestinatarios(request.tenantPrisma, request.aQuienAfecta)
            );
        } catch (error) {
            // Si no se puede acotar, se avisa a todos: caro, pero nunca deja a
            // nadie mirando un dato viejo.
            logger.debug('No se pudo acotar a quién afecta el cambio', {
                recurso,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        try {
            if (destinatarios) {
                const todos = [...new Set([...destinatarios.personas, ...destinatarios.personal])];

                // Solo se tira lo guardado de esta gente. Lo de los demás sigue
                // sirviendo: sus datos no cambiaron.
                //
                // Va en una sola llamada a propósito: borrar de uno en uno
                // recorría las claves guardadas una vez por cada persona
                // avisada, y una nota afecta a diez o quince. Ahora se recorre
                // una vez para todas.
                await conLiceo(instituteId, () =>
                    RedisCache.clearPatterns(todos.map((id) => `cache:${instituteId}:*:${id}:*`))
                ).catch(() => undefined);

                if (io) {
                    for (const id of destinatarios.personas) {
                        io.to(buzonDe(instituteId, id)).emit('datos:cambiaron', aviso);
                    }
                    // Los medidores del salón solo los ve el personal.
                    for (const id of destinatarios.personal) {
                        io.to(buzonDe(instituteId, id)).emit('datos:cambiaron', { ...aviso, medidores: true });
                    }
                }
            } else {
                await conLiceo(instituteId, () =>
                    RedisCache.clearPattern(`cache:${instituteId}:*`)
                ).catch(() => undefined);
                io?.to(`institute:${instituteId}`).emit('datos:cambiaron', aviso);
            }
        } catch (error) {
            // Que falle el aviso es una molestia, no un fallo: la pantalla se
            // actualizará la próxima vez que pida datos.
            logger.debug('No se pudo avisar del cambio', {
                recurso,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}

export default fp(avisarCambiosPlugin, { name: 'avisar-cambios', dependencies: [] });
