import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { medidor, moldeDeLaRuta } from '../utils/medidor-de-rutas';
import { agrupador } from '../utils/errores-agrupados';
import { CABECERA_INTERNA, MARCA_INTERNA } from '../services/precarga.service';
import { empezarAVolcar, pararDeVolcar } from '../services/salud-de-rutas.service';

/**
 * CADA PETICIÓN, MEDIDA (salud, 18-oct-2026). Ver `utils/medidor-de-rutas.ts`.
 *
 * Las lecturas internas (las que el servidor se hace a sí mismo para armar la
 * descarga de alguien, `CABECERA_INTERNA`) no cuentan: no las espera nadie
 * delante de una pantalla y llenarían el panel con miles de filas.
 *
 * Un 500 se agrupa por huella (`utils/errores-agrupados.ts`), con el error de
 * verdad (su pila) si pasó por el manejador central, o con lo que respondió el
 * controlador si lo mandó él.
 */

const CODIGO = Symbol('codigo-de-error');
const ERROR_REAL = Symbol('error-real');

const esInterna = (r: FastifyRequest) => r.headers[CABECERA_INTERNA] === MARCA_INTERNA;

const liceoDe = (r: FastifyRequest): string | null => (r as any).user?.instituteId ?? (r as any).institute?.id ?? null;

/**
 * Lo llama el manejador central con el error de verdad. Solo se guarda: si la
 * respuesta acaba en 4xx (un P2002 que pasa a 409) no es un fallo del sistema
 * y no se agrupa.
 */
export function apuntarErrorDelServidor(request: FastifyRequest, error: { name?: string; message?: string; stack?: string }): void {
    (request as any)[ERROR_REAL] = error;
}

async function medidorPlugin(server: FastifyInstance) {
    // El código propio de un error (`CLASE_CON_TRABAJO`, `TENANT_MISMATCH`…)
    // sale del cuerpo de la respuesta: solo se mira si es un error y es corto.
    server.addHook('onSend', async (request, reply, payload) => {
        if (reply.statusCode >= 400 && typeof payload === 'string' && payload.length < 4000) {
            const m = /"code"\s*:\s*"([A-Z0-9_]{2,60})"/.exec(payload);
            (request as any)[CODIGO] = m ? m[1] : null;
            if (reply.statusCode >= 500 && !esInterna(request)) {
                const real = (request as any)[ERROR_REAL] as { name?: string; message?: string; stack?: string } | undefined;
                const msg = real?.message || (/"(?:error|message)"\s*:\s*"([^"]{1,300})"/.exec(payload)?.[1] ?? `Respuesta ${reply.statusCode}`);
                agrupador.apuntar({
                    origen: 'servidor',
                    tipo: real?.name || `Respuesta${reply.statusCode}`,
                    mensaje: msg,
                    pila: real?.stack ?? null,
                    ruta: `${request.method} ${moldeDeLaRuta(request.routeOptions?.url, request.url)}`,
                    liceo: liceoDe(request),
                    version: process.env.npm_package_version ?? null,
                });
            }
        }
        return payload;
    });

    server.addHook('onResponse', async (request, reply) => {
        if (esInterna(request) || request.method === 'OPTIONS') return;
        const user = (request as any).user;
        medidor.apuntar({
            metodo: request.method,
            ruta: moldeDeLaRuta(request.routeOptions?.url, request.url),
            rol: user?.role ?? (request.url.startsWith('/api/superadmin') ? 'SUPERADMIN' : null),
            liceo: liceoDe(request),
            ms: reply.elapsedTime,
            estado: reply.statusCode,
            codigo: (request as any)[CODIGO] ?? null,
            persona: user?.userId ?? user?.id ?? null,
        });
    });

    empezarAVolcar();
    server.addHook('onClose', async () => {
        await pararDeVolcar();
    });
}

export default fp(medidorPlugin, { name: 'medidor-de-rutas' });
