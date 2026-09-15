/**
 * VACIAR LO VIEJO DE LA PAPELERA
 *
 * La papelera guarda una copia de todo lo que se borra. Si no se limpia nunca,
 * crece para siempre. Aquí se tira lo que lleva más de `PAPELERA_DIAS` días (90
 * por defecto) en todos los liceos activos.
 *
 * Lo de antes de esa fecha lo guarda el respaldo, que es donde tiene que estar.
 *
 *   npm run papelera:limpiar
 */
import { getTenantPrisma, platformPrisma, disconnectAll } from '../config/database';
import { limpiarPapeleraVieja, diasQueSeGuardaLoBorrado } from '../utils/papelera';
import { logger } from '../utils/logger';

async function principal(): Promise<void> {
    const dias = diasQueSeGuardaLoBorrado();
    const liceos = await platformPrisma.institute.findMany({
        where: { status: 'ACTIVE' as any },
        orderBy: { slug: 'asc' },
    });

    console.log(`Vaciando lo que lleva más de ${dias} días en la papelera de ${liceos.length} liceos...\n`);

    let total = 0;
    let fallidos = 0;

    for (const liceo of liceos) {
        try {
            const prisma = await getTenantPrisma(liceo.id);
            const cuantas = await limpiarPapeleraVieja(prisma, dias);
            total += cuantas;
            console.log(`  ${liceo.slug.padEnd(30)} ${cuantas} registros tirados`);
        } catch (error) {
            fallidos++;
            console.log(`  ${liceo.slug.padEnd(30)} FALLÓ`);
            logger.error('No se pudo limpiar la papelera de un liceo', {
                slug: liceo.slug,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    console.log(`\n${total} registros tirados` + (fallidos ? ` · ${fallidos} liceos con error` : ''));
    if (fallidos) process.exitCode = 1;
}

principal()
    .catch((error) => {
        logger.error('La limpieza de la papelera no pudo completarse', {
            error: error instanceof Error ? error.message : String(error),
        });
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectAll();
        await platformPrisma.$disconnect();
    });
