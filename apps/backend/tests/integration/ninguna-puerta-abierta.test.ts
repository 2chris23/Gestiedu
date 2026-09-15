import { FastifyInstance } from 'fastify';
import request = require('supertest');
import { createTestServer } from '../helpers';

/**
 * NINGUNA PUERTA ABIERTA
 *
 * El dueño lo pidió así: *"no debe de haber forma que una persona pueda acceder
 * sin las credenciales"*.
 *
 * Las demás pruebas comprueban rutas concretas, una a una, y eso deja huecos:
 * la que nadie se acordó de probar es justo la que queda abierta. Esta prueba
 * hace lo contrario — **le pregunta al servidor qué rutas tiene** y las llama
 * todas sin credenciales. Si mañana alguien añade una ruta y olvida el guardia,
 * esta prueba se cae sola.
 *
 * Así se encontró que la copia guardada de respuestas leía el token sin
 * comprobar la firma: bastaba inventarse uno con la cédula de alguien para
 * recibir sus datos.
 *
 * ─── QUÉ SE ESPERA ───────────────────────────────────────────────────────────
 *
 * Sin credenciales, toda ruta tiene que responder 401 (o 404 si ni siquiera
 * llega a mirar quién eres). Lo que **no** puede responder es 200 con datos.
 */

/** Rutas que son públicas a propósito, con el motivo de por qué lo son. */
const PUERTAS_PUBLICAS: Array<{ patron: RegExp; porque: string }> = [
    { patron: /^\/$/, porque: 'portada de la API: nombre y versión, ningún dato del liceo' },
    { patron: /^\/api$/, porque: 'índice de la API: lista de rutas, ningún dato del liceo' },
    { patron: /^\/health/, porque: 'dice si el servidor está vivo; no lleva datos del liceo' },
    { patron: /^\/api\/health$/, porque: 'lo mismo, por la otra dirección; no lleva datos del liceo' },
    { patron: /^\/metrics/, porque: 'métricas del proceso, sin datos del liceo' },
    { patron: /^\/docs/, porque: 'documentación de la API' },
    { patron: /^\/api\/auth\/login/, porque: 'es donde se entra' },
    { patron: /^\/api\/auth\/refresh/, porque: 'renueva la sesión con el token de refresco' },
    { patron: /^\/api\/auth\/forgot-password/, porque: 'recuperar contraseña es anterior a tener sesión' },
    { patron: /^\/api\/auth\/reset-password/, porque: 'idem' },
    { patron: /^\/api\/superadmin\/auth\/login/, porque: 'entrada del superadministrador' },
    { patron: /^\/api\/institutes\/public/, porque: 'datos públicos del liceo para pintar el login' },
    { patron: /^\/api\/institutes\/by-subdomain/, porque: 'resuelve el liceo antes de entrar' },
    { patron: /^\/api\/institutes\/by-domain/, porque: 'idem' },
    { patron: /^\/api\/institutes\/resolve/, porque: 'idem' },
    {
        patron: /^\/api\/institutes\/current\/config$/,
        porque:
            'pinta la pantalla de entrar (nombre, logo, colores) antes de que haya sesión; ' +
            'sin credencial NO entrega nada más — lo vigila PUERTA-04',
    },
];

function esPublicaAProposito(ruta: string): string | null {
    const p = PUERTAS_PUBLICAS.find((x) => x.patron.test(ruta));
    return p ? p.porque : null;
}

/** Los parámetros se rellenan con algo inventado: da igual, no debería llegar a usarlos. */
function conParametrosDePrueba(ruta: string): string {
    return ruta.replace(/:([A-Za-z0-9_]+)/g, 'algo-inventado').replace(/\/\*$/, '/x');
}

interface RutaDelServidor {
    metodo: string;
    ruta: string;
}

/**
 * Le pregunta al propio servidor qué rutas tiene.
 *
 * Se hace así y no leyendo los archivos a propósito: lo que importa es lo que
 * el servidor sirve de verdad, no lo que parece que sirve.
 */
