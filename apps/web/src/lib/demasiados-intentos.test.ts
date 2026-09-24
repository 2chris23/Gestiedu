/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/login/route';
import { avisoDeDemasiadosIntentos, segundosDeEspera } from './demasiados-intentos';

/**
 * CUANDO SE FRENA LA ENTRADA, SE AVISA EN ESPAÑOL
 *
 * En la pantalla de entrar salía «Too Many Requests»: `/api/auth/login` pasaba
 * el `error` del servidor de datos, que en un 429 es el nombre del código en
 * inglés, antes que su `message`.
 */
describe('Demasiados intentos', () => {
    it('lee Retry-After en segundos', () => {
        expect(segundosDeEspera('60')).toBe(60);
        expect(segundosDeEspera(' 900 ')).toBe(900);
    });

    it('lee Retry-After como fecha', () => {
        const ahora = Date.parse('2026-09-24T10:00:00Z');
        expect(segundosDeEspera('Thu, 24 Sep 2026 10:02:00 GMT', ahora)).toBe(120);
    });

    it('sin Retry-After, o si no se entiende, no se inventa una espera', () => {
        expect(segundosDeEspera(null)).toBeNull();
        expect(segundosDeEspera('')).toBeNull();
        expect(segundosDeEspera('0')).toBeNull();
        expect(segundosDeEspera('pronto')).toBeNull();
        expect(segundosDeEspera('Thu, 24 Sep 2026 09:00:00 GMT', Date.parse('2026-09-24T10:00:00Z'))).toBeNull();
    });

    it('el aviso dice cuánto esperar, redondeando hacia arriba', () => {
        expect(avisoDeDemasiadosIntentos(null)).toBe('Demasiados intentos. Espera un minuto y vuelve a probar.');
        expect(avisoDeDemasiadosIntentos(60)).toBe('Demasiados intentos. Espera un minuto y vuelve a probar.');
        expect(avisoDeDemasiadosIntentos(30)).toBe('Demasiados intentos. Espera 30 segundos y vuelve a probar.');
        expect(avisoDeDemasiadosIntentos(1)).toBe('Demasiados intentos. Espera un segundo y vuelve a probar.');
        expect(avisoDeDemasiadosIntentos(61)).toBe('Demasiados intentos. Espera 2 minutos y vuelve a probar.');
        expect(avisoDeDemasiadosIntentos(900)).toBe('Demasiados intentos. Espera 15 minutos y vuelve a probar.');
    });
});

describe('POST /api/auth/login ante un 429 del servidor de datos', () => {
    const fetchOriginal = global.fetch;
    afterEach(() => {
        global.fetch = fetchOriginal;
    });

    const contesta = (status: number, cuerpo: object, cabeceras: Record<string, string> = {}) => {
        global.fetch = jest.fn().mockResolvedValue(
            new Response(JSON.stringify(cuerpo), {
                status,
                headers: { 'Content-Type': 'application/json', ...cabeceras },
            })
        ) as typeof fetch;
    };

    const entrar = () =>
        POST(
            new NextRequest('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': 'sanmiguel' },
                body: JSON.stringify({ email: 'ana@liceo.ve', password: 'equivocada', instituteSlug: 'sanmiguel' }),
            })
        );

    it('el contador de entradas: aviso en español con la espera de Retry-After', async () => {
        // Lo que manda `userRateLimit` (apps/backend/src/middleware/auth.middleware.ts).
        contesta(
            429,
            {
                success: false,
                statusCode: 429,
                error: 'Too Many Requests',
                message: 'Demasiados intentos. Inténtalo nuevamente en 60 segundos.',
            },
            { 'Retry-After': '60' }
        );

        const respuesta = await entrar();
        const cuerpo = await respuesta.json();

        expect(respuesta.status).toBe(429);
        expect(cuerpo.message).toBe('Demasiados intentos. Espera un minuto y vuelve a probar.');
        expect(cuerpo.message).not.toMatch(/Too Many Requests/);
        expect(respuesta.headers.get('Retry-After')).toBe('60');
    });

    it('la cuenta cerrada por fallos: sin Retry-After, vale lo que dice en minutos', async () => {
        // Lo que manda `respuestaDeCuentaCerrada` (utils/no-probar-contrasenas-a-lo-bruto.ts).
        contesta(429, {
            error: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.',
            message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.',
            code: 'DEMASIADOS_INTENTOS',
            minutos: 15,
        });

        const respuesta = await entrar();

        expect(respuesta.status).toBe(429);
        expect((await respuesta.json()).message).toBe('Demasiados intentos. Espera 15 minutos y vuelve a probar.');
        expect(respuesta.headers.get('Retry-After')).toBe('900');
    });

    it('un 429 sin cuerpo ni Retry-After: se pide un minuto', async () => {
        global.fetch = jest.fn().mockResolvedValue(new Response('Too Many Requests', { status: 429 })) as typeof fetch;

        const respuesta = await entrar();

        expect((await respuesta.json()).message).toBe('Demasiados intentos. Espera un minuto y vuelve a probar.');
        expect(respuesta.headers.get('Retry-After')).toBeNull();
    });

    it('los demás errores siguen como estaban', async () => {
        contesta(401, { error: 'Credenciales inválidas' });

        const respuesta = await entrar();

        expect(respuesta.status).toBe(401);
        expect((await respuesta.json()).message).toBe('Credenciales inválidas');
    });
});
