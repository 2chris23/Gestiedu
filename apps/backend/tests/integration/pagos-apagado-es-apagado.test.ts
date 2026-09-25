import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * PAGOS APAGADO ES APAGADO — TODAS LAS RUTAS, NO UNA MUESTRA
 *
 * `pagos.test.ts` (PAGOS-01) prueba tres rutas con el módulo apagado. Esta le
 * pregunta al servidor TODAS las que tiene bajo `/api/payments` y las llama
 * con el administrador (el que más puede): menos la configuración, que es
 * justo donde se enciende, todas tienen que responder 403 PAYMENTS_DISABLED.
 * Una ruta nueva que se olvide de `moduloActivo` se cae aquí sola.
 */
function rutasDePagos(server: FastifyInstance): Array<{ metodo: string; ruta: string }> {
    const crudo = server.printRoutes({ commonPrefix: false });
    const rutas: Array<{ metodo: string; ruta: string }> = [];
    const trozoPorNivel: string[] = [];
    for (const lineaCruda of crudo.split('\n')) {
        if (!lineaCruda.trim()) continue;
        const dibujo = lineaCruda.match(/^[\s│├└─]*/)?.[0] ?? '';
        const nivel = Math.floor(dibujo.length / 4);
        const texto = lineaCruda.slice(dibujo.length);
        if (!texto) continue;
        const conMetodos = texto.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        trozoPorNivel[nivel] = (conMetodos ? conMetodos[1] : texto).trim();
        trozoPorNivel.length = nivel + 1;
        if (!conMetodos) continue;
        const ruta = trozoPorNivel.join('').replace(/\/{2,}/g, '/');
        if (!ruta.startsWith('/api/payments')) continue;
        for (const metodo of conMetodos[2].split(',').map((x) => x.trim())) {
            if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) rutas.push({ metodo, ruta });
        }
    }
    return rutas;
}

/** Un cuerpo que pasa la validación de cada ruta que escribe. */
const CUERPO: Record<string, Record<string, unknown>> = {
    'POST /api/payments/students/:studentId/payments': { installmentKeys: ['2026-09'], amount: 30, currency: 'USD', method: 'CASH', paidAt: '2026-09-15' },
    'PUT /api/payments/students/:studentId/plan': { exempt: false },
    'POST /api/payments/:paymentId/annul': { reason: 'Error al cobrar' },
};

describe('Pagos apagado es apagado', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let admin: any;
    let alumno: any;

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        alumno = (await createTestUser(prisma, UserRole.STUDENT)).user;
    }, 120000);

    afterAll(async () => {
        await prisma.$disconnect();
        await server.close();
    });

    it('PAGOS-APAGADO-01: con el módulo apagado, toda ruta de pagos (menos la configuración) responde 403', async () => {
        const rutas = rutasDePagos(server).filter((r) => r.ruta.replace(/\/$/, '') !== '/api/payments/settings');
        expect(rutas.length).toBeGreaterThanOrEqual(7);

        const abiertas: string[] = [];
        for (const r of rutas) {
            const url = r.ruta.replace(/:([A-Za-z0-9_]+)/g, (_, n) => (n === 'studentId' ? alumno.id : 'c0000000000000000000000000'));
            const res = await (request(server.server) as any)[r.metodo.toLowerCase()](url)
                .set('X-Institute-Slug', 'test-institute')
                .set('Authorization', `Bearer ${generateTestToken(admin.id, UserRole.ADMIN, 'institute')}`)
                .send(CUERPO[`${r.metodo} ${r.ruta}`] ?? {});
            if (process.env.DEPURAR) console.log(r.metodo, r.ruta, res.status, res.body.code);
            // Un cuerpo válido en cada una: con uno inválido respondería 400
            // antes de mirar el módulo y no se habría medido nada.
            if (res.status !== 403 || res.body.code !== 'PAYMENTS_DISABLED') abiertas.push(`${r.metodo} ${r.ruta} → ${res.status} ${res.body.code}`);
        }
        expect(abiertas).toEqual([]);
    }, 120000);
});
