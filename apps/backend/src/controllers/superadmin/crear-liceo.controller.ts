import { FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma as prisma } from '../../config/database';
import { generateSlug } from '../../utils/slug';
import { TenantProvisioningService } from '../../services/tenant-provisioning.service';
import { getPlanConfig, PlanName } from '../../config/plans';
import { INSTITUTE_SUPERADMIN_SELECT } from '../../utils/institute-fields';

/**
 * POST /api/superadmin/institutes
 * Crea un nuevo instituto con provisioning automático
 */
export async function crearLiceo(
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
                databaseSchema: provisionResult.databaseSchema ?? null,
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

export interface CreateInstituteBody {
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
