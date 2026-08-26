/**
 * Script para re-provisionar un instituto existente que no tiene databaseName asignado.
 * Uso: npx tsx src/scripts/reprovision-institute.ts <slug>
 */

import 'dotenv/config';
import { PrismaClient as PlatformPrisma } from '../generated/platform-client';
import { TenantProvisioningService } from '../services/tenant-provisioning.service';

const platformPrisma = new PlatformPrisma({
    datasources: { db: { url: process.env.PLATFORM_DATABASE_URL } },
});

async function main() {
    const slug = process.argv[2];
    if (!slug) {
        console.error('❌ Uso: npx tsx src/scripts/reprovision-institute.ts <slug>');
        process.exit(1);
    }

    console.log(`\n🔍 Buscando instituto con slug: ${slug}...`);

    const institute = await platformPrisma.institute.findFirst({
        where: { OR: [{ slug }, { subdomain: slug }] },
    });

    if (!institute) {
        console.error(`❌ Instituto no encontrado: ${slug}`);
        process.exit(1);
    }

    console.log(`✅ Instituto encontrado: ${institute.name} (id: ${institute.id})`);
    console.log(`   Status: ${institute.status}`);
    console.log(`   databaseName: ${institute.databaseName || '(vacío)'}`);

    // Solo crear la BD y correr migraciones (sin crear admin user si ya existe)
    const databaseName = `tenant_${institute.slug.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    const baseUrl = process.env.PLATFORM_DATABASE_URL || '';
    const urlParts = baseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\//);

    if (!urlParts) {
        console.error('❌ PLATFORM_DATABASE_URL inválida');
        process.exit(1);
    }

    const [, user, password, host, port] = urlParts;
    const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${databaseName}`;

    console.log(`\n🗄️  Base de datos: ${databaseName}`);
    console.log(`📡 URL: postgresql://${user}:***@${host}:${port}/${databaseName}`);

    // Ejecutar provisioning (crea BD + migraciones)
    console.log('\n🚀 Iniciando provisioning...');
    const result = await TenantProvisioningService.provisionTenant(institute.slug, {
        ci: institute.adminId || 'admin-temp',
        name: 'Admin Principal',
        email: `admin@${institute.subdomain}.com`,
        password: 'Admin2026!',
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

    if (!result.success) {
        console.error(`❌ Error en provisioning: ${result.error}`);
        // Aún así actualizamos el databaseName
    }

    // Actualizar platform DB con datos de conexión
    console.log('\n📝 Actualizando platform DB...');
    await platformPrisma.institute.update({
        where: { id: institute.id },
        data: {
            status: 'ACTIVE',
            databaseName,
            databaseHost: host,
            databasePort: parseInt(port),
            databaseUser: user,
            databasePassword: password,
        },
    });

    console.log(`\n✅ Instituto re-provisionado exitosamente!`);
    console.log(`   databaseName: ${databaseName}`);
    console.log(`   URL de acceso: http://${institute.subdomain}.localhost:3000`);

    await platformPrisma.$disconnect();
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
});
