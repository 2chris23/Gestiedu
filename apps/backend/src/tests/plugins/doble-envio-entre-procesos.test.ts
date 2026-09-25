// Las demás pruebas usan un Redis de mentira (tests/setup.ts). Esta necesita
// uno de verdad, compartido por dos «procesos».
jest.unmock('ioredis');
import Fastify, { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { crearClienteRedis } from '../../config/redis';

/**
 * DOS CLICS A LA VEZ, EN DOS PROCESOS DISTINTOS, CUENTAN COMO UNO
 *
 * Con varios procesos detrás del repartidor, el doble clic puede caer uno en
 * cada proceso. La marca en memoria de uno no la veía el otro: los dos
 * guardaban. Ahora la marca también va a Redis y el segundo devuelve la
 * respuesta del primero sin ejecutar nada.
 *
 * Cada «proceso» carga el módulo por separado (`isolateModules`), así que no
 * comparten la memoria: solo Redis, como dos procesos de verdad.
 *
 * Necesita `REDIS_PRUEBAS_URL`; sin él, las que lo usan salen SALTADAS.
 */

const URL = process.env.REDIS_PRUEBAS_URL;
const conRedis = URL ? it : it.skip;

describe('Doble envío entre procesos', () => {
    let cliente: Redis | undefined;
    const servidores: FastifyInstance[] = [];
    const guardados = { veces: 0 };

    /** Un proceso con su propia copia del freno, su servidor y un «guardar» lento. */
    async function unProceso(conQuien: any) {
        let plugin: any;
        jest.isolateModules(() => {
            plugin = require('../../plugins/anti-doble-envio').default;
        });
        const app = Fastify();
        await app.register(plugin, { cliente: conQuien });
        app.post('/api/guardar', async () => {
            guardados.veces++;
            const numero = guardados.veces;
            await new Promise((r) => setTimeout(r, 300));
            return { guardado: numero };
        });
        await app.ready();
        servidores.push(app);
        return app;
    }

    const guardar = (app: FastifyInstance, cuerpo: object) =>
        app.inject({
            method: 'POST',
            url: '/api/guardar',
            headers: { authorization: 'Bearer la-misma-persona-y-la-misma-sesion', 'content-type': 'application/json' },
            payload: JSON.stringify(cuerpo),
        });

    beforeAll(async () => {
        if (!URL) return;
        cliente = crearClienteRedis(URL);
        await cliente.connect();
    });

    beforeEach(() => {
        guardados.veces = 0;
    });

    afterAll(async () => {
        await Promise.all(servidores.map((s) => s.close()));
        cliente?.disconnect();
    });

    conRedis('DOBLE-01: el mismo guardado en dos procesos a la vez se hace una vez, y los dos reciben la misma respuesta', async () => {
        const a = await unProceso(cliente);
        const b = await unProceso(cliente);
        const cuerpo = { nota: 17, alumno: `a-${Date.now()}` };

        const [r1, r2] = await Promise.all([guardar(a, cuerpo), guardar(b, cuerpo)]);

        expect(guardados.veces).toBe(1);
        expect(r1.statusCode).toBe(200);
        expect(r2.statusCode).toBe(200);
        expect(r1.json()).toEqual({ guardado: 1 });
        expect(r2.json()).toEqual({ guardado: 1 });
        const marcadas = [r1, r2].filter((r) => r.headers['x-doble-envio'] === 'ignorado');
        expect(marcadas).toHaveLength(1);
    });

    conRedis('DOBLE-02: si el primero ya terminó, el segundo es otra acción y se atiende', async () => {
        const a = await unProceso(cliente);
        const b = await unProceso(cliente);
        const cuerpo = { nota: 12, alumno: `b-${Date.now()}` };

        await guardar(a, cuerpo);
        const segundo = await guardar(b, cuerpo);

        expect(guardados.veces).toBe(2);
        expect(segundo.headers['x-doble-envio']).toBeUndefined();
    });

    conRedis('DOBLE-03: guardados distintos no se frenan entre sí', async () => {
        const a = await unProceso(cliente);
        const b = await unProceso(cliente);
        const t = Date.now();

        await Promise.all([guardar(a, { nota: 1, alumno: `c-${t}` }), guardar(b, { nota: 2, alumno: `c-${t}` })]);

        expect(guardados.veces).toBe(2);
    });

    it('DOBLE-04: con Redis caído, dentro del mismo proceso sigue frenando y nadie se queda esperando', async () => {
        const caido = crearClienteRedis('redis://127.0.0.1:6399'); // ahí no hay nadie
        caido.on('error', () => undefined);
        await caido.connect().catch(() => undefined);

        const a = await unProceso(caido);
        const cuerpo = { nota: 9, alumno: 'd' };
        const t0 = Date.now();
        const [r1, r2] = await Promise.all([guardar(a, cuerpo), guardar(a, cuerpo)]);

        expect(guardados.veces).toBe(1);
        expect(r1.json()).toEqual(r2.json());
        expect(Date.now() - t0).toBeLessThan(1500);
        caido.disconnect();
    });
});
