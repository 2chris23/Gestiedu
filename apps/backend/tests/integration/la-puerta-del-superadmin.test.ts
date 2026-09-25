import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { platformPrisma } from '../../src/config/database';
import { createTestServer, seedSuperAdmin } from '../helpers';

/**
 * LA PUERTA DEL SUPERADMINISTRADOR
 *
 * El superadministrador ve TODOS los liceos: qué base es de cuál y con qué
 * llave. Su puerta tiene que ser la más dura, y era la más blanda:
 *
 *   SA-BRUTO-01  El login de un liceo cierra la cuenta tras 10 fallos, venga
 *                de donde venga (BRUTO-*). El del superadmin, no: solo el
 *                tope por dirección, que se esquiva repartiendo los intentos.
 *   SA-ENUM-01   Con la contraseña MAL, una cuenta desactivada respondía
 *                «desactivada» (403) y una que no existe «credenciales» (401).
 */
const CLAVE = 'SuperClave-De-Prueba-2026';
let n = 0;
const desdeOtraConexion = (req: any) => {
    n += 1;
    return req.set('X-Forwarded-For', `10.88.${(n >> 8) & 255}.${n & 255}`);
};

describe('La puerta del superadministrador', () => {
    let server: FastifyInstance;
    const correos: string[] = [];
    const entrar = (email: string, password: string) =>
        desdeOtraConexion(request(server.server).post('/api/superadmin/auth/login')).send({ email, password });

    beforeAll(async () => {
        server = await createTestServer();
    }, 120000);

    afterAll(async () => {
        await platformPrisma.superAdmin.deleteMany({ where: { email: { in: correos } } });
        await server.close();
    });

    it('SA-BRUTO-01: tras 10 fallos la cuenta se cierra un rato, aunque luego acierte', async () => {
        const email = `sa-bruto-${Date.now()}@test.com`;
        correos.push(email);
        await seedSuperAdmin(platformPrisma, email, CLAVE);

        for (let i = 0; i < 10; i++) expect((await entrar(email, `Mala-${i}-Clave`)).status).toBe(401);
        const buena = await entrar(email, CLAVE);
        expect(buena.status).toBe(429);
        expect(buena.body.accessToken).toBeUndefined();
    }, 60000);

    it('SA-ENUM-01: desactivada y con la contraseña mal responde como un correo que no existe', async () => {
        const email = `sa-apagado-${Date.now()}@test.com`;
        correos.push(email);
        await seedSuperAdmin(platformPrisma, email, CLAVE);
        await platformPrisma.superAdmin.update({ where: { email }, data: { isActive: false } });

        const fantasma = await entrar(`sa-nadie-${Date.now()}@test.com`, 'Mala-Clave-1');
        const apagada = await entrar(email, 'Mala-Clave-1');
        expect(fantasma.status).toBe(401);
        expect({ status: apagada.status, body: apagada.body }).toEqual({ status: fantasma.status, body: fantasma.body });
    }, 60000);
});
