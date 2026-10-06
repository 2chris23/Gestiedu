import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import {
    CABECERA_INTERNA,
    LECTURAS_POR_BLOQUE,
    MARCA_INTERNA,
    apuntarLoQuePesa,
    elPlanDeLasPantallas,
    esUnaLecturaValida,
    laUltimaMarca,
    lasPantallasDe,
    loQueCambioDesde,
    loQuePesaraCadaBloque,
    rellenar,
} from '../services/precarga.service';
import { lasSeccionesDelProfesor, precalentarLosPromedios } from '../services/precalentar-promedios.service';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * LA PRECARGA EN UN PAQUETE (ver `services/precarga.service.ts`)
 *
 *   POST /api/precarga/plan    { menu }       qué hay que bajar (páginas y lecturas)
 *   POST /api/precarga/bloque  { lecturas }   esas lecturas, hechas como esa persona
 *   POST /api/precarga/cambios { desde, menu } lo que cambió desde el cambio N (solo eso se vuelve a bajar)
 *
 * El bloque no se fía del teléfono para nada: cada lectura se hace con la
 * credencial de quien pide, por la misma puerta que si la pidiera a mano.
 */

/** El liceo de quien pide (para lo aprendido de cuánto pesa cada lectura). */
function suLiceo(request: FastifyRequest): string {
    return String((request as any).institute?.id ?? (request.user as any)?.instituteId ?? '');
}

function yo(request: FastifyRequest): { id: string; role: string } {
    const u = request.user as any;
    return { id: u?.userId ?? u?.id, role: u?.role };
}

/** Las cabeceras que dicen quién es (y de qué liceo): las mismas de su petición. */
function lasDeQuienPide(request: FastifyRequest): Record<string, string> {
    const salida: Record<string, string> = { [CABECERA_INTERNA]: MARCA_INTERNA, accept: 'application/json' };
    for (const k of ['authorization', 'cookie', 'x-institute-slug', 'x-institute-id', 'user-agent']) {
        const v = request.headers[k];
        if (typeof v === 'string') salida[k] = v;
    }
    return salida;
}

const A_LA_VEZ = 6;

export async function precargaRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/precarga/plan',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        menu: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 120 } },
                        conContexto: { type: 'boolean' },
                    },
                },
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const cuerpo = (request.body ?? {}) as { menu?: string[]; conContexto?: boolean };
            const quien = yo(request);
            // La marca ANTES de mirar nada: lo que cambie mientras se baja, se
            // vuelve a bajar después (`/precarga/cambios`), nunca se pierde.
            const marca = await laUltimaMarca(request.tenantPrisma);
            // Los promedios del año, en bloque y antes de nada: las lecturas que
            // los calculaban alumno por alumno los encuentran hechos (mitad de la
            // descarga del admin). Si falla, cada lectura los calcula como siempre.
            if (quien.role === 'ADMIN' || quien.role === 'TEACHER') {
                const alcance = quien.role === 'TEACHER' ? { secciones: await lasSeccionesDelProfesor(request.tenantPrisma, quien.id) } : {};
                await precalentarLosPromedios(request.tenantPrisma, suLiceo(request), alcance).catch(avisarSiFalla('precalentar-promedios'));
            }
            const pantallas = await lasPantallasDe(request.tenantPrisma, quien, cuerpo.menu);
            const plan = elPlanDeLasPantallas(pantallas, quien.role);
            // Cuánto pesará cada bloque, con lo aprendido de las descargas de este
            // liceo: el «X de Y MB» del teléfono no baila (null si aún no se sabe).
            const estimado = loQuePesaraCadaBloque(suLiceo(request), plan.lecturas, LECTURAS_POR_BLOQUE);
            return reply.send({
                ...plan,
                marca,
                porBloque: LECTURAS_POR_BLOQUE,
                estimadoPorBloque: estimado?.porBloque ?? null,
                conocidas: estimado?.conocidas ?? 0,
                // La grabación de las lecturas (pruebas) necesita saber qué es cada trozo.
                ...(cuerpo.conContexto
                    ? { pantallas: pantallas.map((p) => ({ molde: p.molde, variante: p.variante ?? null, ctx: p.ctx, url: rellenar(p.molde, p.ctx) })).filter((p) => p.url) }
                    : {}),
            });
        }
    );

    fastify.post(
        '/precarga/cambios',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['desde'],
                    additionalProperties: false,
                    properties: {
                        desde: { type: 'integer', minimum: 0 },
                        menu: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 120 } },
                    },
                },
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const { desde, menu } = request.body as { desde: number; menu?: string[] };
            const r = await loQueCambioDesde(request.tenantPrisma, yo(request), menu, desde);
            return reply.send({ ...r, porBloque: LECTURAS_POR_BLOQUE });
        }
    );

    fastify.post(
        '/precarga/bloque',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['lecturas'],
                    additionalProperties: false,
                    properties: { lecturas: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 600 } } },
                },
            },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const lecturas = ((request.body as { lecturas: string[] }).lecturas ?? []).filter(esUnaLecturaValida);
            const cabeceras = lasDeQuienPide(request);
            const liceo = suLiceo(request);
            const datos: Record<string, unknown> = {};
            const fallos: Record<string, number> = {};

            let i = 0;
            const trabajador = async () => {
                while (i < lecturas.length) {
                    const clave = lecturas[i++];
                    try {
                        const r = await fastify.inject({ method: 'GET', url: `/api${clave}`, headers: cabeceras });
                        if (r.statusCode === 200 && String(r.headers['content-type'] ?? '').includes('json')) {
                            datos[clave] = r.json();
                            apuntarLoQuePesa(liceo, clave, r.payload.length);
                        }
                        else fallos[clave] = r.statusCode;
                    } catch {
                        fallos[clave] = 500;
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, lecturas.length) }, trabajador));

            // Si la base no contesta, el bloque entero es «ahora no»: el
            // teléfono espera y lo vuelve a pedir, no lo da por hecho.
            const ahoraNo = Object.values(fallos).filter((c) => c === 503 || c === 429).length;
            const deServidor = Object.values(fallos).filter((c) => c >= 500).length;
            if (deServidor) request.log.warn({ lecturas: lecturas.length, fallos: deServidor }, 'precarga: lecturas que el servidor no pudo dar (se reintentan)');
            if (ahoraNo > 0 && Object.keys(datos).length === 0) {
                return reply.status(503).send({ error: 'El servidor está ocupado; se reintenta solo', code: 'AHORA_NO' });
            }
            // Que el teléfono pueda saber cuánto pasó de verdad por internet
            // (`encodedBodySize`) aunque la API viva en otro origen: el mismo
            // origen al que CORS ya deja leer la respuesta.
            const permitido = reply.getHeader('access-control-allow-origin');
            if (permitido) reply.header('timing-allow-origin', String(permitido));
            return reply.send({ datos, fallos });
        }
    );
}

export default precargaRoutes;