function rutasDe(server: FastifyInstance): RutaDelServidor[] {
    // Fastify lo pinta como un ÁRBOL, no como una lista: cada línea trae solo un
    // trozo de la ruta y hay que pegarlo a lo que viene de arriba.
    //
    //   ├── api (GET, HEAD)
    //   │   ├── /auth/login (POST)
    //
    // Se reconstruye siguiendo la profundidad de cada línea.
    const crudo = server.printRoutes({ commonPrefix: false });
    const rutas: RutaDelServidor[] = [];
    const trozoPorNivel: string[] = [];

    for (const lineaCruda of crudo.split('\n')) {
        if (!lineaCruda.trim()) continue;

        const dibujo = lineaCruda.match(/^[\s\u2502\u251c\u2514\u2500]*/)?.[0] ?? '';
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


/**
 * CADA LLAMADA, DESDE UNA CONEXIÓN DISTINTA
 *
 * ─── POR QUÉ HACE FALTA ESTO ─────────────────────────────────────────────────
 *
 * Esta prueba llama a 277 rutas seguidas desde la misma máquina. El servidor
 * tiene un tope de peticiones por conexión —100 por minuto para quien llega sin
 * credencial— y a partir de la número 101 empezaba a contestar
 *
 *     429 Too Many Requests
 *
 * 429 no es 2xx, así que la prueba lo daba por bueno y seguía. Resultado: de las
 * 277 puertas, **solo se estaban tocando las primeras 100**. Las otras 177 se
 * daban por cerradas sin haberlas probado nunca. Se midió: 100 respuestas
 * buenas y 40 rechazos de golpe en un barrido de 140 llamadas.
 *
 * Y detrás de ese muro estaba, entre otras, `/api/institutes/current/config`,
 * que entregaba sin ninguna credencial el correo del liceo, su configuración
 * académica, su plan contratado, su precio mensual y cuántos alumnos tiene.
 *
 * ─── CÓMO SE ARREGLA ─────────────────────────────────────────────────────────
 *
 * Cada llamada dice venir de una conexión distinta, así que ninguna consume el
 * cupo de la anterior. El tope sigue puesto y funcionando —no se desactiva
 * nada—, simplemente se deja de contar 277 visitantes como si fueran uno.
 *
 * Y por si acaso: si alguna respuesta vuelve a ser 429, la prueba se cae. Nunca
 * más puede decir "todo cerrado" sin haberlo comprobado.
 */
let contadorDeConexiones = 0;
function desdeOtraConexion(req: any) {
    contadorDeConexiones += 1;
    const n = contadorDeConexiones;
    return req.set('X-Forwarded-For', `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`);
}

describe('Ninguna puerta abierta', () => {
    let server: FastifyInstance;
    let rutas: RutaDelServidor[];
    /** Puertas que no se pudieron comprobar porque el servidor cortó por tope. */
    let sinComprobar: string[] = [];

    beforeAll(async () => {
        server = await createTestServer();
        rutas = rutasDe(server);
    }, 120000);

    afterAll(async () => {
        await server.close();
    });

    it('PUERTA-01: el servidor tiene rutas y se pueden enumerar', () => {
        expect(rutas.length).toBeGreaterThan(50);
    });

    it('PUERTA-02: ninguna ruta entrega datos sin credenciales', async () => {
        const abiertas: string[] = [];
        const publicas: string[] = [];
        sinComprobar = [];

        for (const r of rutas) {
            const motivo = esPublicaAProposito(r.ruta);
            if (motivo) {
                publicas.push(`${r.metodo} ${r.ruta} — ${motivo}`);
                continue;
            }

            const url = conParametrosDePrueba(r.ruta);
            const res = await desdeOtraConexion(
                (request(server.server) as any)[r.metodo.toLowerCase()](url)
            )
                .set('X-Institute-Slug', 'test-institute')
                .send({});

            // 429 significa que el servidor ni miró la petición: no se comprobó nada.
            if (res.status === 429) {
                sinComprobar.push(`${r.metodo} ${r.ruta}`);
                continue;
            }

            // 401 es lo correcto. 403/404/400 también cierran la puerta.
            // Lo que no puede pasar es 2xx: eso sería entregar algo sin credenciales.
            if (res.status >= 200 && res.status < 300) {
                abiertas.push(`${r.metodo} ${r.ruta} -> ${res.status}`);
            }
        }

        if (sinComprobar.length > 0) {
            throw new Error(
                `El servidor cortó por tope de peticiones y estas puertas NO se llegaron a tocar:\n  ` +
                    `${sinComprobar.join('\n  ')}\n\n` +
                    `Una puerta sin tocar no es una puerta cerrada.`
            );
        }

        if (abiertas.length > 0) {
            throw new Error(
                `Estas rutas responden SIN credenciales:\n  ${abiertas.join('\n  ')}\n\n` +
                    `Si alguna debe ser pública, se añade a PUERTAS_PUBLICAS con el motivo escrito.`
            );
        }

        console.log(`  ${rutas.length} rutas comprobadas · ${publicas.length} públicas a propósito`);
        expect(abiertas).toHaveLength(0);
    }, 300000);

    it('PUERTA-03: un token inventado tampoco abre nada', async () => {
        const jwt = require('jsonwebtoken');

        /**
         * Uno distinto para cada puerta, a propósito.
         *
         * El tope de peticiones cuenta por credencial: con el MISMO token
         * inventado en las 277 llamadas, a partir de la 101 el servidor
         * respondía 429 sin mirar nada y la prueba lo daba por cerrado. Cambiando
         * el token en cada llamada, cada una lleva su propia cuenta y todas se
         * comprueban de verdad. Sigue siendo un token falso: firmado con una
         * clave que no es la del sistema.
         */
        const tokenInventado = (n: number) =>
            jwt.sign(
                { id: `V-1234567${n}`, userId: `V-1234567${n}`, role: 'ADMIN', instituteId: 'institute' },
                'clave-que-el-atacante-se-invento',
                { expiresIn: '1h' }
            );

        let nIntento = 0;
        const abiertas: string[] = [];
        const noTocadas: string[] = [];

        for (const r of rutas) {
            if (esPublicaAProposito(r.ruta)) continue;

            const url = conParametrosDePrueba(r.ruta);
            const res = await desdeOtraConexion(
                (request(server.server) as any)[r.metodo.toLowerCase()](url)
            )
                .set('Authorization', `Bearer ${tokenInventado((nIntento += 1))}`)
                .set('X-Institute-Slug', 'test-institute')
                .send({});

            if (res.status === 429) {
                noTocadas.push(`${r.metodo} ${r.ruta}`);
                continue;
            }

            if (res.status >= 200 && res.status < 300) {
                abiertas.push(`${r.metodo} ${r.ruta} -> ${res.status}`);
            }
        }

        if (noTocadas.length > 0) {
            throw new Error(
                `El servidor cortó por tope y estas puertas NO se llegaron a tocar:\n  ${noTocadas.join('\n  ')}`
            );
        }

        if (abiertas.length > 0) {
            throw new Error(
                `Estas rutas aceptan un token INVENTADO (firmado con otra clave):\n  ${abiertas.join('\n  ')}`
            );
        }

        expect(abiertas).toHaveLength(0);
    }, 300000);

    /**
     * LA FICHA DEL LICEO NO SE REGALA
     *
     * `/api/institutes/current/config` tiene que seguir siendo pública: la
     * pantalla de entrar necesita el nombre, el logo y los colores antes de que
     * nadie haya escrito su contraseña.
     *
     * Pero entregaba la ficha ENTERA a quien la pidiera: correo y teléfono de la
     * dirección, configuración académica, plan contratado, precio mensual,
     * estado de pago, próxima fecha de cobro y cuánta gente hay matriculada.
     * Todo eso con saber solo el nombre corto del liceo, que va en la dirección
     * de internet y por tanto lo sabe cualquiera.
     *
     * Esta prueba fija qué puede salir por ahí sin credencial. Si mañana alguien
     * añade un campo nuevo a la ficha, no se cuela solo: hay que ponerlo aquí a
     * mano y explicar por qué es de la portada.
     */
    it('PUERTA-04: sin credenciales, la ficha del liceo solo da lo de la portada', async () => {
        const DE_LA_PORTADA = [
            'id',
            'name',
            'slug',
            'subdomain',
            'status',
            'logo',
            'favicon',
            'primaryColor',
            'secondaryColor',
            'timezone',
        ];

        const res = await desdeOtraConexion(request(server.server).get('/api/institutes/current/config')).set(
            'X-Institute-Slug',
            'test-institute'
        );

        expect(res.status).toBe(200);

        const deMas = Object.keys(res.body?.data ?? {}).filter((c) => !DE_LA_PORTADA.includes(c));

        if (deMas.length > 0) {
            throw new Error(
                `Sin credenciales se está entregando de más: ${deMas.join(', ')}.\n` +
                    `De la portada solo puede salir: ${DE_LA_PORTADA.join(', ')}.`
            );
        }

        // Y lo de la portada tiene que estar: si no, la pantalla de entrar se
        // queda sin logo ni colores.
        expect(res.body?.data?.name).toBeTruthy();
    }, 60000);
});
