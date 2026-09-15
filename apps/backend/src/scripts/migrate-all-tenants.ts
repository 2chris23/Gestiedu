/**
 * Aplica las migraciones pendientes a la base de datos de TODOS los liceos.
 *
 * Se ejecuta al publicar una versión, después de migrar la base de plataforma:
 *   npm run migrate:tenants
 *
 * Termina con código 1 si algún liceo falla, para que el despliegue se detenga
 * y no queden liceos con un esquema viejo frente a un código nuevo.
 *
 * Opciones:
 *   --status        solo muestra en qué versión está cada liceo, sin migrar
 *   --concurrency=N migra N liceos a la vez (por defecto 1)
 */
import 'dotenv/config';
import { platformPrisma } from '../config/database';
import {
    getAllTenantMigrationStatus,
    migrateAllTenants,
    listLocalMigrations,
} from '../services/tenant-migrations.service';

async function showStatus(): Promise<number> {
    const { localMigrations, tenants } = await getAllTenantMigrationStatus();
    console.log(`Migraciones en el código: ${localMigrations.length}`);
    console.log('');
    let behind = 0;
    for (const t of tenants) {
        const estado = t.error
            ? `ERROR: ${t.error}`
            : t.upToDate
              ? 'al día'
              : `faltan ${t.pending.length}${t.failed.length ? ` · ${t.failed.length} fallidas` : ''}`;
        if (t.error || !t.upToDate) behind++;
        console.log(`  ${t.slug.padEnd(28)} ${String(t.applied).padStart(3)} aplicadas   ${estado}`);
    }
    console.log('');
    console.log(behind === 0 ? 'Todos los liceos están al día.' : `${behind} de ${tenants.length} liceos necesitan migrarse.`);
    return behind === 0 ? 0 : 1;
}

async function main(): Promise<number> {
    const args = process.argv.slice(2);

    if (args.includes('--status')) return showStatus();

    const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));
    const concurrency = concurrencyArg ? Number(concurrencyArg.split('=')[1]) : 1;

    console.log(`Aplicando ${listLocalMigrations().length} migraciones del código a todos los liceos activos...`);
    const report = await migrateAllTenants({ concurrency });

    for (const r of report.results) {
        const marca = r.ok ? (r.retried ? 'OK (2º intento)' : 'OK') : 'FALLÓ';
        console.log(`  ${r.slug.padEnd(28)} ${marca}`);
        if (!r.ok) console.log(`      ${r.message.split('\n').slice(0, 4).join('\n      ')}`);
    }

    console.log('');
    console.log(
        `${report.migrated} de ${report.total} liceos migrados en ${(report.durationMs / 1000).toFixed(1)} s` +
            (report.failed.length ? ` · ${report.failed.length} con error` : '')
    );

    return report.failed.length === 0 ? 0 : 1;
}

main()
    .then(async (code) => {
        await platformPrisma.$disconnect();
        process.exit(code);
    })
    .catch(async (error) => {
        console.error('ERROR:', error instanceof Error ? error.message : error);
        await platformPrisma.$disconnect().catch(() => {});
        process.exit(1);
    });
