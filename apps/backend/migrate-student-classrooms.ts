/**
 * SCRIPT DE MIGRACIÓN DE DATOS: School Archivist
 * 
 * Este script migra los datos existentes de StudentClassroom para agregarles
 * el campo academicYearId basándose en el academicYearId del Classroom relacionado.
 * 
 * IMPORTANTE: Ejecutar ANTES de aplicar la migración de Prisma que agrega
 * la restricción @@unique([studentId, academicYearId])
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateStudentClassrooms() {
    console.log('🚀 Iniciando migración de StudentClassroom con academicYearId...\n');

    try {
        // 1. Obtener todos los StudentClassroom sin academicYearId
        const enrollments = await prisma.studentClassroom.findMany({
            where: {
                academicYearId: null, // Solo migrar los que no tienen año académico
            },
            include: {
                classroom: {
                    select: {
                        id: true,
                        academicYearId: true,
                        name: true,
                    },
                },
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        console.log(`📊 Encontrados ${enrollments.length} enrollments sin academicYearId\n`);

        if (enrollments.length === 0) {
            console.log('✅ No hay enrollments que migrar. La base de datos está actualizada.\n');
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: Array<{ enrollmentId: string; error: string }> = [];

        // 2. Actualizar cada enrollment con el academicYearId del classroom
        for (const enrollment of enrollments) {
            try {
                const academicYearId = enrollment.classroom.academicYearId;

                if (!academicYearId) {
                    const errorMsg = `Classroom ${enrollment.classroom.name} no tiene academicYearId asignado`;
                    console.log(`⚠️  ${errorMsg}`);
                    errors.push({ enrollmentId: enrollment.id, error: errorMsg });
                    errorCount++;
                    continue;
                }

                await prisma.studentClassroom.update({
                    where: { id: enrollment.id },
                    data: { academicYearId },
                });

                console.log(
                    `✅ Migrado: ${enrollment.student.firstName} ${enrollment.student.lastName} ` +
                    `→ ${enrollment.classroom.name} (Year ID: ${academicYearId.slice(0, 8)}...)`
                );
                successCount++;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                console.log(`❌ Error migrando enrollment ${enrollment.id}: ${errorMsg}`);
                errors.push({ enrollmentId: enrollment.id, error: errorMsg });
                errorCount++;
            }
        }

        // 3. Mostrar resumen
        console.log('\n' + '='.repeat(60));
        console.log('📈 RESUMEN DE MIGRACIÓN');
        console.log('='.repeat(60));
        console.log(`✅ Exitosos: ${successCount}`);
        console.log(`❌ Errores: ${errorCount}`);
        console.log(`📊 Total: ${enrollments.length}`);

        if (errors.length > 0) {
            console.log('\n⚠️  ENROLLMENTS CON ERRORES:');
            errors.forEach(({ enrollmentId, error }) => {
                console.log(`   - ${enrollmentId}: ${error}`);
            });
            console.log('\n⚠️  Estos enrollments necesitan intervención manual.');
        }

        if (successCount === enrollments.length) {
            console.log('\n🎉 Migración completada exitosamente!');
            console.log('✅ Ahora puedes ejecutar: npx prisma migrate dev --name add_academic_year_to_enrollment');
        } else {
            console.log('\n⚠️  Migración completada con errores.');
            console.log('⚠️  Revisa los errores antes de aplicar la migración de Prisma.');
        }

    } catch (error) {
        console.error('\n❌ Error fatal durante la migración:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Ejecutar migración
migrateStudentClassrooms()
    .then(() => {
        console.log('\n✅ Script de migración finalizado.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error ejecutando script:', error);
        process.exit(1);
    });
