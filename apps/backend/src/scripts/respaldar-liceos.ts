/**
 * RESPALDAR TODOS LOS LICEOS
 *
 *   npm run backup:tenants            ← guarda todos y limpia los viejos
 *   npm run backup:tenants -- --keep  ← guarda todos sin borrar nada
 *
 * Pensado para correr solo, una vez al día, desde el programador de tareas del
 * servidor. Si algún liceo falla, termina con error para que la tarea programada
 * lo avise: un respaldo que falla en silencio es peor que no tenerlo, porque da
 * una tranquilidad que no es real.
 *
 * Hace falta tener `pg_dump` a mano. Si no está en el PATH (en Windows no suele
 * estarlo), se indica con PG_BIN_DIR:
 *
 *   PG_BIN_DIR="C:/Program Files/PostgreSQL/17/bin"
 */

import { limpiarRespaldosViejos, respaldarTodos, diasQueSeGuardan } from '../services/respaldos.service';
import { disconnectAll } from '../config/database';
import { logger } from '../utils/logger';

const mb = (bytes = 0) => (bytes / 1024 / 1024).toFixed(1);

async function main() {
    const conservarTodo = process.argv.includes('--keep');

    console.log('\nRespaldando los liceos...\n');
    const informe = await respaldarTodos();

    for (const r of informe.resultados) {
        if (r.ok) {
            console.log(`  ✔ ${r.slug.padEnd(28)} ${mb(r.bytes).padStart(7)} MB   ${(r.ms / 1000).toFixed(1)}s`);
        } else {
            console.log(`  ✘ ${r.slug.padEnd(28)} ${r.error}`);
        }
    }

    console.log(
        `\n${informe.guardados} de ${informe.total} liceos guardados en ${informe.carpeta} ` +
            `(${(informe.ms / 1000).toFixed(1)}s)`
    );

    if (!conservarTodo) {
        const borrados = limpiarRespaldosViejos();
        if (borrados.length > 0) {
            console.log(`Se borraron ${borrados.length} respaldos de más de ${diasQueSeGuardan()} días.`);
        }
    }

    if (informe.fallidos.length > 0) {
        console.error(
            `\nFALLARON ${informe.fallidos.length}: ${informe.fallidos.map((f) => f.slug).join(', ')}`
        );
        await disconnectAll().catch(() => undefined);
        process.exit(1);
    }

    console.log('\nTodo respaldado.\n');
    await disconnectAll().catch(() => undefined);
}

main().catch(async (error) => {
    logger.error('El respaldo falló entero', {
        error: error instanceof Error ? error.message : String(error),
    });
    console.error('\nEl respaldo falló:', error instanceof Error ? error.message : error, '\n');
    await disconnectAll().catch(() => undefined);
    process.exit(1);
});
