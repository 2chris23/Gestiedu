import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTeacherAssignments() {
    try {
        // Obtener todas las materias con sus asignaciones
        const subjects = await prisma.subject.findMany({
            include: {
                classroomSubjects: {
                    select: {
                        id: true,
                        teacherId: true,
                        classroom: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });

        console.log('=== ANÁLISIS DE PROFESORES POR MATERIA ===\n');

        for (const subject of subjects) {
            console.log(`📚 ${subject.name}`);
            console.log(`   Total classroomSubjects: ${subject.classroomSubjects.length}`);

            const teacherIds = subject.classroomSubjects
                .map(cs => cs.teacherId)
                .filter(id => id !== null);

            const uniqueTeachers = new Set(teacherIds);

            console.log(`   teacherIds (con nulls): ${JSON.stringify(subject.classroomSubjects.map(cs => cs.teacherId))}`);
            console.log(`   teacherIds únicos (sin nulls): ${uniqueTeachers.size}`);

            if (subject.classroomSubjects.length > 0) {
                console.log('   Detalles:');
                for (const cs of subject.classroomSubjects) {
                    console.log(`     - Sección: ${cs.classroom.name}, teacherId: ${cs.teacherId || 'NULL'}`);
                }
            }
            console.log('');
        }

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

checkTeacherAssignments();
