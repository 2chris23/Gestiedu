import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { createTestServer } from '../helpers';

/**
 * CONTAMINAR EL PROTOTIPO (PROTO-01/02, 2026-10-04)
 *
 * Un JSON con `__proto__` o `constructor.prototype`, mezclado sin cuidado con
 * un objeto del servidor, le cambia el comportamiento a TODOS los objetos del
 * proceso (de todos los liceos). La configuración se mezcla con lo guardado en
 * varios sitios; la primera barrera es el lector de JSON de Fastify, que por
 * defecto rechaza esas claves. Esto lo deja fijo: si alguien lo cambia a
 * «quitar» o «ignorar», se pone en rojo.
 */
describe('Contaminar el prototipo (PROTO)', () => {
    let server: FastifyInstance;

    beforeAll(async () => {
        server = await createTestServer();
    }, 60000);

    afterAll(async () => {
        await server?.close();
    });

    const enviar = (cuerpo: string) =>
        request(server.server)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .set('X-Institute-Slug', 'test-institute')
            .send(cuerpo);

    it('PROTO-01: un cuerpo con __proto__ se rechaza y no toca a los demás objetos', async () => {
        const res = await enviar('{"email":"a@b.co","password":"x12345678","__proto__":{"contaminado":true}}');
        expect(res.status).toBe(400);
        expect(({} as any).contaminado).toBeUndefined();
    });

    it('PROTO-02: un cuerpo con constructor.prototype se rechaza', async () => {
        const res = await enviar('{"email":"a@b.co","password":"x12345678","constructor":{"prototype":{"contaminado":true}}}');
        expect(res.status).toBe(400);
        expect(({} as any).contaminado).toBeUndefined();
    });
});
