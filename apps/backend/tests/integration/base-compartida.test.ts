import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { Client } from 'pg';
import { platformPrisma } from '../../src/config/database';
import { respaldarLiceo } from '../../src/services/respaldos.service';
import { createTestServer, seedSuperAdmin, generateSuperAdminTestToken } from '../helpers';

/**
 * LA BASE COMPARTIDA: BORRAR Y RESPALDAR UN LICEO (BASE-COMP-*, 2026-10-04)
 *
 * En la base compartida cada liceo es un esquema. Dos fallos encontrados al
 * revisarla, los dos de los que no tienen vuelta atrás:
 *
 *   BASE-COMP-01  borrar un liceo hacía DROP DATABASE de la base compartida:
 *                 se llevaba a TODOS. Ahora se borra su esquema y nada más.
 *   BASE-COMP-02  una base que figura en la fila de otro liceo no se borra
 *                 nunca, ni con ?force=true.
 *   BASE-COMP-03  el respaldo de un liceo era la base entera, con los datos de
 *                 todos los demás. Ahora es su esquema y nada más.
 */

const urlBase = () => process.env.DATABASE_URL || '';
const urlDe = (base: string) => urlBase().replace(/\/[^/?]+(\?|$)/, `/${base}$1`).split('?')[0];
const credenciales = () => {
    const u = new URL(urlBase());
    return {
        databaseHost: u.hostname,
        databasePort: Number(u.port || 5432),
        databaseUser: decodeURIComponent(u.username),
        databasePassword: decodeURIComponent(u.password),
    };
};

async function en<T>(base: string, fn: (c: Client) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: urlDe(base) });
    await c.connect();
    try {
        return await fn(c);
    } finally {
        await c.end().catch(() => undefined);
    }
}

const esquemasDe = (base: string) =>
    en(base, async (c) => (await c.query(`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_bc_%' ORDER BY 1`)).rows.map((r) => r.nspname));

describe('La base compartida: borrar y respaldar un liceo (BASE-COMP)', () => {
    const base = `t_compartida_${Date.now()}`;
    const marca = Date.now().toString(36);
    const ids = { a: `bc-a-${marca}`, b: `bc-b-${marca}`, c: `bc-c-${marca}` };
    let server: FastifyInstance;
    let token: string;

    beforeAll(async () => {
        server = await createTestServer();
        const email = `sa-bc-${marca}@test.com`;
        const sa = await seedSuperAdmin(platformPrisma as any, email);
        token = generateSuperAdminTestToken(sa.id, email);
        await en('postgres', (c) => c.query(`CREATE DATABASE "${base}"`));
        await en(base, async (c) => {
            for (const [esquema, valor] of [['tenant_bc_a', 1], ['tenant_bc_b', 2]] as const) {
                await c.query(`CREATE SCHEMA ${esquema}`);
                await c.query(`CREATE TABLE ${esquema}.notas (valor int)`);
                await c.query(`INSERT INTO ${esquema}.notas VALUES (${valor})`);
            }
        });
        const fila = (id: string, slug: string, databaseSchema: string | null) => ({
            id,
            code: id.toUpperCase().slice(0, 20),
            slug,
            subdomain: slug,
            name: `Liceo ${slug}`,
            email: `${slug}@test.com`,
            environment: 'development',
            status: 'ACTIVE' as const,
            databaseName: base,
            databaseSchema,
            ...credenciales(),
        });
        await platformPrisma.institute.create({ data: fila(ids.a, `bc-a-${marca}`, 'tenant_bc_a') as any });
        await platformPrisma.institute.create({ data: fila(ids.b, `bc-b-${marca}`, 'tenant_bc_b') as any });
        // Uno mal anotado: en la base compartida, sin esquema propio.
        await platformPrisma.institute.create({ data: fila(ids.c, `bc-c-${marca}`, null) as any });
    }, 120000);

    afterAll(async () => {
        await platformPrisma.institute.deleteMany({ where: { id: { in: Object.values(ids) } } });
        await en('postgres', (c) => c.query(`DROP DATABASE IF EXISTS "${base}" WITH (FORCE)`)).catch(() => undefined);
        await server?.close();
    });

    const borrar = (id: string, force = false) =>
        request(server.server)
            .delete(`/api/superadmin/institutes/${id}${force ? '?force=true' : ''}`)
            .set('Authorization', `Bearer ${token}`);

    it('BASE-COMP-02: un liceo sin esquema en una base que usan otros no la borra, ni con force', async () => {
        const res = await borrar(ids.c, true);
        // Con force se quita la fila, pero la base de los demás sigue entera.
        expect([200, 204, 409]).toContain(res.status);
        expect(await esquemasDe(base)).toEqual(['tenant_bc_a', 'tenant_bc_b']);
        const viva = await en(base, async (c) => (await c.query('SELECT valor FROM tenant_bc_b.notas')).rows[0].valor);
        expect(viva).toBe(2);
    }, 120000);

    it('BASE-COMP-01: borrar un liceo de la base compartida se lleva SU esquema y nada más', async () => {
        const res = await borrar(ids.a, true);
        expect(res.status).toBeLessThan(300);
        expect(await esquemasDe(base)).toEqual(['tenant_bc_b']);
        // El otro liceo, intacto: su esquema, sus datos y su fila.
        const delOtro = await en(base, async (c) => (await c.query('SELECT valor FROM tenant_bc_b.notas')).rows[0].valor);
        expect(delOtro).toBe(2);
        expect(await platformPrisma.institute.findUnique({ where: { id: ids.b } })).not.toBeNull();
    }, 120000);

    it('BASE-COMP-03: el respaldo de un liceo de la base compartida lleva su esquema y nada más', async () => {
        const bin = process.env.PG_BIN_DIR || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
        const pgRestore = path.join(bin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore');
        if (process.platform === 'win32' && !existsSync(pgRestore)) {
            console.warn('BASE-COMP-03 saltada: no hay pg_restore (PG_BIN_DIR)');
            return;
        }
        if (process.platform === 'win32') process.env.PG_BIN_DIR = bin;
        const carpeta = mkdtempSync(path.join(tmpdir(), 'resp-compartida-'));
        try {
            const fila = await platformPrisma.institute.findUnique({ where: { id: ids.b } });
            const r = await respaldarLiceo(fila as any, carpeta);
            expect(r.ok).toBe(true);
            const lista = spawnSync(bin ? pgRestore : 'pg_restore', ['--list', r.archivo!], { encoding: 'utf8' }).stdout;
            expect(lista).toContain('tenant_bc_b');
            expect(lista).not.toContain('tenant_bc_a');
        } finally {
            rmSync(carpeta, { recursive: true, force: true });
        }
    }, 120000);
});
