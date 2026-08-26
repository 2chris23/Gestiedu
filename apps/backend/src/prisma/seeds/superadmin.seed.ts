import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed del SuperAdmin — crea el superadmin inicial desde variables de entorno.
 * Es idempotente: si ya existe, no lo duplica.
 */
export async function seedSuperAdmin() {
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;
    const name = process.env.SUPERADMIN_NAME || 'Super Admin';

    if (!email || !password) {
        console.log('⚠️  SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD no definidos. Saltando seed de SuperAdmin.');
        return;
    }

    // Verificar si ya existe
    const existing = await prisma.superAdmin.findUnique({
        where: { email },
    });

    if (existing) {
        console.log(`✅ SuperAdmin ya existe: ${email}`);
        return;
    }

    // Crear el superadmin
    const hashedPassword = await bcrypt.hash(password, 12);

    const superAdmin = await prisma.superAdmin.create({
        data: {
            email,
            password: hashedPassword,
            name,
        },
    });

    console.log(`🔑 SuperAdmin creado exitosamente:`);
    console.log(`   ID:    ${superAdmin.id}`);
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Name:  ${superAdmin.name}`);
}

/**
 * Seed de PlatformConfig — crea la configuración inicial si no existe.
 */
export async function seedPlatformConfig() {
    const existing = await prisma.platformConfig.findUnique({
        where: { id: 'platform' },
    });

    if (existing) {
        console.log('✅ PlatformConfig ya existe');
        return;
    }

    await prisma.platformConfig.create({
        data: {
            id: 'platform',
            platformName: process.env.PLATFORM_NAME || 'GestiEdu',
            supportEmail: process.env.SUPPORT_EMAIL || 'soporte@tuapp.com',
        },
    });

    console.log('🏗️  PlatformConfig creada exitosamente');
}

// Ejecución directa
async function main() {
    try {
        await seedSuperAdmin();
        await seedPlatformConfig();
    } catch (error) {
        console.error('❌ Error en seed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
