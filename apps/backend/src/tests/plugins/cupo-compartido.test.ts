// Las demás pruebas usan un Redis de mentira (tests/setup.ts). Esta necesita
// uno de verdad, compartido por dos «procesos».
jest.unmock('ioredis');
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { crearClienteRedis } from '../../config/redis';
import { CupoCompartido } from '../../plugins/cupo-compartido';

/**
 * EL CUPO DE PETICIONES, EL MISMO PARA TODOS LOS PROCESOS
 *
 * Con varios procesos detrás del repartidor, cada uno contaba en su memoria:
 * con cuatro, cuatro veces el cupo. Aquí dos servidores comparten un Redis, y
 * lo que se gasta en uno se gasta en el otro.
 *
 * Necesita un Redis de pruebas: `REDIS_PRUEBAS_URL` (en la integración
 * continua es un servicio; aquí, `redis-server --port 6391`). Sin él, las
 * pruebas que lo necesitan salen como SALTADAS, no en verde.
 */

const URL = process.env.REDIS_PRUEBAS_URL;
const conRedis = URL ? it : it.skip;

describe('Cupo compartido', () => {
    let cliente: Redis;
    const servidores: FastifyInstance[] = [];

    /** Un «proceso»: su propio servidor, el mismo Redis. */
    async function unProceso(max: number, prefijo: string, conQuien: Redis) {
        class CupoDePrueba extends CupoCompartido {
            constructor(opciones: any) {
                super(opciones, prefijo, conQuien as any);
            }
        }
        const app = Fastify();
        await app.register(rateLimit, {
            max,
            timeWindow: 60_000,
            keyGenerator: () => 'la-misma-persona',
            store: CupoDePrueba as any,
        });
        app.get('/', async () => ({ ok: true }));
        await app.ready();
        servidores.push(app);
        return app;
    }

    beforeAll(async () => {
        if (!URL) return;
        cliente = crearClienteRedis(URL);
        await cliente.connect();
    });

    afterAll(async () => {
        await Promise.all(servidores.map((s) => s.close()));
        cliente?.disconnect();
    });

    conRedis('CUPO-01: lo que se gasta en un proceso se gasta en el otro', async () => {
        const prefijo = `prueba-cupo:${Date.now()}:`;
        const a = await unProceso(5, prefijo, cliente);
        const b = await unProceso(5, prefijo, cliente);

        const estados: number[] = [];
        for (const app of [a, b, a, b, a]) {
            estados.push((await app.inject({ method: 'GET', url: '/' })).statusCode);
        }
        expect(estados).toEqual([200, 200, 200, 200, 200]);

        // La sexta, en el proceso que solo lleva dos: con cuentas separadas
        // pasaría (antes pasaban hasta diez); con la cuenta compartida, no.
        expect((await b.inject({ method: 'GET', url: '/' })).statusCode).toBe(429);
    });

    conRedis('CUPO-02: la cuenta caduca con la ventana', async () => {
        const prefijo = `prueba-cupo-ventana:${Date.now()}:`;
        const cupo = new CupoCompartido({}, prefijo, cliente as any);
        const contar = () =>
            new Promise<{ current: number; ttl: number }>((ok, mal) =>
                cupo.incr('x', (e, r) => (e ? mal(e) : ok(r!)), 300, 10),
            );

        expect((await contar()).current).toBe(1);
        const segunda = await contar();
        expect(segunda.current).toBe(2);
        expect(segunda.ttl).toBeGreaterThan(0);
        expect(segunda.ttl).toBeLessThanOrEqual(300);

        await new Promise((r) => setTimeout(r, 400));
        expect((await contar()).current).toBe(1);
    });

    it('CUPO-03: con Redis caído, se sigue contando en el proceso: el freno no se apaga ni se cuelga', async () => {
        const caido = crearClienteRedis('redis://127.0.0.1:6399'); // ahí no hay nadie
        caido.on('error', () => undefined);
        await caido.connect().catch(() => undefined);

        const app = await unProceso(3, 'prueba-caido:', caido);
        const t0 = Date.now();
        const estados: number[] = [];
        for (let i = 0; i < 4; i++) {
            estados.push((await app.inject({ method: 'GET', url: '/' })).statusCode);
        }
        expect(estados).toEqual([200, 200, 200, 429]);
        expect(Date.now() - t0).toBeLessThan(1000);
        caido.disconnect();
    });

    it('CUPO-04: Redis dice que está listo pero falla la orden: se cuenta en el proceso, sin error', async () => {
        const mentiroso: any = {
            status: 'ready',
            contarCupo: () => Promise.reject(new Error('Redis se cayó')),
        };
        const app = await unProceso(2, 'prueba-mentiroso:', mentiroso);
        const estados: number[] = [];
        for (let i = 0; i < 3; i++) {
            estados.push((await app.inject({ method: 'GET', url: '/' })).statusCode);
        }
        expect(estados).toEqual([200, 200, 429]);
    });
});
