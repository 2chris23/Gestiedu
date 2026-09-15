/**
 * DEVOLVER UN LICEO A COMO ESTABA
 *
 *   npm run restore:tenant -- --slug=liceo-bolivar --confirmar
 *   npm run restore:tenant -- --slug=liceo-bolivar --archivo=backups/liceo-bolivar__2026-09-12T03-00-00.dump --confirmar
 *
 * Sin `--confirmar` solo dice qué haría. **Restaurar borra lo que el liceo tenga
 * ahora y lo reemplaza por lo del archivo**: todo lo que se haya hecho desde ese
 * respaldo se pierde. Por eso hay que escribirlo a mano.
 *
 * Solo toca la base de ESE liceo. Los demás no se enteran.
 */

import path from 'path';
import { platformPrisma, disconnectAll } from '../config/database';
import { buildTenantDatabaseUrl } from '../config/tenant-db-url';
import { restaurarLiceo, ultimoRespaldoDe } from '../services/respaldos.service';

function argumento(nombre: string): string | undefined {
    const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
    return encontrado ? encontrado.split('=').slice(1).join('=') : undefined;
}

async function main() {
    const slug = argumento('slug');
    const confirmado = process.argv.includes('--confirmar');

    if (!slug) {
        console.error('\nFalta el liceo:  npm run restore:tenant -- --slug=<liceo> --confirmar\n');
        process.exit(1);
    }

    const instituto = await platformPrisma.institute.findFirst({
        where: { slug },
        select: {
            slug: true,
            name: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
    });

    if (!instituto || !instituto.databaseName) {
        console.error(`\nNo existe el liceo "${slug}" o no tiene base de datos propia.\n`);
        process.exit(1);
    }

    const archivo = argumento('archivo') ?? ultimoRespaldoDe(slug);
    if (!archivo) {
        console.error(`\nNo hay ningún respaldo guardado de "${slug}".\n`);
        process.exit(1);
    }

    console.log(`\nLiceo:    ${instituto.name} (${slug})`);
    console.log(`Base:     ${instituto.databaseName}`);
    console.log(`Archivo:  ${path.basename(archivo)}`);

    if (!confirmado) {
        console.log('\nEsto NO se ha hecho todavía.');
        console.log('Restaurar borra lo que el liceo tenga ahora y lo deja como en ese archivo:');
        console.log('todo lo trabajado desde entonces se pierde.');
        console.log('\nSi es lo que quieres, repite el comando añadiendo  --confirmar\n');
        await disconnectAll().catch(() => undefined);
        return;
    }

    const url = buildTenantDatabaseUrl(
        {
            databaseName: instituto.databaseName,
            databaseHost: instituto.databaseHost,
            databasePort: instituto.databasePort,
            databaseUser: instituto.databaseUser,
            databasePassword: instituto.databasePassword,
        } as any,
        'direct'
    );

    console.log('\nRestaurando...');
    await restaurarLiceo(archivo, url);
    console.log(`\n✔ "${instituto.name}" quedó como en ${path.basename(archivo)}\n`);

    await disconnectAll().catch(() => undefined);
}

main().catch(async (error) => {
    console.error('\nLa restauración falló:', error instanceof Error ? error.message : error, '\n');
    await disconnectAll().catch(() => undefined);
    process.exit(1);
});
