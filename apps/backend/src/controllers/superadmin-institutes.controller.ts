import { crearLiceo, type CreateInstituteBody } from './superadmin/crear-liceo.controller';
import { borrarLiceo } from './superadmin/borrar-liceo.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma as prisma, getTenantPrisma } from '../config/database';
import { TenantProvisioningService } from '../services/tenant-provisioning.service';
import { getAllPlans, getPlanConfig, PlanName } from '../config/plans';
import { RedisCache } from '../config/redis';
import { UpdateInstituteInput } from '../schemas/superadmin-institutes.schema';
import { INSTITUTE_SUPERADMIN_SELECT } from '../utils/institute-fields';
import {
    getAllTenantMigrationStatus,
    migrateTenantById,
    migrateAllTenants,
} from '../services/tenant-migrations.service';
import { avisarSiFalla } from '../utils/sin-callar';

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
                            }).catch(avisarSiFalla('superadmin-institutes.controller'));
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
        return crearLiceo(request, reply);
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
     * DELETE /api/superadmin/institutes/:id
     * Elimina un instituto y su base de datos
     */
    async delete(
        request: FastifyRequest<{ Params: { id: string }; Querystring: { force?: string } }>,
        reply: FastifyReply
    ) {
        return borrarLiceo(request, reply);
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
