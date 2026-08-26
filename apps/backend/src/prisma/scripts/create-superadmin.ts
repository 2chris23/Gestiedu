import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createSuperAdmin() {
    try {
        // Verificar si ya existe
        const existing = await prisma.superAdmin.findUnique({
            where: { email: 'admin@gestion.com' }
        });

        if (existing) {
            console.log('✅ SuperAdmin ya existe');
            return;
        }

        // Crear SuperAdmin
        const hashedPassword = await bcrypt.hash('admin123', 12);

        const superAdmin = await prisma.superAdmin.create({
            data: {
                email: 'admin@gestion.com',
                password: hashedPassword,
                name: 'Super Admin',
                isActive: true
            }
        });

        console.log('✅ SuperAdmin creado exitosamente');
        console.log('📧 Email: admin@gestion.com');
        console.log('🔑 Password: admin123');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

createSuperAdmin();
