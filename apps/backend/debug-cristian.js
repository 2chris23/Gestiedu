// Script temporal para consultar datos de Cristian en la base de datos
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('=== CONSULTANDO DATOS DE CRISTIAN ===\n');

    // 1. Buscar usuario Cristian
    const users = await prisma.user.findMany({
        where: {
            OR: [
                { firstName: { contains: 'Cristian' } },
                { lastName: { contains: 'Cristian' } },
                { firstName: { contains: 'cristian' } },
                { lastName: { contains: 'cristian' } }
            ]
        },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
            classroomId: true,
            studentCode: true
        }
    });

    console.log('1. USUARIOS ENCONTRADOS:');
    console.log(JSON.stringify(users, null, 2));

    if (users.length > 0) {
        const cristianId = users[0].id;

        // 2. Buscar inscripciones en student_classrooms
        console.log('\n2. INSCRIPCIONES EN STUDENT_CLASSROOMS:');
        const enrollments = await prisma.studentClassroom.findMany({
            where: { studentId: cristianId },
            include: {
                classroom: {
                    select: { id: true, name: true, grade: true, section: true }
                },
                academicYear: {
                    select: { id: true, name: true, status: true }
                }
            }
        });
        console.log(JSON.stringify(enrollments, null, 2));

        // 3. Listar años académicos
        console.log('\n3. AÑOS ACADÉMICOS:');
        const academicYears = await prisma.academicYear.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log(JSON.stringify(academicYears, null, 2));

        // 4. Listar secciones (classrooms)
        console.log('\n4. SECCIONES (CLASSROOMS):');
        const classrooms = await prisma.classroom.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                name: true,
                grade: true,
                section: true,
                academicYearId: true,
                isActive: true
            }
        });
        console.log(JSON.stringify(classrooms, null, 2));
    }

    await prisma.$disconnect();
}

main().catch(console.error);
