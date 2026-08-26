const { Client } = require('pg');

async function cleanupFailedInstitute() {
    const dbUrl = process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gestion_escolar_platform';
    const dbUrlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);

    const dbUser = dbUrlMatch ? dbUrlMatch[1] : 'postgres';
    const dbPassword = dbUrlMatch ? dbUrlMatch[2] : 'postgres';
    const dbHost = dbUrlMatch ? dbUrlMatch[3] : 'localhost';
    const dbPort = dbUrlMatch ? parseInt(dbUrlMatch[4]) : 5432;

    const client = new Client({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: 'postgres'
    });

    try {
        await client.connect();
        console.log('✅ Conectado a PostgreSQL');

        // Terminar conexiones activas
        console.log('🔌 Terminando conexiones activas...');
        await client.query(`
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = 'tenant_san_miguel'
            AND pid <> pg_backend_pid();
        `);

        // Eliminar la base de datos
        console.log('🗑️  Eliminando base de datos tenant_san_miguel...');
        await client.query('DROP DATABASE IF EXISTS tenant_san_miguel');
        console.log('✅ Base de datos eliminada exitosamente');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

cleanupFailedInstitute()
    .then(() => {
        console.log('\n🎉 Limpieza completada');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
