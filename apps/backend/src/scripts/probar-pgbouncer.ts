/**
 * PGBOUNCER, LEVANTADO DE VERDAD
 *
 * En `tenant-db-url.ts` estaba escrito que «el código ya está preparado
 * (`pgBouncer()`); falta levantarlo». Eso es una promesa sin comprobar, y las
 * promesas sin comprobar son justo las que se rompen el día del despliegue.
 *
 * PgBouncer es el repartidor que va delante de PostgreSQL. Importa porque aquí
 * hay **una base de datos por liceo**: sin repartidor, cada liceo abre su propio
 * grupo de conexiones y el servidor se queda sin cupo en cuanto hay unas
 * decenas. Con él, cientos de clientes comparten un puñado de conexiones reales.
 *
 * Esto es lo que este guion comprueba, con el repartidor levantado:
 *
 *   1. La dirección de uso normal apunta al repartidor y lleva `pgbouncer=true`
 *      (que es lo que le dice a Prisma que no use sentencias preparadas).
 *   2. La dirección de las migraciones **no** pasa por él: Prisma Migrate
 *      necesita conexión directa para sus bloqueos.
 *   3. Leer, escribir y una transacción funcionan a través del repartidor. Esto
 *      es lo que de verdad se rompe si el `pgbouncer=true` no estuviera.
 *   4. Cuántas conexiones REALES de PostgreSQL se gastan con muchos liceos
 *      abiertos a la vez, con repartidor y sin él. Ese número es el motivo de
 *      que exista.
 *
 * Cómo se levanta para probarlo (no hace falta el despliegue entero):
 *
 *   docker run -d --name gestiedu-pgbouncer -p 6432:6432 \
 *     -e DB_HOST=host.docker.internal -e DB_PORT=5432 \
 *     -e DB_USER=... -e DB_PASSWORD=... \
 *     -e POOL_MODE=transaction -e AUTH_TYPE=scram-sha-256 \
 *     -e IGNORE_STARTUP_PARAMETERS=extra_float_digits,options \
 *     edoburu/pgbouncer:latest
 *
 *   PGBOUNCER_HOST=localhost PGBOUNCER_PORT=6432 npm run probar:pgbouncer
 */
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';
import {
    buildTenantDatabaseUrl,
    pgBouncer,
    cabenLasConexiones,
    maskDatabaseUrl,
} from '../config/tenant-db-url';

const SLUG = process.env.LICEO || 'instituto-testing';

let bien = 0;
let mal = 0;

function comprobar(nombre: string, condicion: boolean, detalle = '') {
    if (condicion) {
        bien++;
        console.log(`    OK    ${nombre}${detalle ? `  —  ${detalle}` : ''}`);
    } else {
        mal++;
        console.log(`    FALLA ${nombre}${detalle ? `  —  ${detalle}` : ''}`);
    }
}

