import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncClassroomTeachers() {
    console.log('🔄 Sincronizando profesores guía en classrooms...\n');

    // Get all teacher-classroom relationships where isMainTeacher = true
    const teacherClassrooms = await prisma.teacherClassroom.findMany({
        where: { isMainTeacher: true },
        include: {
            classroom: true,
            teacher: true
        }
    });

    console.log(`Encontrados ${teacherClassrooms.length} profesores guía\n`);

    for (const tc of teacherClassrooms) {
        console.log(`Actualizando ${tc.classroom.name}...`);
        console.log(`  Profesor: ${tc.teacher.firstName} ${tc.teacher.lastName}`);
        console.log(`  teacherId actual: ${tc.classroom.teacherId}`);
        console.log(`  teacherId nuevo: ${tc.teacherId}`);

        // Update the classroom's teacherId field
        await prisma.classroom.update({
            where: { id: tc.classroomId },
            data: { teacherId: tc.teacherId }
        });

        console.log(`  ✅ Actualizado\n`);
    }

    console.log('✅ Sincronización completada');
}

syncClassroomTeachers()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
