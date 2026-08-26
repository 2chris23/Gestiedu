import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTeacherUsers() {
    try {
        const teacherIds = ['34567890', '23456789', '45678901'];

        console.log('=== VERIFICACIÓN DE USUARIOS PROFESORES ===\n');

        for (const id of teacherIds) {
            const user = await prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true
                }
            });

            if (user) {
                console.log(`✅ Usuario encontrado: ${id}`);
                console.log(`   Nombre: ${user.firstName} ${user.lastName}`);
                console.log(`   Email: ${user.email}`);
                console.log(`   Rol: ${user.role}\n`);
            } else {
                console.log(`❌ Usuario NO encontrado: ${id}\n`);
            }
        }

        // Verificar cuántos profesores existen en total
        const totalTeachers = await prisma.user.count({
            where: { role: 'TEACHER' }
        });

        console.log(`\n📊 Total de profesores en el sistema: ${totalTeachers}`);

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

checkTeacherUsers();