/** Cuántos procesos tiene PostgreSQL abiertos contra una base concreta. */
async function conexionesRealesContra(
    admin: { user: string; password: string; host: string; port: number },
    base: string
): Promise<number> {
    const c = new Client({ ...admin, database: 'postgres' });
    await c.connect();
    const r = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1`,
        [base]
    );
    await c.end();
    return Number(r.rows[0].n);
}

async function main() {
    const repartidor = pgBouncer();
    if (!repartidor) {
        console.error(
            '\n  PGBOUNCER_HOST no está puesto: no hay repartidor que probar.\n' +
            '  Levántalo y vuelve a llamar (la cabecera de este archivo dice cómo).\n'
        );
        process.exit(1);
    }

    const liceo = await platformPrisma.institute.findFirst({
        where: { slug: SLUG },
        select: {
            id: true,
            databaseName: true,
            databaseHost: true,
            databasePort: true,
            databaseUser: true,
            databasePassword: true,
        },
    });
    if (!liceo || !liceo.databaseName) {
        console.error(`  No existe el liceo «${SLUG}» o no tiene base.`);
        process.exit(1);
    }

    const admin = {
        user: liceo.databaseUser!,
        password: liceo.databasePassword!,
        host: liceo.databaseHost!,
        port: liceo.databasePort ?? 5432,
    };

    console.log(`\n  PgBouncer en ${repartidor.host}:${repartidor.port}\n`);

    // ── 1. La dirección de uso normal va al repartidor ───────────────────────
    console.log('  1. Las direcciones\n');
    const normal = buildTenantDatabaseUrl(liceo, 'runtime');
    const directa = buildTenantDatabaseUrl(liceo, 'direct');

    comprobar('la de uso normal apunta al repartidor', normal.includes(`@${repartidor.host}:${repartidor.port}/`));
    comprobar('lleva pgbouncer=true (sin sentencias preparadas)', normal.includes('pgbouncer=true'));
    comprobar('lleva el tope de conexiones del liceo', normal.includes('connection_limit='));
    comprobar(
        'la de migraciones NO pasa por el repartidor',
        directa.includes(`@${admin.host}:${admin.port}/`) && !directa.includes('pgbouncer=true'),
        maskDatabaseUrl(directa).split('@')[1]
    );
    comprobar(
        'la de migraciones no lleva tope de conexiones',
        !directa.includes('connection_limit='),
        'Prisma Migrate necesita la suya'
    );

    // ── 2. Trabajar de verdad a través del repartidor ────────────────────────
    console.log('\n  2. Leer, escribir y una transacción a través del repartidor\n');
    const db = new PrismaClient({ datasources: { db: { url: normal } } });
    try {
        await db.$connect();
        comprobar('conecta', true);

        const cuantos = await db.user.count();
        comprobar('lee', cuantos >= 0, `${cuantos} personas en el liceo`);

        // Una consulta cruda: es la que usa sentencias preparadas y la que
        // revienta si `pgbouncer=true` no estuviera puesto.
        const crudo = await db.$queryRawUnsafe<Array<{ n: bigint }>>('SELECT count(*) AS n FROM users');
        comprobar('una consulta cruda (sentencia preparada)', Number(crudo[0].n) === cuantos);

        // Escribir y deshacer. Una notificación no es información del liceo
        // —por eso queda fuera de la papelera— así que se puede crear y borrar
        // sin dejar rastro.
        const alguien = await db.user.findFirstOrThrow({ select: { id: true } });
        const escrita = await db.notification.create({
            data: {
                recipientId: alguien.id,
                title: 'prueba del repartidor',
                message: 'se borra sola',
                type: 'SYSTEM',
                priority: 'LOW',
            },
            select: { id: true },
        });
        comprobar('escribe', !!escrita.id);

        // Una transacción: en modo transacción el repartidor tiene que mantener
        // la MISMA conexión real durante toda ella, o esto falla.
        const enTransaccion = await db.$transaction(async (tx) => {
            await tx.notification.update({ where: { id: escrita.id }, data: { title: 'cambiada dentro' } });
            const leida = await tx.notification.findUnique({ where: { id: escrita.id }, select: { title: true } });
            return leida?.title;
        });
        comprobar('una transacción entera en la misma conexión', enTransaccion === 'cambiada dentro');

        await db.notification.delete({ where: { id: escrita.id } });
        comprobar('borra lo que escribió', true);
    } finally {
        await db.$disconnect();
    }

    // ── 3. El número que justifica todo esto ─────────────────────────────────
    console.log('\n  3. Conexiones REALES de PostgreSQL con varios liceos abiertos\n');

    const LICEOS = 10;
    const POZO = 2;

    const abrir = async (url: string) => {
        const cs = Array.from(
            { length: LICEOS },
            () => new PrismaClient({ datasources: { db: { url } } })
        );
        // Cada cliente hace trabajo a la vez: es cuando de verdad abre su grupo.
        await Promise.all(
            cs.map((c) => Promise.all(Array.from({ length: POZO * 2 }, () => c.user.count())))
        );
        return cs;
    };

    const antes = await conexionesRealesContra(admin, liceo.databaseName);

    const conRepartidor = await abrir(normal);
    const durante = await conexionesRealesContra(admin, liceo.databaseName);
    const gastadasConRepartidor = durante - antes;
    await Promise.all(conRepartidor.map((c) => c.$disconnect()));

    // La misma prueba sin repartidor: la dirección directa con el tope de
    // conexiones puesto, que es lo que construye el sistema con PGBOUNCER_HOST
    // vacío.
    const sinRepartidor = `${directa}&connection_limit=${POZO}`;
    await new Promise((r) => setTimeout(r, 1500));
    const antes2 = await conexionesRealesContra(admin, liceo.databaseName);
    const directos = await abrir(sinRepartidor);
    const durante2 = await conexionesRealesContra(admin, liceo.databaseName);
    const gastadasDirecto = durante2 - antes2;
    await Promise.all(directos.map((c) => c.$disconnect()));

    console.log(`    ${LICEOS} liceos, tope ${POZO} conexiones cada uno:\n`);
    console.log(`      sin repartidor:  ${String(gastadasDirecto).padStart(3)} conexiones reales de PostgreSQL`);
    console.log(`      con repartidor:  ${String(gastadasConRepartidor).padStart(3)} conexiones reales de PostgreSQL`);
    console.log('');
    comprobar(
        'el repartidor gasta menos conexiones reales que la conexión directa',
        gastadasConRepartidor < gastadasDirecto,
        `${gastadasDirecto} → ${gastadasConRepartidor}`
    );

    // ── 4. Lo que el sistema dice al arrancar ────────────────────────────────
    console.log('\n  4. El aviso de arranque\n');
    const cuenta = cabenLasConexiones(100, 3, 50, POZO);
    comprobar('con repartidor, la cuenta de PostgreSQL deja de aplicar', cuenta.cabe);
    console.log(`          «${cuenta.mensaje}»`);

    console.log(`\n  ${bien} bien, ${mal} mal\n`);
    await platformPrisma.$disconnect();
    process.exit(mal === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('\n  ERROR:', e.message, '\n');
    process.exit(1);
});
