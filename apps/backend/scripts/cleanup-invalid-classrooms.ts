import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupInvalidClassrooms() {
    console.log('🧹 Limpiando aulas inválidas...\n');

    // Delete 6to Grado A and related data
    const classroomToDelete = await prisma.classroom.findFirst({
        where: {
            OR: [
                { slug: '6to-grado-a' },
                { grade: 6 }
            ]
        }
    });

    if (classroomToDelete) {
        console.log(`Encontrada aula inválida: ${classroomToDelete.name} (ID: ${classroomToDelete.id})`);

        // Delete related teacher assignments
        const deletedTeachers = await prisma.teacherClassroom.deleteMany({
            where: { classroomId: classroomToDelete.id }
        });
        console.log(`  ✅ Eliminadas ${deletedTeachers.count} asignaciones de profesores`);

        // Delete related student enrollments
        const deletedStudents = await prisma.studentClassroom.deleteMany({
            where: { classroomId: classroomToDelete.id }
        });
        console.log(`  ✅ Eliminadas ${deletedStudents.count} inscripciones de estudiantes`);

        // Delete the classroom
        await prisma.classroom.delete({
            where: { id: classroomToDelete.id }
        });
        console.log(`  ✅ Aula eliminada\n`);
    } else {
        console.log('No se encontraron aulas inválidas\n');
    }

    console.log('✅ Limpieza completada');
}

cleanupInvalidClassrooms()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
