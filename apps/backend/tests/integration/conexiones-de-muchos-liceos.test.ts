import { FastifyInstance } from 'fastify';
import { createTestServer } from '../helpers';
import {
    getTenantPrisma,
    invalidateTenantCache,
    clientesDeLiceoAbiertos,
    clientesDeLiceoGuardados,
} from '../../src/config/database';

/**
 * LAS CONEXIONES CUANDO HAY MUCHOS LICEOS
 *
 * Cada liceo tiene su base, y el servidor guarda un «cliente» abierto por
 * liceo para no tener que conectarse en cada petición. Dos cosas se rompían
 * justo en el momento de más gente —el lunes a las siete, con todos los liceos
 * entrando a la vez y ninguno abierto todavía—:
 *
 *   · Diez peticiones a la vez de un liceo sin abrir abrían DIEZ clientes, cada
 *     uno con su propio grupo de conexiones. Se quedaba uno; los otros nueve
 *     seguían abiertos para siempre, gastando conexiones que nadie iba a usar.
 *   · Solo cabían 50 liceos abiertos a la vez. Con 200, cada petición de un
 *     liceo que no estaba en la lista tenía que abrir el suyo y cerrar otro, y
 *     el usuario esperaba las dos cosas.
 */
describe('Conexiones con muchos liceos', () => {
    let server: FastifyInstance;

    beforeAll(async () => {
        server = await createTestServer();
    }, 120000);

    afterAll(async () => {
        await server.close();
    });

    it('CONN-10: veinte peticiones a la vez de un liceo sin abrir comparten UN cliente', async () => {
        await invalidateTenantCache('institute');
        const antes = clientesDeLiceoAbiertos();

        const clientes = await Promise.all(Array.from({ length: 20 }, () => getTenantPrisma('institute')));

        expect(new Set(clientes).size).toBe(1);
        expect(clientesDeLiceoAbiertos()).toBe(antes + 1);
        // Y sirve.
        await expect((clientes[0] as any).$queryRaw`SELECT 1 AS uno`).resolves.toEqual([{ uno: 1 }]);
    }, 60000);

    it('CONN-11: con PgBouncer caben 250 liceos abiertos; sin él, los 50 de la cuenta con PostgreSQL', () => {
        const antes = { ...process.env };
        try {
            delete process.env.CLIENTES_DE_LICEO;
            delete process.env.PGBOUNCER_HOST;
            expect(clientesDeLiceoGuardados()).toBe(50);
            process.env.PGBOUNCER_HOST = 'pgbouncer';
            expect(clientesDeLiceoGuardados()).toBe(250);
            process.env.CLIENTES_DE_LICEO = '400';
            expect(clientesDeLiceoGuardados()).toBe(400);
        } finally {
            process.env = antes;
        }
    });
});
