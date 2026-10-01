// Las demás pruebas usan un Redis de mentira (tests/setup.ts). Esta no: lo que
// se mide es justo cómo se porta el cliente de verdad con Redis apagado.
jest.unmock('ioredis');
import { crearClienteRedis } from '../../config/redis';

/**
 * CON REDIS CAÍDO, NADIE ESPERA
 *
 * Medido antes de esto, con un Redis apagado y los clientes como se creaban en
 * producción: cada consulta esperaba 10,6 s antes de rendirse. Casi cada
 * petición del sistema toca Redis, así que TODO se colgaba. Ahora falla en el
 * acto y la petición sigue con la memoria del proceso (ver `config/redis.ts`).
 */
describe('Redis caído', () => {
    it('REDIS-01: con Redis apagado, una consulta falla en menos de medio segundo, también un rato después', async () => {
        const cliente = crearClienteRedis('redis://127.0.0.1:6399'); // ahí no hay nadie
        cliente.on('error', () => undefined);
        await cliente.connect().catch(() => undefined);

        for (const esperaAntes of [0, 1500]) {
            await new Promise((r) => setTimeout(r, esperaAntes));
            const t0 = Date.now();
            await expect(cliente.get('cualquier-cosa')).rejects.toThrow();
            expect(Date.now() - t0).toBeLessThan(500);
        }

        cliente.disconnect();
    }, 20000);

    it('REDIS-02: sigue intentando reconectar, no se rinde para siempre', async () => {
        const cliente = crearClienteRedis('redis://127.0.0.1:6399');
        cliente.on('error', () => undefined);
        await cliente.connect().catch(() => undefined);
        await new Promise((r) => setTimeout(r, 2500));
        expect(['reconnecting', 'connecting']).toContain(cliente.status);
        cliente.disconnect();
    }, 20000);
});
