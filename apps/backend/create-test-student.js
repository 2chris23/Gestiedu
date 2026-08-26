// Script para crear estudiante de prueba y asignarlo a una sección
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    console.log('=== CREANDO ESTUDIANTE DE PRUEBA ===\n');

    try {
        // 1. Obtener el ciclo escolar 2025-2026
        const academicYear = await prisma.academicYear.findFirst({
            where: { name: { contains: '2025-2026' } }
        });

        if (!academicYear) {
            console.error('❌ No se encontró el ciclo escolar 2025-2026');
            return;
        }

        console.log('✅ Ciclo escolar encontrado:', academicYear.name, '(ID:', academicYear.id, ')');

        // 2. Obtener la sección "1er Año A"
        const classroom = await prisma.classroom.findFirst({
            where: {
                academicYearId: academicYear.id,
                grade: 1,
                section: 'A'
            }
        });

        if (!classroom) {
            console.error('❌ No se encontró la sección 1er Año A');
            return;
        }

        console.log('✅ Sección encontrada:', classroom.name, '(ID:', classroom.id, ')');

        // 3. Crear estudiante de prueba
        const hashedPassword = await bcrypt.hash('test123', 10);

        const student = await prisma.user.create({
            data: {
                id: 'V99999999', // Cédula de prueba
                firstName: 'Pedro',
                lastName: 'Martínez',
                email: 'pedro.martinez@test.com',
                password: hashedPassword,
                role: 'STUDENT',
                instituteId: 'institute',
                isActive: true,
                studentCode: 'EST-2025-001'
            }
        });

        console.log('✅ Estudiante creado:', student.firstName, student.lastName, '(ID:', student.id, ')');

        // 4. Inscribir estudiante en la sección
        const enrollment = await prisma.studentClassroom.create({
            data: {
                studentId: student.id,
                classroomId: classroom.id,
                academicYearId: academicYear.id,
                isActive: true,
                enrollmentDate: new Date()
            }
        });

        console.log('✅ Inscripción creada (ID:', enrollment.id, ')');

        // 5. Actualizar classroomId en User (para compatibilidad)
        await prisma.user.update({
            where: { id: student.id },
            data: { classroomId: classroom.id }
        });

        console.log('✅ Campo classroomId actualizado en User');

        console.log('\n=== ✅ PROCESO COMPLETADO EXITOSAMENTE ===');
        console.log('Estudiante:', student.firstName, student.lastName);
        console.log('Cédula:', student.id);
        console.log('Email:', student.email);
        console.log('Contraseña: test123');
        console.log('Sección:', classroom.name);
        console.log('Ciclo:', academicYear.name);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 'P2002') {
            console.error('El estudiante ya existe. Usa otra cédula o email.');
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
