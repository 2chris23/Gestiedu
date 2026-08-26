/**
 * Script para crear o resetear el SuperAdmin en la platform DB.
 * Uso: npx tsx src/scripts/seed-superadmin.ts
 *
 * Crea el superadmin con las credenciales del .env:
 *   SUPERADMIN_EMAIL=admin@tuapp.com
 *   SUPERADMIN_PASSWORD=SuperAdmin2026!
 */

import 'dotenv/config';
import { PrismaClient as PlatformPrisma } from '../generated/platform-client';
import * as bcrypt from 'bcrypt';

const prisma = new PlatformPrisma({
    datasources: { db: { url: process.env.PLATFORM_DATABASE_URL } },
});

async function main() {
    const email = process.env.SUPERADMIN_EMAIL || 'admin@tuapp.com';
    const password = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin2026!';
    const name = 'Super Administrador';

    console.log('\n========================================');
    console.log('  SEED SUPERADMIN');
    console.log('========================================\n');
    console.log(`  Platform DB: ${process.env.PLATFORM_DATABASE_URL?.replace(/:([^:@]+)@/, ':***@')}`);
    console.log(`  Email:       ${email}`);
    console.log(`  Password:    ${password}`);
    console.log('');

    // Verificar si ya existe
    const existing = await prisma.superAdmin.findUnique({ where: { email } });

    if (existing) {
        console.log(`⚠️  SuperAdmin ya existe con email: ${email}`);
        console.log('   Actualizando contraseña...');

        const hashedPassword = await bcrypt.hash(password, 12);
        await prisma.superAdmin.update({
            where: { email },
            data: { password: hashedPassword, isActive: true },
        });

        console.log('\n✅ Contraseña actualizada exitosamente!');
    } else {
        console.log('🔨 Creando SuperAdmin...');

        const hashedPassword = await bcrypt.hash(password, 12);
        const superAdmin = await prisma.superAdmin.create({
            data: {
                email,
                password: hashedPassword,
                name,
                isActive: true,
            },
        });

        console.log(`\n✅ SuperAdmin creado exitosamente!`);
        console.log(`   ID:    ${superAdmin.id}`);
        console.log(`   Email: ${superAdmin.email}`);
        console.log(`   Name:  ${superAdmin.name}`);
    }

    console.log('\n========================================');
    console.log(`  URL: http://super-admin.localhost:3000`);
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log('========================================\n');

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('\n❌ Error:', e.message);
    console.error(e);
    process.exit(1);
});
