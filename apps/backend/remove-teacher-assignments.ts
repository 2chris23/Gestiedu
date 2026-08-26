import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeTeacherAssignments() {
    try {
        console.log('🗑️  Eliminando asignaciones de profesores a materias...\n');

        // Actualizar todos los classroomSubjects para quitar el teacherId
        const result = await prisma.classroomSubject.updateMany({
            where: {
                teacherId: {
                    not: null
                }
            },
            data: {
                teacherId: null
            }
        });

        console.log(`✅ Se eliminaron ${result.count} asignaciones de profesores\n`);

        // Verificar el resultado
        const subjects = await prisma.subject.findMany({
            include: {
                classroomSubjects: {
                    select: {
                        teacherId: true
                    }
                }
            }
        });

        console.log('📊 Estado final de las materias:\n');
        for (const subject of subjects) {
            const teacherCount = subject.classroomSubjects.filter(cs => cs.teacherId !== null).length;
            console.log(`   ${subject.name}: ${teacherCount} profesores`);
        }

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

removeTeacherAssignments();
