import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL
        }
    }
});

async function updateSuperAdminPassword() {
    const email = process.env.SUPERADMIN_EMAIL || 'admin@tuapp.com';
    const password = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin2026!';

    console.log(`🔄 Actualizando contraseña del SuperAdmin: ${email}`);

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // Actualizar en la base de datos
    const updated = await prisma.superAdmin.update({
        where: { email },
        data: { password: hashedPassword }
    });

    console.log(`✅ Contraseña actualizada exitosamente para: ${updated.email}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);

    await prisma.$disconnect();
}

updateSuperAdminPassword()
    .catch((error) => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
