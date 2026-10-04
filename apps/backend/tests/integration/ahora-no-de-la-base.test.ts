import { esUnAhoraNoDeLaBase } from '../../src/utils/error-handler';
import { errorHandler } from '../../src/middleware/error.middleware';

/**
 * «AHORA NO» DE LA BASE (AHORANO-01/02, 2026-10-04)
 *
 * Con mucha gente a la vez, la base puede no dar conexión o no abrir la
 * transacción a tiempo. Eso se reintenta: 503 con Retry-After, y el teléfono
 * lo deja pendiente. Con 500, lo daba por «no se pudo».
 */
describe('Ahora no de la base (AHORANO)', () => {
    it('AHORANO-01: reconoce los «ahora no» y no confunde un error de verdad', () => {
        expect(esUnAhoraNoDeLaBase({ code: 'P2024' })).toBe(true);
        expect(esUnAhoraNoDeLaBase({ code: 'P2028', message: 'Transaction API error: Unable to start a transaction in the given time.' })).toBe(true);
        expect(esUnAhoraNoDeLaBase({ code: 'P2034' })).toBe(true);
        expect(esUnAhoraNoDeLaBase({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
        expect(esUnAhoraNoDeLaBase(new Error('deadlock detected'))).toBe(true);
        expect(esUnAhoraNoDeLaBase({ code: 'P2002' })).toBe(false);
        expect(esUnAhoraNoDeLaBase(new Error('Cannot read properties of undefined'))).toBe(false);
    });

    it('AHORANO-02: el manejador global responde 503 con Retry-After', async () => {
        const enviado: any = {};
        const reply: any = {
            status(c: number) { enviado.status = c; return reply; },
            code(c: number) { enviado.status = c; return reply; },
            header(k: string, v: string) { (enviado.headers ??= {})[k] = v; return reply; },
            send(b: unknown) { enviado.body = b; return reply; },
        };
        const request: any = { url: '/api/sessions/live-save', method: 'POST', headers: {}, id: 'x', log: { warn() {}, error() {} } };
        const e: any = Object.assign(new Error('Transaction API error: Unable to start a transaction in the given time.'), { code: 'P2028' });
        await errorHandler(e, request, reply);
        expect(enviado.status).toBe(503);
        expect(enviado.headers?.['Retry-After']).toBeTruthy();
    });
});
