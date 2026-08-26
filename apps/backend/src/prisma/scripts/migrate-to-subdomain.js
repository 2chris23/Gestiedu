require('dotenv').config();
const { Client } = require('pg');

async function migrateToSubdomain() {
    // Extraer credenciales del PLATFORM_DATABASE_URL
    const dbUrl = process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL;
    const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);

    if (!match) {
        console.error('❌ No se pudo parsear PLATFORM_DATABASE_URL');
        process.exit(1);
    }

    const [, user, password, host, port, database] = match;

    const client = new Client({
        user,
        password,
        host,
        port: parseInt(port),
        database
    });

    try {
        await client.connect();
        console.log(`🔌 Conectado a PostgreSQL - DB: ${database}`);

        // 1. Verificar institutos existentes
        console.log('\n📊 Institutos existentes:');
        const existing = await client.query(`
            SELECT id, name, slug, port, "isLocal", subdomain, domain 
            FROM institutes
        `);
        console.table(existing.rows);

        // 2. Actualizar subdomain basado en slug
        console.log('\n🔄 Actualizando subdomain...');
        await client.query(`
            UPDATE institutes 
            SET subdomain = slug 
            WHERE subdomain IS NULL
        `);

        // 3. Agregar columna environment
        console.log('➕ Agregando columna environment...');
        await client.query(`
            ALTER TABLE institutes 
            ADD COLUMN IF NOT EXISTS environment VARCHAR(255) DEFAULT 'development'
        `);

        // 4. Renombrar domain a customDomain
        console.log('🔄 Renombrando domain a customDomain...');
        const hasCustomDomain = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'institutes' AND column_name = 'customDomain'
        `);

        if (hasCustomDomain.rows.length === 0) {
            await client.query(`
                ALTER TABLE institutes 
                RENAME COLUMN domain TO "customDomain"
            `);
        }

        // 5. Eliminar columnas obsoletas
        console.log('🗑️  Eliminando columnas obsoletas (port, isLocal)...');
        await client.query(`
            ALTER TABLE institutes 
            DROP COLUMN IF EXISTS port CASCADE
        `);
        await client.query(`
            ALTER TABLE institutes 
            DROP COLUMN IF EXISTS "isLocal" CASCADE
        `);

        // 6. Hacer subdomain NOT NULL
        console.log('🔒 Haciendo subdomain NOT NULL...');
        await client.query(`
            ALTER TABLE institutes 
            ALTER COLUMN subdomain SET NOT NULL
        `);

        // 7. Actualizar índices
        console.log('📇 Actualizando índices...');
        await client.query(`DROP INDEX IF EXISTS "institutes_port_idx"`);
        await client.query(`CREATE INDEX IF NOT EXISTS "institutes_subdomain_idx" ON institutes(subdomain)`);
        await client.query(`CREATE INDEX IF NOT EXISTS "institutes_environment_idx" ON institutes(environment)`);

        // 8. Verificar resultado
        console.log('\n✅ Migración completada. Resultado:');
        const result = await client.query(`
            SELECT id, name, slug, subdomain, "customDomain", environment, status 
            FROM institutes
        `);
        console.table(result.rows);

    } catch (error) {
        console.error('❌ Error durante migración:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrateToSubdomain();
