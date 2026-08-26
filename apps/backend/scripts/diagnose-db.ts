import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
    console.log('=== DIAGNÓSTICO DE BASE DE DATOS ===\n');

    try {
        // 1. Años Académicos
        const academicYears = await prisma.academicYear.findMany();
        console.log('📅 Años Académicos:', academicYears.length);
        academicYears.forEach(y => {
            console.log(`  - ${y.name} (${y.status}) - ID: ${y.id}`);
        });

        // 2. Secciones
        const classrooms = await prisma.classroom.findMany({
            include: { academicYear: true }
        });
        console.log('\n🏫 Secciones:', classrooms.length);
        classrooms.forEach(c => {
            console.log(`  - ${c.grade}° ${c.section} (${c.academicYear?.name || 'Sin año'}) - ID: ${c.id}`);
        });

        // 3. Estudiantes
        const students = await prisma.user.findMany({
            where: { role: 'STUDENT' }
        });
        console.log('\n👨‍🎓 Estudiantes:', students.length);
        students.forEach(s => {
            console.log(`  - ${s.firstName} ${s.lastName} (${s.id}) - classroomId: ${s.classroomId || 'null'}`);
        });

        // 4. Inscripciones
        const enrollments = await prisma.studentClassroom.findMany({
            include: {
                student: true,
                classroom: true,
                academicYear: true
            }
        });
        console.log('\n📝 Inscripciones en StudentClassroom:', enrollments.length);
        enrollments.forEach(e => {
            console.log(`  - ${e.student.firstName} ${e.student.lastName} → ${e.classroom.grade}° ${e.classroom.section} (${e.academicYear.name}) [${e.isActive ? 'ACTIVA' : 'INACTIVA'}]`);
        });

        // 5. Estudiantes con classroomId (legacy)
        const studentsWithClassroom = students.filter(s => s.classroomId);
        console.log('\n⚠️  Estudiantes con classroomId (legacy):', studentsWithClassroom.length);
        studentsWithClassroom.forEach(s => {
            console.log(`  - ${s.firstName} ${s.lastName} - classroomId: ${s.classroomId}`);
        });

        console.log('\n=== FIN DEL DIAGNÓSTICO ===');
    } catch (error) {
        console.error('Error durante el diagnóstico:', error);
    }
}

diagnose()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
