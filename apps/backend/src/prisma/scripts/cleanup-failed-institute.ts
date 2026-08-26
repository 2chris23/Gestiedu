import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';

// Usar el cliente de Prisma con el schema de platform
const platformPrisma = new PrismaClient({
    datasourceUrl: process.env.PLATFORM_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform'
});



async function cleanupFailedInstitute() {
    const instituteCode = 'IED'; // Instituto Educativo Demo

    try {
        console.log(`🧹 Limpiando instituto con código: ${instituteCode}`);

        // 1. Buscar el instituto
        const institute = await platformPrisma.institute.findFirst({
            where: { code: instituteCode }
        });

        if (!institute) {
            console.log('❌ Instituto no encontrado');
            return;
        }

        console.log(`📋 Instituto encontrado: ${institute.name}`);
        console.log(`📦 Base de datos: ${institute.databaseName}`);

        // 2. Eliminar la base de datos del tenant si existe
        if (institute.databaseName) {
            try {
                const adminClient = new Client({
                    host: 'localhost',
                    port: 5432,
                    user: 'postgres',
                    password: 'postgres',
                    database: 'postgres'
                });

                await adminClient.connect();

                // Terminar conexiones activas
                await adminClient.query(`
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = '${institute.databaseName}'
                    AND pid <> pg_backend_pid();
                `);

                // Eliminar la base de datos
                await adminClient.query(`DROP DATABASE IF EXISTS "${institute.databaseName}"`);
                await adminClient.end();

                console.log(`✅ Base de datos eliminada: ${institute.databaseName}`);
            } catch (dbError) {
                console.error('⚠️  Error al eliminar base de datos:', dbError);
            }
        }

        // 3. Eliminar el instituto de la plataforma
        await platformPrisma.institute.delete({
            where: { id: institute.id }
        });

        console.log(`✅ Instituto eliminado de la plataforma`);
        console.log('');
        console.log('🎉 Limpieza completada exitosamente');

    } catch (error) {
        console.error('❌ Error en limpieza:', error);
        throw error;
    } finally {
        await platformPrisma.$disconnect();
    }
}

cleanupFailedInstitute()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
