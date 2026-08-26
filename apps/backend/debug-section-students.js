// Script para verificar qué estudiantes están en la sección
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('=== VERIFICANDO ESTUDIANTES EN SECCIÓN ===\n');

    try {
        // 1. Buscar la sección "1er Año A"
        const classroom = await prisma.classroom.findFirst({
            where: {
                grade: 1,
                section: 'A'
            },
            include: {
                academicYear: true
            }
        });

        if (!classroom) {
            console.error('❌ No se encontró la sección 1er Año A');
            return;
        }

        console.log('✅ Sección encontrada:');
        console.log('   ID:', classroom.id);
        console.log('   Nombre:', classroom.name);
        console.log('   Ciclo:', classroom.academicYear.name);
        console.log('   academicYearId:', classroom.academicYearId);

        // 2. Buscar estudiantes con classroomId
        console.log('\n--- MÉTODO 1: Estudiantes con classroomId ---');
        const studentsByClassroomId = await prisma.user.findMany({
            where: {
                role: 'STUDENT',
                classroomId: classroom.id
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                classroomId: true
            }
        });

        console.log('Encontrados:', studentsByClassroomId.length);
        studentsByClassroomId.forEach(s => {
            console.log('  -', s.firstName, s.lastName, '(classroomId:', s.classroomId, ')');
        });

        // 3. Buscar inscripciones en student_classrooms
        console.log('\n--- MÉTODO 2: Inscripciones en student_classrooms ---');
        const enrollments = await prisma.studentClassroom.findMany({
            where: {
                classroomId: classroom.id,
                isActive: true
            },
            include: {
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            }
        });

        console.log('Encontrados:', enrollments.length);
        enrollments.forEach(e => {
            console.log('  -', e.student.firstName, e.student.lastName, '(enrollmentId:', e.id, ')');
        });

        // 4. Simular la query del endpoint getStudents
        console.log('\n--- MÉTODO 3: Simulando endpoint getStudents ---');
        const where = {
            instituteId: 'institute',
            role: 'STUDENT',
            isActive: true,
            classroomId: classroom.id
        };

        const students = await prisma.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
                studentCode: true,
                isActive: true,
                classroomId: true,
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true,
                    },
                },
            },
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' },
            ],
        });

        console.log('Encontrados:', students.length);
        students.forEach(s => {
            console.log('  -', s.firstName, s.lastName);
            console.log('    ID:', s.id);
            console.log('    Email:', s.email);
            console.log('    classroomId:', s.classroomId);
            console.log('    classroom:', s.classroom?.name || 'null');
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
