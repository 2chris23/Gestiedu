import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDatabase() {
    try {
        console.log('🧹 Limpiando asignaciones de materias...');

        // Ver cuántas asignaciones hay
        const count = await prisma.classroomSubject.count();
        console.log(`📊 Asignaciones actuales: ${count}`);

        if (count > 0) {
            // Mostrar las asignaciones antes de eliminar
            const assignments = await prisma.classroomSubject.findMany({
                include: {
                    subject: { select: { name: true } },
                    classroom: { select: { name: true } }
                }
            });

            console.log('\n📋 Asignaciones a eliminar:');
            assignments.forEach(a => {
                console.log(`  - ${a.subject.name} → ${a.classroom.name}`);
            });

            // Eliminar todas las asignaciones
            const result = await prisma.classroomSubject.deleteMany({});
            console.log(`\n✅ ${result.count} asignaciones eliminadas`);
        } else {
            console.log('✅ No hay asignaciones para eliminar');
        }

        // Verificar
        const finalCount = await prisma.classroomSubject.count();
        console.log(`\n📊 Asignaciones finales: ${finalCount}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanDatabase();
