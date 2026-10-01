import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { createTestServer } from '../helpers';

/**
 * PRIMERO SE PREGUNTA QUIÉN ERES, DESPUÉS SE MIRA LO QUE TRAES
 *
 * ─── LO QUE PASABA ───────────────────────────────────────────────────────────
 *
 * El servidor revisaba el **formulario** antes que la **credencial**. Sin
 * sesión ninguna, pidiendo crear un usuario con el formulario en blanco, no
 * respondía "no sé quién eres": respondía
 *
 *     400 — body must have required property 'email'
 *
 * y con cada intento iba soltando la ficha entera: que hay un campo `email`,
 * que hay `role` y que solo acepta ADMIN, TEACHER, STUDENT o TUTOR, que el
 * listado no deja pedir más de 100 de golpe... Se comprobó contra el servidor
 * en marcha, sin ninguna credencial.
 *
 * No entregaba datos del liceo — la credencial se seguía exigiendo antes de
 * tocar nada. Pero le entregaba a un desconocido **el plano del edificio**, que
 * es con lo que se empieza a buscar la ventana mal cerrada. Y hacía ruidosa la
 * prueba de "ninguna puerta abierta": un 400 tapaba el 401 que debía verse.
 *
 * ─── LO QUE SE HACE AHORA ────────────────────────────────────────────────────
 *
 * Los guardias (¿quién eres? ¿qué rol tienes?) se adelantan a la revisión del
 * formulario. A quien no se ha identificado se le responde 401 y ahí termina
 * todo: no llega a saber ni qué campos existen.
 *
 * ─── QUÉ VIGILA ESTA PRUEBA ──────────────────────────────────────────────────
 *
 * Recorre TODAS las rutas del servidor, no una lista escrita a mano: si mañana
 * alguien añade una ruta con formulario y el guardia queda detrás, esta prueba
 * se cae sola.
 */

/** Rutas públicas a propósito: ahí sí es correcto que se revise el formulario. */
const PUERTAS_PUBLICAS: RegExp[] = [
    /^\/$/,
    /^\/api$/,
    /^\/health/,
    /^\/metrics/,
    /^\/docs/,
    /^\/documentation/,
    /^\/public\//,
    /^\/uploads\//,
    /^\/api\/auth\/login/,
    /^\/api\/auth\/refresh/,
    // Entrar con la llave que guardó un teléfono es una PUERTA, como el login:
    // se llega sin sesión, por definición. Lo que se manda es una llave que
    // emitió el propio servidor, y si no vale se responde lo mismo que a una
    // contraseña mala. Ver `services/llave-del-telefono.service.ts`.
    /^\/api\/auth\/entrar-con-el-telefono/,
    /^\/api\/auth\/forgot-password/,
    /^\/api\/auth\/reset-password/,
    /^\/api\/superadmin\/auth\/login/,
    /^\/api\/superadmin\/auth\/refresh/,
    /^\/api\/institutes\/public/,
    /^\/api\/institutes\/by-subdomain/,
    /^\/api\/institutes\/by-domain/,
    /^\/api\/institutes\/resolve/,
];

const esPublica = (ruta: string) => PUERTAS_PUBLICAS.some((p) => p.test(ruta));

interface RutaDelServidor {
    metodo: string;
    ruta: string;
}

/** Le pregunta al propio servidor qué rutas sirve de verdad. */
function rutasDe(server: FastifyInstance): RutaDelServidor[] {
    const crudo = server.printRoutes({ commonPrefix: false });
    const rutas: RutaDelServidor[] = [];
    const trozoPorNivel: string[] = [];

    for (const lineaCruda of crudo.split('\n')) {
        if (!lineaCruda.trim()) continue;

        const dibujo = lineaCruda.match(/^[\s│├└─]*/)?.[0] ?? '';
        const nivel = Math.floor(dibujo.length / 4);
        const texto = lineaCruda.slice(dibujo.length);
        if (!texto) continue;

        const conMetodos = texto.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        const trozo = (conMetodos ? conMetodos[1] : texto).trim();

        trozoPorNivel[nivel] = trozo;
        trozoPorNivel.length = nivel + 1;

        if (!conMetodos) continue;

        const ruta = trozoPorNivel.join('');
        if (!ruta.startsWith('/')) continue;

        for (const metodo of conMetodos[2].split(',').map((x) => x.trim())) {
            if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
                rutas.push({ metodo, ruta: ruta.replace(/\/{2,}/g, '/') });
            }
        }
    }

    return rutas;
}

