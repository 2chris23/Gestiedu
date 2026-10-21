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
import { PrismaClient } from '@prisma/client';
import { platformPrisma, disconnectAll, invalidateTenantCache } from '../config/database';
import { conLiceo } from '../config/ambito-del-liceo';
import { esquemaPropio, fijarElEsquema } from '../config/esquema-del-liceo';
import { connectRedis, disconnectRedis, redis, RedisCache } from '../config/redis';
import { buildTenantDatabaseUrl } from '../config/tenant-db-url';
import { apuntarLaRestauracion, laUltimaMarca } from '../services/precarga.service';
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
            id: true,
            slug: true,
            name: true,
            databaseName: true,
            databaseSchema: true,
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
            databaseSchema: instituto.databaseSchema,
        } as any,
        'direct'
    );
    // Un cliente propio y no `getTenantPrisma`: ese se niega con un liceo
    // suspendido, y restaurar uno suspendido tiene que poder hacerse.
    const delLiceo = () => {
        const cliente = new PrismaClient({ datasources: { db: { url } } });
        const esquema = esquemaPropio(instituto.databaseSchema);
        return esquema ? fijarElEsquema(cliente, esquema) : cliente;
    };

    // La marca de los cambios de ANTES de restaurar: los teléfonos van por ahí.
    const antesDeRestaurar = delLiceo();
    const antes = await laUltimaMarca(antesDeRestaurar);
    await antesDeRestaurar.$disconnect();

    console.log('\nRestaurando...');
    await restaurarLiceo(archivo, url);

    // Las tablas son nuevas: ningún cliente guardado vale, se abre otro.
    await invalidateTenantCache(instituto.id);
    const despues = delLiceo();
    await apuntarLaRestauracion(despues, antes);
    await despues.$disconnect();
    console.log(`\n✔ "${instituto.name}" quedó como en ${path.basename(archivo)}`);
    console.log('  Los teléfonos lo bajarán todo otra vez al conectarse.');

    // Lo guardado en la memoria rápida es de lo que se acaba de deshacer.
    // Con un tope: con Redis caído, el cliente reintenta para siempre.
    try {
        await Promise.race([
            (async () => {
                await connectRedis();
                if (redis.status !== 'ready') throw new Error('sin Redis');
                await conLiceo(instituto.id, () => RedisCache.clearPattern('*'));
            })(),
            new Promise((_, no) => setTimeout(() => no(new Error('Redis no contesta')), 5000)),
        ]);
        console.log('  Memoria rápida del liceo vaciada.');
    } catch {
        console.log('  ⚠ No se pudo vaciar la memoria rápida.');
    }
    await disconnectRedis().catch(() => undefined);
    console.log('  Reinicia la API (docker compose restart backend): ningún proceso debe seguir con lo de antes en su memoria.\n');

    await disconnectAll().catch(() => undefined);
}

main().then(() => process.exit(0)).catch(async (error) => {
    console.error('\nLa restauración falló:', error instanceof Error ? error.message : error, '\n');
    await disconnectAll().catch(() => undefined);
    process.exit(1);
});
