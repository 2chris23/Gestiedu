/**
 * ¿UN LICEO PUEDE VER LO DE OTRO EN LA BASE COMPARTIDA? (AISLA-*, 2026-10-04)
 *
 * Con la base compartida (un esquema por liceo) todos los liceos entran con el
 * MISMO usuario a la MISMA base, así que PgBouncer los mete en el MISMO pozo de
 * conexiones. En modo transacción, una conexión real pasa de un liceo a otro
 * entre transacción y transacción. Si el esquema del liceo se fija UNA vez por
 * conexión (`SET search_path` al abrir), la siguiente transacción, de otro
 * liceo, hereda el esquema del anterior: lee y escribe en el liceo equivocado.
 *
 * Esto lo mide, no lo supone:
 *
 *   AISLA-01  consultas de Prisma (las de los modelos), de dos liceos a la vez
 *   AISLA-02  SQL escrito a mano (`$queryRaw`, sin esquema en el nombre), igual
 *   AISLA-03  transacciones interactivas, igual
 *
 * Cada respuesta se compara con lo que de verdad hay en el esquema de cada
 * liceo, contado por conexión directa y con el nombre del esquema escrito.
 *
 * Cómo se corre (PgBouncer en modo transacción, ver `probar-pgbouncer.ts`):
 *
 *   PGBOUNCER_HOST=localhost PGBOUNCER_PORT=6432 npx tsx src/scripts/probar-aislamiento-por-esquema.ts
 *
 * LICEOS='slug-a,slug-b' elige los dos liceos (por defecto, los dos primeros
 * con esquema). VUELTAS=300 cuántas consultas hace cada uno.
 */
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { buildTenantDatabaseUrl, pgBouncer } from '../config/tenant-db-url';

const VUELTAS = Number(process.env.VUELTAS || 300);

let bien = 0;
let mal = 0;
function comprobar(nombre: string, condicion: boolean, detalle = '') {
    if (condicion) bien++;
    else mal++;
    console.log(`    ${condicion ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? `  —  ${detalle}` : ''}`);
}

async function main() {
    if (!pgBouncer()) {
        console.log('Falta PGBOUNCER_HOST/PGBOUNCER_PORT: sin repartidor esto no mide nada.');
        process.exit(2);
    }
    const pedidos = (process.env.LICEOS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const liceos = await platformPrisma.institute.findMany({
        where: pedidos.length ? { slug: { in: pedidos } } : { databaseSchema: { not: null } },
        take: 2,
        orderBy: { slug: 'asc' },
    });
    if (liceos.length < 2 || liceos.some((l) => !l.databaseSchema)) {
        console.log('Hacen falta dos liceos con esquema en la base compartida.');
        process.exit(2);
    }
    console.log(`\nAISLAMIENTO POR ESQUEMA, a través de PgBouncer (${VUELTAS} vueltas por liceo)`);
    console.log(`    ${liceos.map((l) => `${l.slug} → ${l.databaseSchema}`).join('   ·   ')}\n`);

    // Lo que hay de verdad en cada esquema: conexión directa, esquema escrito.
    const verdad = new Map<string, number>();
    for (const l of liceos) {
        const directa = new Client({ connectionString: buildTenantDatabaseUrl(l as any, 'direct').split('?')[0] });
        await directa.connect();
        const { rows } = await directa.query(`SELECT count(*)::int AS n FROM "${l.databaseSchema}".users`);
        verdad.set(l.id, rows[0].n);
        await directa.end();
    }
    const [a, b] = liceos;
    if (verdad.get(a.id) === verdad.get(b.id)) {
        console.log('    Los dos tienen el mismo número de usuarios: no se distinguiría una fuga. Elige otros (LICEOS=).');
        process.exit(2);
    }

    // El mismo cliente que usa la app (con su guardia del esquema), no uno suelto.
    const clientes = new Map<string, PrismaClient>();
    for (const l of liceos) clientes.set(l.id, await getTenantPrisma(l.id));

    const ronda = async (tipo: 'modelo' | 'sql' | 'transaccion') => {
        const fallos: string[] = [];
        const errores: string[] = [];
        const tareas: Promise<void>[] = [];
        for (let i = 0; i < VUELTAS; i++) {
            for (const l of liceos) {
                const p = clientes.get(l.id)!;
                tareas.push(
                    (async () => {
                        let n: number;
                        if (tipo === 'modelo') n = await p.user.count();
                        else if (tipo === 'sql') n = (await p.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`)[0].n;
                        else
                            n = await p.$transaction(async (tx) => {
                                const r = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`;
                                return r[0].n;
                            });
                        if (n !== verdad.get(l.id)) fallos.push(`${l.slug} vio ${n} (tiene ${verdad.get(l.id)})`);
                    })().catch((e) => {
                        // «No pudo» no es «vio lo de otro»: es carga (miles de
                        // transacciones a la vez contra un pozo pequeño).
                        errores.push(`${l.slug}: ${e instanceof Error ? e.message.split('\n').filter(Boolean).pop() : String(e)}`);
                    })
                );
            }
        }
        await Promise.all(tareas);
        return { fallos, errores };
    };

    for (const [id, tipo, nombre] of [
        ['AISLA-01', 'modelo', 'consultas de los modelos'],
        ['AISLA-02', 'sql', 'SQL escrito a mano, sin esquema en el nombre'],
        ['AISLA-03', 'transaccion', 'transacciones interactivas'],
    ] as const) {
        const { fallos, errores } = await ronda(tipo);
        const nota = errores.length ? ` · ${errores.length} no pudieron hacerse (carga: ${errores[0]})` : '';
        comprobar(
            `${id}: ${nombre}`,
            fallos.length === 0,
            fallos.length
                ? `${fallos.length} respuestas de OTRO liceo; p. ej. ${fallos.slice(0, 2).join(' | ')}${nota}`
                : `${VUELTAS * 2 - errores.length} respuestas, todas de su liceo${nota}`
        );
    }

    for (const p of clientes.values()) await p.$disconnect();
    await platformPrisma.$disconnect();
    console.log(`\n${bien} bien, ${mal} mal\n`);
    process.exit(mal ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