const conParametrosDePrueba = (ruta: string) =>
    ruta.replace(/:([A-Za-z0-9_]+)/g, 'algo-inventado').replace(/\/\*$/, '/x');

describe('Primero el guardia, después el formulario', () => {
    let server: FastifyInstance;
    let rutas: RutaDelServidor[];

    beforeAll(async () => {
        server = await createTestServer();
        rutas = rutasDe(server);
    }, 120000);

    afterAll(async () => {
        await server.close();
    });

    it('GUARDIA-01: sin credencial, un formulario en blanco se responde 401, no 400', async () => {
        const soplones: string[] = [];

        for (const r of rutas) {
            if (esPublica(r.ruta)) continue;
            if (r.metodo === 'GET' || r.metodo === 'DELETE') continue;

            const res = await (request(server.server) as any)
                [r.metodo.toLowerCase()](conParametrosDePrueba(r.ruta))
                .set('X-Institute-Slug', 'test-institute')
                .send({});

            if (res.status === 400) {
                const pista = res.body?.message ?? '';
                soplones.push(`${r.metodo} ${r.ruta} -> 400 "${pista}"`);
            }
        }

        if (soplones.length > 0) {
            throw new Error(
                `Estas rutas le cuentan a un desconocido qué campos esperan, en vez de responder 401:\n  ` +
                    soplones.join('\n  ')
            );
        }

        expect(soplones).toHaveLength(0);
    }, 300000);

    it('GUARDIA-02: sin credencial, un filtro fuera de rango se responde 401, no 400', async () => {
        const soplones: string[] = [];

        for (const r of rutas) {
            if (esPublica(r.ruta)) continue;
            if (r.metodo !== 'GET') continue;

            const res = await (request(server.server) as any)
                [r.metodo.toLowerCase()](conParametrosDePrueba(r.ruta))
                .query({ limit: 999999, page: -5 })
                .set('X-Institute-Slug', 'test-institute');

            if (res.status === 400) {
                soplones.push(`${r.metodo} ${r.ruta} -> 400 "${res.body?.message ?? ''}"`);
            }
        }

        if (soplones.length > 0) {
            throw new Error(
                `Estas rutas revisan los filtros antes de pedir la credencial:\n  ` + soplones.join('\n  ')
            );
        }

        expect(soplones).toHaveLength(0);
    }, 300000);

    it('GUARDIA-03: con una credencial inventada tampoco se llega a revisar el formulario', async () => {
        const jwt = require('jsonwebtoken');
        const inventado = jwt.sign(
            { id: 'V-12345678', userId: 'V-12345678', role: 'ADMIN', instituteId: 'institute' },
            'clave-que-el-atacante-se-invento',
            { expiresIn: '1h' }
        );

        const soplones: string[] = [];

        for (const r of rutas) {
            if (esPublica(r.ruta)) continue;
            if (r.metodo === 'GET' || r.metodo === 'DELETE') continue;

            const res = await (request(server.server) as any)
                [r.metodo.toLowerCase()](conParametrosDePrueba(r.ruta))
                .set('Authorization', `Bearer ${inventado}`)
                .set('X-Institute-Slug', 'test-institute')
                .send({});

            if (res.status === 400) {
                soplones.push(`${r.metodo} ${r.ruta} -> 400 "${res.body?.message ?? ''}"`);
            }
        }

        if (soplones.length > 0) {
            throw new Error(
                `Con un token falso estas rutas siguen contando qué campos esperan:\n  ` + soplones.join('\n  ')
            );
        }

        expect(soplones).toHaveLength(0);
    }, 300000);
});
