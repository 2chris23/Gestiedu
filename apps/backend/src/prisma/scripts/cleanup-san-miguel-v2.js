require('dotenv').config();
const { Client } = require('pg');

async function cleanup() {
    // Extraer credenciales del DATABASE_URL
    const dbUrl = process.env.DATABASE_URL || process.env.PLATFORM_DATABASE_URL;
    const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\//);

    if (!match) {
        console.error('❌ No se pudo parsear DATABASE_URL');
        process.exit(1);
    }

    const [, user, password, host, port] = match;
    const dbName = 'tenant_san_miguel';

    const client = new Client({
        user,
        password,
        host,
        port: parseInt(port),
        database: 'postgres'
    });

    try {
        await client.connect();
        console.log(`🔌 Conectado a PostgreSQL`);

        // Terminar conexiones activas
        await client.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()
        `, [dbName]);
        console.log(`✅ Conexiones terminadas`);

        // Eliminar base de datos
        await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        console.log(`✅ Base de datos "${dbName}" eliminada`);

        // Verificar
        const result = await client.query(`
            SELECT 1 FROM pg_database WHERE datname = $1
        `, [dbName]);

        if (result.rows.length === 0) {
            console.log(`✅ Verificado: "${dbName}" ya no existe`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

cleanup();
