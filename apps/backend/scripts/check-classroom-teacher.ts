import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkClassroomTeacher() {
    console.log('🔍 Verificando profesor de 5to Grado A...\n');

    const classroom = await prisma.classroom.findFirst({
        where: { slug: '5to-grado-a' },
        include: {
            teacherClassrooms: {
                include: {
                    teacher: true
                }
            }
        }
    });

    if (classroom) {
        console.log(`Aula: ${classroom.name}`);
        console.log(`ID: ${classroom.id}`);
        console.log(`TeacherId (campo directo): ${classroom.teacherId}`);

        console.log(`\nTeacherClassrooms (relación muchos-a-muchos):`);
        classroom.teacherClassrooms.forEach(tc => {
            console.log(`  - ${tc.teacher.firstName} ${tc.teacher.lastName} (isMainTeacher: ${tc.isMainTeacher})`);
        });

        // Get teacher directly if teacherId exists
        if (classroom.teacherId) {
            const teacher = await prisma.user.findUnique({
                where: { id: classroom.teacherId }
            });
            console.log(`\nProfesor (por teacherId):`);
            console.log(teacher ? `  ${teacher.firstName} ${teacher.lastName}` : '  null');
        } else {
            console.log(`\nProfesor (por teacherId): null`);
        }
    } else {
        console.log('❌ Aula no encontrada');
    }
}

checkClassroomTeacher()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
