import { FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma as prisma } from '../config/database';
import { generateSlug } from '../utils/slug';
import { TenantProvisioningService } from '../services/tenant-provisioning.service';
import { PortManagerService } from '../services/port-manager.service';
import { getAllPlans, getPlanConfig, PlanName } from '../config/plans';
import { RedisCache } from '../config/redis';

interface CreateInstituteBody {
    name: string;
    code: string;
    email: string;
    phone?: string;
    address?: string;
    subdomain: string;
    plan?: string; // BASIC | PREMIUM | ENTERPRISE (default: BASIC)
    // Admin user para el instituto
    adminCI: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
}

interface UpdateInstituteBody {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'INACTIVE';
    primaryColor?: string;
    secondaryColor?: string;
}

export class SuperAdminInstitutesController {
    /**
     * GET /api/superadmin/institutes
     * Lista todos los institutos con filtros
     */
    async list(
        request: FastifyRequest<{
            Querystring: {
                page?: string;
                limit?: string;
                search?: string;
                status?: string;
                plan?: string;
            };
        }>,
        reply: FastifyReply
    ) {
        try {
            const page = parseInt(request.query.page || '1');
            const limit = parseInt(request.query.limit || '10');
            const skip = (page - 1) * limit;
            const search = request.query.search;
            const status = request.query.status;
            const plan = request.query.plan;

            const where: any = {};

            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ];
            }

            if (status) {
                where.status = status;
            }



