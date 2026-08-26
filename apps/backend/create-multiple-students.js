// Script para crear MÚLTIPLES estudiantes de prueba de una vez
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// 📝 LISTA DE ESTUDIANTES A CREAR
// Edita esta lista para agregar más estudiantes
const ESTUDIANTES = [
    {
        cedula: 'V11111111',
        nombre: 'Ana',
        apellido: 'López',
        email: 'ana.lopez@test.com',
        codigo: 'EST-2025-002'
    },
    {
        cedula: 'V22222222',
        nombre: 'Carlos',
        apellido: 'Rodríguez',
        email: 'carlos.rodriguez@test.com',
        codigo: 'EST-2025-003'
    },
    {
        cedula: 'V33333333',
        nombre: 'Laura',
        apellido: 'Fernández',
        email: 'laura.fernandez@test.com',
        codigo: 'EST-2025-004'
    },
    {
        cedula: 'V44444444',
        nombre: 'Diego',
        apellido: 'García',
        email: 'diego.garcia@test.com',
        codigo: 'EST-2025-005'
    },
    {
        cedula: 'V55555555',
        nombre: 'Sofía',
        apellido: 'Ramírez',
        email: 'sofia.ramirez@test.com',
        codigo: 'EST-2025-006'
    }
];

async function main() {
    console.log('=== CREANDO ESTUDIANTES DE PRUEBA ===\n');

    const hashedPassword = await bcrypt.hash('test123', 10);

    let creados = 0;
    let errores = 0;

    for (const est of ESTUDIANTES) {
        try {
            // Verificar si ya existe
            const existe = await prisma.user.findUnique({
                where: { id: est.cedula }
            });

            if (existe) {
                console.log(`⚠️  ${est.nombre} ${est.apellido} (${est.cedula}) ya existe, saltando...`);
                continue;
            }

            // Crear estudiante
            const student = await prisma.user.create({
                data: {
                    id: est.cedula,
                    firstName: est.nombre,
                    lastName: est.apellido,
                    email: est.email,
                    password: hashedPassword,
                    role: 'STUDENT',
                    instituteId: 'institute',
                    isActive: true,
                    studentCode: est.codigo
                }
            });

            console.log(`✅ Creado: ${student.firstName} ${student.lastName} (${student.id})`);
            creados++;

        } catch (error) {
            console.error(`❌ Error creando ${est.nombre} ${est.apellido}:`, error.message);
            errores++;
        }
    }

    console.log('\n=== RESUMEN ===');
    console.log(`✅ Estudiantes creados: ${creados}`);
    console.log(`❌ Errores: ${errores}`);
    console.log(`📊 Total procesados: ${ESTUDIANTES.length}`);
    console.log('\n🔑 Contraseña para todos: test123');

    await prisma.$disconnect();
}

main();
