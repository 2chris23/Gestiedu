import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma } from '../config/database';
import { RedisCache } from '../config/redis';

const INSTITUTE_INFO_CACHE_TTL = 30; // 30 segundos — se actualiza rápido tras reprovisioning

interface InstituteInfoParams {
    slug: string;
}

/**
 * Controller para información pública de institutos
 * Usado por el frontend para obtener datos del instituto por slug
 */
export async function instituteInfoRoutes(fastify: FastifyInstance) {
    /**
     * GET /api/instituto/:slug/info
     * Obtiene información pública del instituto por slug
     */
    fastify.get<{ Params: InstituteInfoParams }>(
        '/api/instituto/:slug/info',
        async (request: FastifyRequest<{ Params: InstituteInfoParams }>, reply: FastifyReply) => {
            const { slug } = request.params;

            if (!slug) {
                return reply.status(400).send({
                    error: 'Slug es requerido',
                });
            }

            try {
                // Intentar obtener de cache
                const cacheKey = `institute:info:${slug}`;
                const cached = await RedisCache.get<any>(cacheKey);

                if (cached) {
                    return reply.send(cached);
                }

                // Buscar instituto en Platform DB
                const institute = await platformPrisma.institute.findFirst({
                    where: {
                        OR: [
                            { slug },
                            { subdomain: slug },
                        ],
                    },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        subdomain: true,
                        customDomain: true,
                        environment: true,
                        status: true,
                        logo: true,
                        favicon: true,
                        primaryColor: true,
                        secondaryColor: true,
                        timezone: true,
                        country: true,
                        city: true,
                    },
                });

                if (!institute) {
                    return reply.status(404).send({
                        error: 'Instituto no encontrado',
                    });
                }

                if (institute.status !== 'ACTIVE') {
                    return reply.status(503).send({
                        error: 'Instituto en mantenimiento',
                        status: institute.status,
                    });
                }

                // Preparar respuesta
                const response = {
                    id: institute.id,
                    name: institute.name,
                    slug: institute.slug,
                    subdomain: institute.subdomain,
                    customDomain: institute.customDomain,
                    environment: institute.environment,
                    logo: institute.logo,
                    favicon: institute.favicon,
                    primaryColor: institute.primaryColor || '#4F46E5',
                    secondaryColor: institute.secondaryColor || '#3B82F6',
                    timezone: institute.timezone,
                    country: institute.country,
                    city: institute.city,
                };

                // Guardar en cache
                await RedisCache.set(cacheKey, response, INSTITUTE_INFO_CACHE_TTL);

                return reply.send(response);
            } catch (error) {
                fastify.log.error(error, 'Error fetching institute info');
                return reply.status(500).send({
                    error: 'Error al obtener información del instituto',
                });
            }
        }
    );
}
