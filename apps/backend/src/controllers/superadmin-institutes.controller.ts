import { FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma as prisma, getTenantPrisma } from '../config/database';
import { generateSlug } from '../utils/slug';
import { TenantProvisioningService } from '../services/tenant-provisioning.service';
import { PortManagerService } from '../services/port-manager.service';
import { getAllPlans, getPlanConfig, PlanName } from '../config/plans';
import { RedisCache } from '../config/redis';
import { UpdateInstituteInput } from '../schemas/superadmin-institutes.schema';
import { INSTITUTE_SUPERADMIN_SELECT } from '../utils/institute-fields';
import {
    getAllTenantMigrationStatus,
    migrateTenantById,
    migrateAllTenants,
} from '../services/tenant-migrations.service';

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

/**
 * Los campos actualizables se derivan del schema Zod que valida la ruta, para
 * que el tipo y la lista blanca en tiempo de ejecución no puedan divergir.
 */
type UpdateInstituteBody = UpdateInstituteInput;

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
                    currentStudents: true,
                    currentTeachers: true,
                    maxStudents: true,
                    maxTeachers: true,
                    createdAt: true,
                },
            }),
            prisma.institute.count({ where }),
        ]);

        // Obtener métricas reales en vivo de usuarios desde cada tenant DB
        const enrichedInstitutes = await Promise.all(
            institutes.map(async (inst) => {
                if (inst.status === 'ACTIVE') {
                    try {
                        const tenantDb = await getTenantPrisma(inst.id);
                        const [studentsCount, teachersCount] = await Promise.all([
                            tenantDb.user.count({ where: { role: 'STUDENT' } }),
                            tenantDb.user.count({ where: { role: 'TEACHER' } }),
                        ]);

                        // Actualizar asíncronamente en platformPrisma si cambió
                        if (inst.currentStudents !== studentsCount || inst.currentTeachers !== teachersCount) {
                            prisma.institute.update({
                                where: { id: inst.id },
                                data: {
                                    currentStudents: studentsCount,
                                    currentTeachers: teachersCount,
                                },
                            }).catch(() => {});
                        }

                        return {
                            ...inst,
                            currentStudents: studentsCount,
                            currentTeachers: teachersCount,
                        };
                    } catch (err) {
                        return inst;
                    }
                }
                return inst;
            })
        );

        return reply.send({
            institutes: enrichedInstitutes,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }

    /**
     * GET /api/superadmin/institutes/:id
     * Obtiene detalles de un instituto específico
     */
    async getById(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) {
        const { id } = request.params;

        // `include` traía la fila completa, credenciales de conexión incluidas.
        const institute = await prisma.institute.findUnique({
            where: { id },
            select: {
                ...INSTITUTE_SUPERADMIN_SELECT,
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

        let enrichedInstitute = { ...institute };
        if (institute.status === 'ACTIVE') {
            try {
                const tenantDb = await getTenantPrisma(institute.id);
                const [studentsCount, teachersCount] = await Promise.all([
                    tenantDb.user.count({ where: { role: 'STUDENT' } }),
                    tenantDb.user.count({ where: { role: 'TEACHER' } }),
                ]);
                enrichedInstitute.currentStudents = studentsCount;
                enrichedInstitute.currentTeachers = teachersCount;
            } catch (e) {}
        }

        return reply.send(enrichedInstitute);
    }

    /**
     * POST /api/superadmin/institutes
     * Crea un nuevo instituto con provisioning automático
     */
    async create(
        request: FastifyRequest<{ Body: CreateInstituteBody }>,
        reply: FastifyReply
    ) {
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

                // El detalle crudo del provisioning (salida de prisma migrate,
                // rutas del servidor) queda en `notes` y en el log, nunca en la
                // respuesta HTTP.
                console.error('[superadmin] Provisioning fallido:', provisionResult.error);

                return reply.status(500).send({
                    error: 'Error en el provisioning del instituto',
                    code: 'PROVISIONING_FAILED',
                    instituteId: institute.id,
                });
            }

            // Actualizar instituto con datos de provisioning
            // Se escriben las credenciales pero NO se leen de vuelta: el `select`
            // deja fuera host/puerto/usuario/contraseña, que es justo lo que este
            // endpoint devolvía recién generado.
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
                select: INSTITUTE_SUPERADMIN_SELECT,
            });

            // Construir URL de acceso con subdomain
            const accessUrl = `http://${institute.subdomain}.localhost:3000`;

            return reply.status(201).send({
                ...updatedInstitute,
                accessUrl,
                message: 'Instituto creado y provisionado exitosamente',
            });
        } catch (error: any) {
            // Compensación necesaria: el instituto ya existe en Platform DB con
            // estado PROVISIONING y hay que marcarlo como FAILED antes de que el
            // error suba. La respuesta la construye el handler central.
            await prisma.institute.update({
                where: { id: institute.id },
                data: {
                    status: 'FAILED',
                    notes: `Error en provisioning: ${error.message}`,
                },
            });

            throw error;
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

            // Se construye el `data` campo por campo en vez de reenviar el body:
            // aunque la ruta ya valida con un schema estricto, esto deja el
            // controller a salvo por sí solo de una escritura masiva de columnas
            // (subdomain, slug, code, databaseHost/User/Password, plan, límites...).
            const institute = await prisma.institute.update({
                where: { id },
                data: {
                    ...(updates.name !== undefined && { name: updates.name }),
                    ...(updates.email !== undefined && { email: updates.email }),
                    ...(updates.phone !== undefined && { phone: updates.phone }),
                    ...(updates.address !== undefined && { address: updates.address }),
                    ...(updates.status !== undefined && { status: updates.status }),
                    ...(updates.primaryColor !== undefined && { primaryColor: updates.primaryColor }),
                    ...(updates.secondaryColor !== undefined && { secondaryColor: updates.secondaryColor }),
                },
                select: INSTITUTE_SUPERADMIN_SELECT,
            });

            return reply.send(institute);
        } catch (error: any) {
            // Se conserva solo el 404 con mensaje de dominio; cualquier otro error
            // (incluido P2002 → 409) lo resuelve el handler central.
            if (error.code === 'P2025') {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }
            throw error;
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
            select: INSTITUTE_SUPERADMIN_SELECT,
        });

        // Invalidar cache de Redis para que el portal sirva los datos actualizados
        await RedisCache.del(`institute:info:${institute.slug}`);
        await RedisCache.del(`institute:info:${institute.subdomain}`);

        // `result.error` trae la salida cruda de prisma migrate (con rutas absolutas
        // del servidor): se registra, pero al cliente solo le llega el flag.
        if (result.error) {
            console.error(`[superadmin] Reprovisioning de ${institute.slug} con errores:`, result.error);
        }

        return reply.send({
            message: 'Instituto re-provisionado correctamente',
            institute: { id: updated.id, name: updated.name, status: updated.status, databaseName: updated.databaseName },
            provisionError: result.error ? 'El reprovisioning terminó con errores; revisar los logs del servidor' : null,
        });
    }


    /**
     * GET /api/superadmin/stats
     * Obtiene estadísticas generales
     */
    async stats(request: FastifyRequest, reply: FastifyReply) {
        const [totalInstitutes, activeInstitutes, institutesByStatus, usersAggregate] = await Promise.all([
            prisma.institute.count(),
            prisma.institute.count({ where: { status: 'ACTIVE' } }),
            prisma.institute.groupBy({
                by: ['status'],
                _count: true,
            }),
            prisma.institute.aggregate({
                _sum: {
                    currentStudents: true,
                    currentTeachers: true,
                },
            }),
        ]);

        const totalUsers = (usersAggregate._sum.currentStudents || 0) + (usersAggregate._sum.currentTeachers || 0);

        return reply.send({
            totalInstitutes,
            activeInstitutes,
            totalUsers,
            statusDistribution: institutesByStatus.reduce((acc: any, item) => {
                acc[item.status] = item._count;
                return acc;
            }, {}),
        });
    }

    /**
     * GET /api/superadmin/ports/check
     * Verifica si un puerto está disponible
     */
    async checkPort(
        request: FastifyRequest<{ Querystring: { port: string } }>,
        reply: FastifyReply
    ) {
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
    }


    /**
     * DELETE /api/superadmin/institutes/:id
     * Elimina un instituto y su base de datos
     */
    async delete(
        request: FastifyRequest<{ Params: { id: string }; Querystring: { force?: string } }>,
        reply: FastifyReply
    ) {
        const { id } = request.params;
        const force = request.query?.force === 'true';

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

            // 2. ANTES DE NADA: un respaldo del liceo entero.
            //
            // Lo que viene después es `DROP DATABASE`: se lleva todo —alumnos,
            // notas, asistencias, años completos— y no hay papelera que lo alcance,
            // porque la papelera vive dentro de esa misma base. Si el respaldo no
            // sale bien, no se borra nada.
            let respaldoPrevio: string | null = null;
            if (institute.databaseName) {
                const { respaldarLiceo } = await import('../services/respaldos.service');
                const resultado = await respaldarLiceo(institute as any);

                if (!resultado.ok) {
                    if (!force) {
                        return reply.status(409).send({
                            error: 'No se pudo respaldar el instituto antes de eliminarlo',
                            message:
                                `El instituto NO se eliminó porque el respaldo previo falló (${resultado.error}). ` +
                                `Sin respaldo, eliminarlo destruye sus datos para siempre. Resolvé el problema y ` +
                                `reintentá, o forzá a conciencia con ?force=true.`,
                            code: 'BACKUP_BEFORE_DELETE_FAILED',
                            databaseName: institute.databaseName,
                        });
                    }
                    console.warn(`⚠️  Respaldo previo fallido y se forzó el borrado: ${resultado.error}`);
                } else {
                    respaldoPrevio = resultado.archivo ?? null;
                    console.log(`💾 Respaldo previo guardado: ${respaldoPrevio} (${resultado.bytes} bytes)`);
                }
            }

            // 3. Eliminar la base de datos del tenant si existe
            let dropError: string | null = null;
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
                    // ANTES: se hacía console.error y se borraba la fila igual. El
                    // instituto desaparecía del panel pero su base seguía viva en
                    // Postgres, huérfana y sin nada que la referenciara — imposible
                    // de encontrar desde la app. Ahora el fallo se propaga.
                    console.error('⚠️  Error al eliminar base de datos:', dbError.message);
                    dropError = dbError.message;
                }
            }

            // 4. Si no se pudo dropear la base, NO se borra la fila: dejarla es lo
            //    único que mantiene localizable a esa base. Se corta aquí para que
            //    el SuperAdmin pueda reintentar, o forzar a conciencia con ?force=true.
            if (dropError && !force) {
                return reply.status(409).send({
                    error: 'No se pudo eliminar la base de datos del instituto',
                    message:
                        `El instituto NO se eliminó para no dejar la base '${institute.databaseName}' ` +
                        `huérfana en el servidor. Revisá los logs, resolvé el problema y reintentá. ` +
                        `Si querés eliminarlo igualmente, repetí la llamada con ?force=true.`,
                    code: 'TENANT_DB_DROP_FAILED',
                    databaseName: institute.databaseName,
                });
            }

            // 5. Eliminar el instituto de la plataforma
            await prisma.institute.delete({
                where: { id }
            });

            // 6. Invalidar caché de Redis para que el subdominio deje de responder
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
                },
                // Dónde quedó el respaldo, que es de lo único que se puede
                // recuperar el liceo si esto fue un error.
                ...(respaldoPrevio && { respaldo: respaldoPrevio }),
                // Con ?force=true el borrado sigue adelante, pero queda constancia
                // explícita de la base que quedó suelta y hay que limpiar a mano.
                ...(dropError && {
                    warning: `La base '${institute.databaseName}' NO pudo eliminarse y quedó huérfana en el servidor; hay que borrarla manualmente.`,
                    orphanDatabase: institute.databaseName,
                }),
            });
        } catch (error: any) {
            // Log específico del flujo de borrado (el handler central no sabe en qué
            // instituto estábamos); la respuesta la construye él.
            console.error(`❌ Error eliminando instituto ${id}:`, error);
            throw error;
        }
    }


    /**
     * GET /api/superadmin/ports/available
     * Obtiene un puerto disponible
     */
    async getAvailablePort(request: FastifyRequest, reply: FastifyReply) {
        // DEPRECATED: La arquitectura de subdominios no usa puertos individuales
        // Se retorna un valor dummy para backward compatibility
        const port = 3100;

        return reply.send({
            port,
            available: await PortManagerService.isPortAvailable(port),
            message: 'DEPRECATED: Use subdomain-based routing instead',
        });
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
            // Ver nota en `update`: solo se conserva el 404 de dominio.
            if (error.code === 'P2025') {
                return reply.status(404).send({ error: 'Instituto no encontrado' });
            }
            throw error;
        }
    }

    /**
     * Estado del esquema de cada liceo: cuántas migraciones tiene aplicadas y
     * cuáles le faltan respecto al código desplegado.
     */
    async migrationsStatus(_request: FastifyRequest, reply: FastifyReply) {
        const status = await getAllTenantMigrationStatus();
        const behind = status.tenants.filter((t) => !t.upToDate || t.error);
        return reply.send({
            localMigrations: status.localMigrations,
            total: status.tenants.length,
            upToDate: status.tenants.length - behind.length,
            behind: behind.length,
            tenants: status.tenants,
        });
    }

    /** Aplica las migraciones pendientes a un liceo concreto. */
    async migrateInstitute(
        request: FastifyRequest<{ Params: { id: string } }>,
        reply: FastifyReply
    ) {
        try {
            const result = await migrateTenantById(request.params.id);
            return reply.status(result.ok ? 200 : 500).send(result);
        } catch (error: any) {
            return reply.status(404).send({ error: error?.message ?? 'Liceo no encontrado' });
        }
    }

    /** Aplica las migraciones pendientes a todos los liceos activos. */
    async migrateAll(_request: FastifyRequest, reply: FastifyReply) {
        const report = await migrateAllTenants();

        // Si falla un liceo, la petición NO se rompió: salió a medias. Un 500
        // hace que la pantalla enseñe un error genérico y esconde lo único que
        // importa: cuáles quedaron al día y cuál hay que ir a mirar.
        const todoBien = report.failed.length === 0;
        return reply.status(todoBien ? 200 : 207).send({
            ...report,
            resumen: todoBien
                ? `${report.migrated} liceo(s) al día.`
                : `${report.migrated} de ${report.total} al día. Falló: ${report.failed
                      .map((f: { slug?: string; name?: string }) => f.slug ?? f.name)
                      .join(', ')}.`,
        });
    }
}

export const superAdminInstitutesController = new SuperAdminInstitutesController();