            const [institutes, total] = await Promise.all([
                prisma.institute.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        slug: true,
                        subdomain: true,
                        customDomain: true,
                        environment: true,
                        email: true,
                        phone: true,
                        status: true,
                        plan: true,
                        maxStudents: true,
                        maxTeachers: true,
                        createdAt: true,
                    },
                }),
                prisma.institute.count({ where }),
            ]);

            return reply.send({
                institutes,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }

    /**
     * GET /api/superadmin/institutes/:id
     * Obtiene detalles de un instituto específico
     */
    async getById(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) {
        try {
            const { id } = request.params;

            const institute = await prisma.institute.findUnique({
                where: { id },
                include: {
                    _count: {
                        select: {
                            invitations: true,
                        },
                    },
                },
            });

            if (!institute) {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }

            return reply.send(institute);
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }

    /**
     * POST /api/superadmin/institutes
     * Crea un nuevo instituto con provisioning automático
     */
    async create(
        request: FastifyRequest<{ Body: CreateInstituteBody }>,
        reply: FastifyReply
    ) {
        try {
            const {
                name,
                code,
                email,
                phone,
                address,
                subdomain,
                plan,
                adminCI,
                adminName,
                adminEmail,
                adminPassword,
            } = request.body;

            // Validaciones básicas
            if (!name || !code || !email || !subdomain || !adminCI || !adminName || !adminEmail || !adminPassword) {
                return reply.status(400).send({
                    error: 'Campos requeridos: name, code, email, subdomain, adminCI, adminName, adminEmail, adminPassword',
                });
            }

            // Validar formato de subdomain
            if (!/^[a-z0-9-]+$/.test(subdomain)) {
                return reply.status(400).send({
                    error: 'El subdomain solo puede contener letras minúsculas, números y guiones',
                });
            }

            // Verificar que no exista un instituto con el mismo código
            const existingCode = await prisma.institute.findFirst({
                where: { code },
            });

            if (existingCode) {
                return reply.status(400).send({ error: 'El código ya está en uso' });
            }

            // Verificar que no exista un instituto con el mismo subdomain
            const existingSubdomain = await prisma.institute.findFirst({
                where: { subdomain },
            });

            if (existingSubdomain) {
                return reply.status(400).send({ error: 'El subdomain ya está en uso' });
            }

            // Generar slug único
            let slug = generateSlug(name);
            const existingSlug = await prisma.institute.findFirst({
                where: { slug },
            });

            if (existingSlug) {
                slug = `${slug}-${Date.now()}`;
            }

            // Resolver plan y límites
            const planName = (plan as PlanName) || 'BASIC';
            const planConfig = getPlanConfig(planName);
            const nextBillingDate = new Date();
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

            // Crear instituto en Platform DB con estado PROVISIONING
            const institute = await prisma.institute.create({
                data: {
                    name,
                    code,
                    slug,
                    subdomain,
                    email,
                    phone,
                    address,
                    environment: 'development',
                    status: 'PROVISIONING',
                    // Plan y límites
                    plan: planName,
                    maxStudents: planConfig.maxStudents,
                    maxTeachers: planConfig.maxTeachers,
                },
            });

            // Ejecutar provisioning del tenant en segundo plano
            // (en producción esto debería ser un job en una cola)
            try {
                const provisionResult = await TenantProvisioningService.provisionTenant(slug, {
                    ci: adminCI,
                    name: adminName,
                    email: adminEmail,
                    password: adminPassword,
                }, {
                    id: institute.id,
                    name,
                    code,
                    email,
                    slug,
                    subdomain,
                    status: 'ACTIVE',
                    plan: planName as any,
                });

                if (!provisionResult.success) {
                    // Actualizar estado a FAILED
                    await prisma.institute.update({
                        where: { id: institute.id },
                        data: {
                            status: 'FAILED',
                            notes: `Error en provisioning: ${provisionResult.error}`,
                        },
                    });

                    return reply.status(500).send({
                        error: 'Error en el provisioning del instituto',
                        details: provisionResult.error,
                    });
                }

                // Actualizar instituto con datos de provisioning
                const updatedInstitute = await prisma.institute.update({
                    where: { id: institute.id },
                    data: {
                        status: 'ACTIVE',
                        databaseName: provisionResult.databaseName,
                        databaseHost: provisionResult.databaseHost,
                        databasePort: provisionResult.databasePort,
                        databaseUser: provisionResult.databaseUser,
                        databasePassword: provisionResult.databasePassword,
                    },
                });

                // Construir URL de acceso con subdomain
                const accessUrl = `http://${institute.subdomain}.localhost:3000`;

                return reply.status(201).send({
                    ...updatedInstitute,
                    accessUrl,
                    message: 'Instituto creado y provisionado exitosamente',
                });
            } catch (error: any) {
                // Actualizar estado a FAILED
                await prisma.institute.update({
                    where: { id: institute.id },
                    data: {
                        status: 'FAILED',
                        notes: `Error en provisioning: ${error.message}`,
                    },
                });

                return reply.status(500).send({
                    error: 'Error en el provisioning del instituto',
                    details: error.message,
                });
            }
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }

    /**
     * PATCH /api/superadmin/institutes/:id
     * Actualiza un instituto
     */
    async update(
        request: FastifyRequest<{
            Params: { id: string };
            Body: UpdateInstituteBody;
        }>,
        reply: FastifyReply
    ) {
        try {
            const { id } = request.params;
            const updates = request.body;

            const institute = await prisma.institute.update({
                where: { id },
                data: updates as any,
            });

            return reply.send(institute);
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }

    /**
     * POST /api/superadmin/institutes/:id/reprovision
     * Re-provisiona un instituto: actualiza las credenciales de BD en platform DB
     * y corre migraciones si la BD del tenant ya existe.
     */
    async reprovision(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) {
        try {
            const { id } = request.params;

            const institute = await prisma.institute.findUnique({ where: { id } });
            if (!institute) {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }

            const { user, password, host, port } = TenantProvisioningService.getConnectionCredentials();
            const databaseName = `tenant_${institute.slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

            // Ejecutar provisioning completo (crea BD si no existe, corre migraciones)
            const result = await TenantProvisioningService.provisionTenant(institute.slug, {
                ci: 'reprovision-admin',
                name: 'Admin Reprovisioning',
                email: `admin@${institute.subdomain}.reprovision`,
                password: 'TempAdmin2026!',
            }, {
                id: institute.id,
                name: institute.name,
                code: institute.code,
                email: institute.email,
                slug: institute.slug,
                subdomain: institute.subdomain,
                status: 'ACTIVE',
                plan: institute.plan as any,
            });

            // Actualizar platform DB con los datos de conexión
            const updated = await prisma.institute.update({
                where: { id },
                data: {
                    status: 'ACTIVE',
                    databaseName,
                    databaseHost: host,
                    databasePort: port,
                    databaseUser: user,
                    databasePassword: password,
                },
            });

            // Invalidar cache de Redis para que el portal sirva los datos actualizados
            await RedisCache.del(`institute:info:${institute.slug}`);
            await RedisCache.del(`institute:info:${institute.subdomain}`);

            return reply.send({
                message: 'Instituto re-provisionado correctamente',
                institute: { id: updated.id, name: updated.name, status: updated.status, databaseName: updated.databaseName },
                provisionError: result.error || null,
            });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }


    /**
     * GET /api/superadmin/stats
     * Obtiene estadísticas generales
     */
    async stats(request: FastifyRequest, reply: FastifyReply) {
        try {
            const [totalInstitutes, activeInstitutes, institutesByStatus] = await Promise.all([
                prisma.institute.count(),
                prisma.institute.count({ where: { status: 'ACTIVE' } }),
                prisma.institute.groupBy({
                    by: ['status'],
                    _count: true,
                }),
            ]);

            return reply.send({
                totalInstitutes,
                activeInstitutes,
                statusDistribution: institutesByStatus.reduce((acc: any, item) => {
                    acc[item.status] = item._count;
                    return acc;
                }, {}),
            });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }

    /**
     * GET /api/superadmin/ports/check
     * Verifica si un puerto está disponible
     */
    async checkPort(
        request: FastifyRequest<{ Querystring: { port: string } }>,
        reply: FastifyReply
    ) {
        try {
            const port = parseInt(request.query.port);

            if (isNaN(port)) {
                return reply.status(400).send({ error: 'Puerto inválido' });
            }

            // DEPRECATED: La arquitectura de subdominios no usa puertos individuales
            const isInRange = port >= 3100 && port <= 3200;
            const isAvailable = isInRange ? await PortManagerService.isPortAvailable(port) : false;

            return reply.send({
                available: isAvailable && isInRange,
                reason: !isInRange ? `El puerto debe estar entre 3100 y 3200` :
                    !isAvailable ? 'El puerto está en uso' : undefined,
            });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }


    /**
     * DELETE /api/superadmin/institutes/:id
     * Elimina un instituto y su base de datos
     */
    async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const { id } = request.params;

        try {
            // 1. Buscar el instituto
            const institute = await prisma.institute.findUnique({
                where: { id }
            });

            if (!institute) {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }

            console.log(`🗑️  Eliminando instituto: ${institute.name}`);
            console.log(`📊 Datos del instituto:`, {
                databaseName: institute.databaseName,
                databaseHost: institute.databaseHost,
                databasePort: institute.databasePort,
                hasDatabase: !!institute.databaseName
            });

            // 2. Eliminar la base de datos del tenant si existe
            if (institute.databaseName) {
                try {
                    const { Client } = await import('pg');

                    // Extraer credenciales de la URL de la base de datos de la plataforma
                    const platformDbUrl = process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL || '';
                    const dbUrlMatch = platformDbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);

                    const dbUser = dbUrlMatch ? dbUrlMatch[1] : 'postgres';
                    const dbPassword = dbUrlMatch ? dbUrlMatch[2] : 'postgres';
                    const dbHost = institute.databaseHost || (dbUrlMatch ? dbUrlMatch[3] : 'localhost');
                    const dbPort = institute.databasePort || (dbUrlMatch ? parseInt(dbUrlMatch[4]) : 5432);

                    const adminClient = new Client({
                        host: dbHost,
                        port: dbPort,
                        user: dbUser,
                        password: dbPassword,
                        database: 'postgres'
                    });

                    await adminClient.connect();

                    // Terminar conexiones activas
                    await adminClient.query(`
                        SELECT pg_terminate_backend(pg_stat_activity.pid)
                        FROM pg_stat_activity
                        WHERE pg_stat_activity.datname = $1
                        AND pid <> pg_backend_pid();
                    `, [institute.databaseName]);

                    // Eliminar la base de datos
                    await adminClient.query(`DROP DATABASE IF EXISTS "${institute.databaseName}"`);
                    await adminClient.end();

                    console.log(`✅ Base de datos eliminada: ${institute.databaseName}`);
                } catch (dbError: any) {
                    console.error('⚠️  Error al eliminar base de datos:', dbError.message);
                    // Continuar con la eliminación del instituto aunque falle la BD
                }
            }

            // 3. Eliminar el instituto de la plataforma
            await prisma.institute.delete({
                where: { id }
            });

            // 4. Invalidar caché de Redis para que el subdominio deje de responder
            try {
                const { RedisCache } = await import('../config/redis');
                const slugKey = `institute:info:${institute.slug}`;
                const subdomainKey = `institute:info:${institute.subdomain}`;
                await RedisCache.del(slugKey);
                await RedisCache.del(subdomainKey);
                console.log(`🔄 Caché invalidado para: ${institute.slug}`);
            } catch (cacheError) {
                console.warn('⚠️  No se pudo invalidar el caché Redis:', cacheError);
            }

            console.log(`✅ Instituto eliminado: ${institute.name}`);

            return reply.send({
                message: 'Instituto eliminado exitosamente',
                institute: {
                    id: institute.id,
                    name: institute.name,
                    code: institute.code
                }
            });
        } catch (error: any) {
            console.error('❌ Error eliminando instituto:', error);
            return reply.status(500).send({
                error: 'Error al eliminar instituto',
                details: error.message
            });
        }
    }


    /**
     * GET /api/superadmin/ports/available
     * Obtiene un puerto disponible
     */
    async getAvailablePort(request: FastifyRequest, reply: FastifyReply) {
        try {
            // DEPRECATED: La arquitectura de subdominios no usa puertos individuales
            // Se retorna un valor dummy para backward compatibility
            const port = 3100;

            return reply.send({
                port,
                available: await PortManagerService.isPortAvailable(port),
                message: 'DEPRECATED: Use subdomain-based routing instead',
            });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'No hay puertos disponibles' });
        }
    }

    /**
     * GET /api/superadmin/plans
     * Retorna los planes disponibles con precios y límites
     */
    async getPlans(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send({ plans: getAllPlans() });
    }

    /**
     * PUT /api/superadmin/institutes/:id/plan
     * Cambia el plan de un instituto y actualiza sus límites automáticamente
     */
    async changePlan(
        request: FastifyRequest<{
            Params: { id: string };
            Body: { plan: PlanName; nextBillingDate?: string };
        }>,
        reply: FastifyReply
    ) {
        try {
            const { id } = request.params;
            const { plan, nextBillingDate } = request.body;

            if (!plan || !['BASIC', 'PREMIUM', 'ENTERPRISE'].includes(plan)) {
                return reply.status(400).send({
                    error: 'Plan inválido. Opciones: BASIC, PREMIUM, ENTERPRISE',
                });
            }

            const institute = await prisma.institute.findUnique({
                where: { id },
                select: {
                    id: true,
                    name: true,
                    plan: true,
                    currentStudents: true,
                    currentTeachers: true,
                },
            });

            if (!institute) {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }

            const newPlanConfig = getPlanConfig(plan);

            // Validar que el instituto no excede los límites del nuevo plan
            if (institute.currentStudents > newPlanConfig.maxStudents) {
                return reply.status(400).send({
                    error: 'No se puede degradar al plan seleccionado',
                    code: 'DOWNGRADE_BLOCKED',
                    message: `El instituto tiene ${institute.currentStudents} estudiantes activos, que excede el límite de ${newPlanConfig.maxStudents} del plan ${plan}.`,
                    details: {
                        current: institute.currentStudents,
                        newLimit: newPlanConfig.maxStudents,
                    },
                });
            }

            if (institute.currentTeachers > newPlanConfig.maxTeachers) {
                return reply.status(400).send({
                    error: 'No se puede degradar al plan seleccionado',
                    code: 'DOWNGRADE_BLOCKED',
                    message: `El instituto tiene ${institute.currentTeachers} profesores activos, que excede el límite de ${newPlanConfig.maxTeachers} del plan ${plan}.`,
                    details: {
                        current: institute.currentTeachers,
                        newLimit: newPlanConfig.maxTeachers,
                    },
                });
            }

            const updated = await prisma.institute.update({
                where: { id },
                data: {
                    plan,
                    maxStudents: newPlanConfig.maxStudents,
                    maxTeachers: newPlanConfig.maxTeachers,
                    maxStorage: newPlanConfig.maxStorage,
                    monthlyPrice: newPlanConfig.monthlyPrice,
                    ...(nextBillingDate && { nextBillingDate: new Date(nextBillingDate) }),
                },
            });

            return reply.send({
                message: `Plan cambiado a ${newPlanConfig.displayName} exitosamente`,
                institute: {
                    id: updated.id,
                    name: institute.name,
                    plan: updated.plan,
                    maxStudents: updated.maxStudents,
                    maxTeachers: updated.maxTeachers,
                    maxStorage: updated.maxStorage,
                    monthlyPrice: updated.monthlyPrice,
                },
            });
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }
}

export const superAdminInstitutesController = new SuperAdminInstitutesController();
