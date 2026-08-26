const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkAcademicYears() {
    try {
        const academicYears = await prisma.academicYear.findMany({
            orderBy: {
                startDate: 'desc'
            },
            select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
                _count: {
                    select: {
                        classrooms: true,
                        enrollments: true
                    }
                }
            }
        });

        console.log('\n=== CICLOS ESCOLARES EN LA BASE DE DATOS ===\n');

        if (academicYears.length === 0) {
            console.log('❌ No hay ciclos escolares en la base de datos');
        } else {
            console.log(`✅ Total de ciclos escolares: ${academicYears.length}\n`);

            academicYears.forEach((year, index) => {
                console.log(`${index + 1}. ${year.name}`);
                console.log(`   ID: ${year.id}`);
                console.log(`   Período: ${year.startDate} - ${year.endDate}`);
                console.log(`   Estado: ${year.status}`);
                console.log(`   Secciones: ${year._count.classrooms}`);
                console.log(`   Inscripciones: ${year._count.enrollments}`);
                console.log('');
            });
        }

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error al consultar la base de datos:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

checkAcademicYears();
