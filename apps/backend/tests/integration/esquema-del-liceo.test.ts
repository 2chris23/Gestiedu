import { PrismaClient } from '@prisma/client';
import { fijarElEsquema, esquemaValido } from '../../src/config/esquema-del-liceo';

/**
 * EL ESQUEMA DEL LICEO VA EN CADA TRANSACCIÓN (AISLA-10…13, 2026-10-04)
 *
 * Lo que pasa con PgBouncer en modo transacción —una conexión que trae puesto
 * el esquema de OTRO liceo— se reproduce aquí sin PgBouncer: un cliente que
 * abrió su conexión en el esquema `aisla_a` y se usa como si fuera del liceo
 * `aisla_b`. Sin la guardia, el SQL escrito a mano lee lo de `aisla_a`; con
 * ella, siempre lo de `aisla_b`. La medición de verdad, con PgBouncer, es
 * `npm run probar:aislamiento`.
 */

describe('El esquema del liceo, en cada transacción (AISLA)', () => {
    let base: PrismaClient;
    let conectadoEnA: PrismaClient;

    beforeAll(async () => {
        base = new PrismaClient();
        for (const [esquema, valor] of [['aisla_a', 1], ['aisla_b', 2]] as const) {
            await base.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${esquema} CASCADE`);
            await base.$executeRawUnsafe(`CREATE SCHEMA ${esquema}`);
            await base.$executeRawUnsafe(`CREATE TABLE ${esquema}.marca (valor int)`);
            await base.$executeRawUnsafe(`INSERT INTO ${esquema}.marca VALUES (${valor})`);
        }
        const url = new URL(process.env.DATABASE_URL!);
        url.searchParams.set('schema', 'aisla_a');
        conectadoEnA = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    }, 60000);

    afterAll(async () => {
        await conectadoEnA?.$disconnect();
        await base?.$executeRawUnsafe('DROP SCHEMA IF EXISTS aisla_a CASCADE').catch(() => undefined);
        await base?.$executeRawUnsafe('DROP SCHEMA IF EXISTS aisla_b CASCADE').catch(() => undefined);
        await base?.$disconnect();
    });

    it('AISLA-10: sin la guardia, el SQL a mano lee el esquema que traiga la conexión (el fallo que se evita)', async () => {
        const r = await conectadoEnA.$queryRaw<Array<{ valor: number }>>`SELECT valor FROM marca`;
        expect(r[0].valor).toBe(1);
    });

    it('AISLA-11: con la guardia, el SQL a mano lee SU esquema, venga como venga la conexión', async () => {
        const delB = fijarElEsquema(conectadoEnA, 'aisla_b');
        const r = await delB.$queryRaw<Array<{ valor: number }>>`SELECT valor FROM marca`;
        expect(r[0].valor).toBe(2);
        const u = await delB.$queryRawUnsafe<Array<{ valor: number }>>('SELECT valor FROM marca');
        expect(u[0].valor).toBe(2);
        expect(await delB.$executeRawUnsafe('UPDATE marca SET valor = valor')).toBe(1);
        // Y no deja la conexión cambiada: fuera de la guardia, vuelve a ser `aisla_a`.
        expect((await conectadoEnA.$queryRaw<Array<{ valor: number }>>`SELECT valor FROM marca`)[0].valor).toBe(1);
    });

    it('AISLA-12: las transacciones del código empiezan en su esquema', async () => {
        const delB = fijarElEsquema(conectadoEnA, 'aisla_b');
        const v = await delB.$transaction(async (tx) => (await tx.$queryRaw<Array<{ valor: number }>>`SELECT valor FROM marca`)[0].valor);
        expect(v).toBe(2);
    });

    it('AISLA-13: un nombre de esquema raro no se acepta (nada de comillas ni puntos)', () => {
        expect(esquemaValido('tenant_liceo_bolivar')).toBe(true);
        for (const malo of ['public"; DROP', 'a.b', 'Tenant', '', 'x'.repeat(64)]) expect(esquemaValido(malo)).toBe(false);
        expect(() => fijarElEsquema(conectadoEnA, 'a"b')).toThrow();
    });
});
