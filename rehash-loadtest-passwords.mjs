/**
 * REHASH LOAD TEST PASSWORDS - Cost 12 → Cost 8
 * ===============================================
 * Script one-time para reducir el costo de bcrypt de los usuarios
 * del tenant 'test-load-5k' de 12 a 8.
 *
 * - Cost 12 → ~250ms por bcrypt.compare  → saturación del event loop
 * - Cost  8 → ~25ms  por bcrypt.compare  → 10x más rápido
 *
 * ARQUITECTURA: Multi-tenant — cada instituto tiene su propia DB.
 * La DB del tenant test-load-5k se llama 'tenant_test_load_5k'.
 *
 * EJECUTAR (desde la raíz del proyecto):
 *   node rehash-loadtest-passwords.mjs
 *
 * TIEMPO ESTIMADO: ~5 segundos (UPDATE masivo con hash pre-generado)
 * USUARIOS AFECTADOS: ~15,250 (5000 estudiantes + 10000 tutores + 200 teachers + 50 admins)
 */

import bcrypt from 'bcrypt';
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { Pool } = pg;

// ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
const PLAIN_PASSWORD = 'Test123!';  // Password de todos los usuarios del load test
const NEW_COST = 8;                 // Reducido de 12 → 8 (10x más rápido)
const TENANT_DB_NAME = 'tenant_test_load_5k';

// Lee la PLATFORM_DATABASE_URL del .env del backend
// y construye la URL para la DB del tenant
function getTenantDbUrl() {
    const envFiles = [
        './apps/backend/.env',
        './apps/backend/.env.local',
        './.env',
    ];

    let platformUrl = process.env.PLATFORM_DATABASE_URL;

    if (!platformUrl) {
        for (const envFile of envFiles) {
            try {
                const content = readFileSync(resolve(envFile), 'utf-8');
                const match = content.match(/^PLATFORM_DATABASE_URL=["']?(.+?)["']?\s*$/m);
                if (match) {
                    platformUrl = match[1].trim();
                    console.log(`📄 Usando: ${envFile}`);
                    break;
                }
            } catch { /* continuar */ }
        }
    }

    if (!platformUrl) {
        // Fallback: usar el default del seed
        platformUrl = 'postgresql://postgres:megustaelcoco2003@localhost:5432/gestion_escolar_platform';
        console.log(`⚠️  PLATFORM_DATABASE_URL no encontrada, usando default: ${platformUrl.replace(/:[^:@]+@/, ':***@')}`);
    }

    // Reemplazar el nombre de la DB por el tenant
    const tenantUrl = platformUrl.replace(/\/[^/?]+(\?|$)/, `/${TENANT_DB_NAME}$1`);
    return tenantUrl;
}

async function main() {
    console.log('🚀 Rehash Load Test Passwords');
    console.log(`   Tenant DB: ${TENANT_DB_NAME}`);
    console.log(`   Cost nuevo: ${NEW_COST} (~25ms vs ~250ms con cost 12)`);
    console.log(`   Password: ${PLAIN_PASSWORD}`);
    console.log('');

    // Pre-generar el nuevo hash UNA SOLA VEZ
    // (todos tienen la misma password → un UPDATE masivo es suficiente)
    console.log(`⏳ Generando nuevo hash con cost=${NEW_COST}...`);
    const newHash = await bcrypt.hash(PLAIN_PASSWORD, NEW_COST);
    console.log(`✅ Hash generado: ${newHash.substring(0, 20)}...`);
    console.log('');

    const tenantUrl = getTenantDbUrl();
    const safeUrl = tenantUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`🔌 Conectando a: ${safeUrl}`);

    const pool = new Pool({ connectionString: tenantUrl });

    try {
        // Verificar conexión
        await pool.query('SELECT 1');
        console.log('✅ Conexión establecida\n');

        // Contar usuarios actuales
        const countResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const total = parseInt(countResult.rows[0].total);
        console.log(`📊 Total de usuarios en la DB: ${total}`);

        // Ver muestra de hashes actuales para confirmar cost
        const sampleResult = await pool.query('SELECT password FROM users LIMIT 1');
        if (sampleResult.rows.length > 0) {
            const existingHash = sampleResult.rows[0].password;
            console.log(`   Hash actual (muestra): ${existingHash.substring(0, 25)}...`);
            const costMatch = existingHash.match(/\$2[ab]\$(\d+)\$/);
            if (costMatch) {
                console.log(`   Cost actual detectado: ${costMatch[1]}`);
                if (parseInt(costMatch[1]) === NEW_COST) {
                    console.log(`\n✅ ¡Los usuarios ya tienen cost=${NEW_COST}! No es necesario re-hashear.`);
                    console.log('   Puedes ejecutar el test K6 directamente.');
                    return;
                }
            }
        }

        console.log('');
        console.log(`⏳ Actualizando ${total} contraseñas...`);
        console.log('   (UPDATE masivo — todos tienen la misma password)\n');

        const startTime = Date.now();

        // Un solo UPDATE masivo — eficiente porque todos usan la misma contraseña
        const updateResult = await pool.query(
            'UPDATE users SET password = $1',
            [newHash]
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ ${updateResult.rowCount} usuarios actualizados en ${elapsed}s`);
        console.log('');
        console.log('🎉 Re-hash completado exitosamente!');
        console.log(`   Antes: cost=12 → ~250ms por bcrypt.compare`);
        console.log(`   Ahora: cost=${NEW_COST}  → ~25ms  por bcrypt.compare`);
        console.log(`   Mejora: ${Math.round(250 / 25)}x más rápido`);
        console.log('');
        console.log('▶️  Pasos siguientes:');
        console.log('   1. Reinicia el backend (para que no quede caché de bcrypt)');
        console.log('   2. Ejecuta el test K6:');
        console.log('      cd load-tests && k6 run --env API_URL=http://localhost:3001 --env INSTITUTE_SLUG=test-load-5k basic-test-5k.js');

    } catch (err) {
        console.error('\n❌ Error durante la conexión o actualización:');
        console.error('   ', err.message);
        if (err.message.includes('does not exist') || err.message.includes('ECONNREFUSED')) {
            console.error('');
            console.error('💡 Posibles causas:');
            console.error('   - La DB "tenant_test_load_5k" no existe (¿ejecutaste el seed?)');
            console.error('   - PostgreSQL no está corriendo');
            console.error('   - Las credenciales del .env son incorrectas');
        }
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
