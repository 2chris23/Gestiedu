import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../src/utils/prisma-enums';
import { tasaDelDia, FUENTES } from '../../src/services/tasa-del-dia.service';
import { createTestServer, createTestPrismaClient, createTestUser, generateTestToken } from '../helpers';

/**
 * LOS RECURRENTES Y LA TASA DEL BCV (2026-10-14)
 *
 *   TASA-01  la primera fuente que contesta bien gana;
 *   TASA-02  si una falla o dice un disparate, se pregunta a la siguiente;
 *   TASA-03  si ninguna contesta, vale la última buena, dicha como vieja;
 *   RECUR-01 el admin guarda sus recurrentes (el internet, el sueldo de la
 *            cocinera) y se leen igual;
 *   RECUR-02 lo que no cuadra no se guarda; el profesor no puede.
 *
 * Ninguna prueba sale a internet: las fuentes se imitan.
 */

const SLUG = 'test-institute';

/** Un `fetch` de mentira: cada dirección contesta lo que se le diga (o falla). */
function fuentesDeMentira(respuestas: Record<string, unknown | Error>): typeof fetch {
    return (async (url: string) => {
        const r = respuestas[url];
        if (r === undefined || r instanceof Error) throw r ?? new Error('sin red');
        return { ok: true, status: 200, json: async () => r } as Response;
    }) as unknown as typeof fetch;
}

describe('La tasa del día', () => {
    const [dolarapi, bcvToday, bcvApi] = FUENTES.map((f) => f.url);

    it('TASA-01: la primera que contesta bien gana', async () => {
        const t = await tasaDelDia(
            fuentesDeMentira({ [dolarapi]: { promedio: 877.9023, fechaActualizacion: '2026-10-14T00:00:00-04:00' }, [bcvToday]: { USD: 1 } }),
            { sinMemoria: true }
        );
        expect(t).toMatchObject({ usd: 877.9023, fecha: '2026-10-14', fuente: 'DolarApi (BCV)', vieja: false });
    });

    it('TASA-02: si una falla o dice un disparate, la siguiente', async () => {
        const t = await tasaDelDia(
            fuentesDeMentira({ [dolarapi]: { promedio: 0 }, [bcvToday]: new Error('caída'), [bcvApi]: { bcv: { usd: 880.5, eur: 990.1 }, updated_at: '2026-10-14T13:00:00Z', stale: false } }),
            { sinMemoria: true }
        );
        expect(t).toMatchObject({ usd: 880.5, eur: 990.1, fuente: 'BCV-API', vieja: false });
    });

    it('TASA-03: sin ninguna, la última buena y dicha como vieja', async () => {
        const t = await tasaDelDia(fuentesDeMentira({}), { sinMemoria: true });
        expect(t).toMatchObject({ usd: 880.5, vieja: true });
    });
});

describe('Los recurrentes', () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    const tk: Record<string, string> = {};
    const auth = (t: string) => (r: request.Test) => r.set('Authorization', `Bearer ${t}`).set('X-Institute-Slug', SLUG);
    const get = (t: string, url: string) => auth(t)(request(server.server).get(url));
    const put = (t: string, url: string, body: any) => auth(t)(request(server.server).put(url).send(body));

    beforeAll(async () => {
        server = await createTestServer();
        prisma = await createTestPrismaClient();
        const admin = (await createTestUser(prisma, UserRole.ADMIN)).user;
        const profe = (await createTestUser(prisma, UserRole.TEACHER)).user;
        tk.admin = generateTestToken(admin.id, UserRole.ADMIN, 'institute');
        tk.profe = generateTestToken(profe.id, UserRole.TEACHER, 'institute');
        const config = {
            enabled: true, frequency: 'MONTHLY', dueMode: 'SAME_DAY', dueDay: 1, graceDays: 0,
            baseCurrency: 'USD', acceptedCurrencies: 'BOTH', feeAmount: 30,
            enrollmentEnabled: false, enrollmentAmount: 0, methods: ['Efectivo'],
        };
        expect((await put(tk.admin, '/api/payments/settings', config)).status).toBe(200);
    }, 120000);

    afterAll(async () => {
        await prisma?.$disconnect();
        await server?.close();
    });

    it('RECUR-01: el admin los guarda y se leen igual', async () => {
        const lista = [
            { nombre: 'Internet', tipo: 'sale', fuente: 'GASTO:Servicios', monto: 40, moneda: 'USD', descripcion: 'Plan del mes' },
            { nombre: 'Rosa (cocina)', tipo: 'sale', fuente: 'PERSONAL', monto: '120.5', moneda: 'USD', personaId: 'p1', personaNombre: 'Rosa Pérez', metodo: 'Efectivo' },
            { nombre: 'Cantina', tipo: 'entra', fuente: 'OTRO', monto: 15, moneda: 'VES' },
        ];
        const r = await put(tk.admin, '/api/finanzas/recurrentes', { recurrentes: lista });
        expect(r.status).toBe(200);
        expect(r.body.recurrentes.map((x: any) => [x.nombre, x.monto, x.fuente])).toEqual([
            ['Internet', '40.00', 'GASTO:Servicios'],
            ['Rosa (cocina)', '120.50', 'PERSONAL'],
            ['Cantina', '15.00', 'OTRO'],
        ]);
        expect(r.body.recurrentes.every((x: any) => typeof x.id === 'string' && x.id.length > 2)).toBe(true);
        expect((await get(tk.admin, '/api/finanzas/recurrentes')).body.recurrentes).toEqual(r.body.recurrentes);
    }, 60000);

    it('RECUR-02: lo que no cuadra no se guarda; el profesor no puede', async () => {
        for (const malo of [
            { nombre: 'Al revés', tipo: 'entra', fuente: 'GASTO:Compras', monto: 5, moneda: 'USD' },
            { nombre: 'Sin monto', tipo: 'sale', fuente: 'GASTO:Compras', monto: 0, moneda: 'USD' },
            { nombre: 'Sin persona', tipo: 'sale', fuente: 'PERSONAL', monto: 5, moneda: 'USD' },
            { nombre: 'Estudiante', tipo: 'entra', fuente: 'ESTUDIANTE', monto: 5, moneda: 'USD' },
        ]) {
            const r = await put(tk.admin, '/api/finanzas/recurrentes', { recurrentes: [malo] });
            expect([malo.nombre, r.status, r.body.code]).toEqual([malo.nombre, 400, 'RECURRENTE_INVALIDO']);
        }
        expect([401, 403]).toContain((await put(tk.profe, '/api/finanzas/recurrentes', { recurrentes: [] })).status);
        expect((await get(tk.admin, '/api/finanzas/recurrentes')).body.recurrentes).toHaveLength(3);
    }, 60000);
});
