/**
 * EL MAPA DE RUTAS, SACADO DEL SERVIDOR (NO A MANO)
 *
 *   npx tsx src/scripts/mapa-de-rutas.ts > ../../docs/nube/mapa-de-rutas.md
 *
 * Qué mide: arranca el servidor tal cual se sirve, apunta cada ruta que se
 * registra (método, dirección, guardias que corren antes) y, para cada una,
 * busca en el código de su controlador —y en el servicio al que llama, un
 * nivel— qué guardias de ALCANCE usa (`assertClassroomScope`,
 * `assertCanSeeClassroom`, `canSeeStudent`…).
 *
 * Qué NO mide: si el guardia de alcance se aplica a TODOS los caminos del
 * controlador (un `if` puede saltárselo). Eso lo miden las pruebas de
 * integración (`quien-puede-que.test.ts`), con peticiones de verdad.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fastifyModule = require('fastify');
const fabricaOriginal = fastifyModule.default ?? fastifyModule;

interface Ruta {
    metodo: string;
    url: string;
    guardias: Function[];
    handler: Function;
}
const rutas: Ruta[] = [];

const lista = (x: unknown): Function[] => (!x ? [] : Array.isArray(x) ? x : [x as Function]);

/**
 * Los guardias puestos para todo un bloque (`fastify.addHook('onRequest',
 * authenticate)`) no vienen en las opciones de la ruta: se apuntan aquí, por
 * contexto, heredando los del contexto de arriba (Fastify los encapsula así).
 */
const GANCHOS = Symbol('ganchos');
const FASES = new Set(['onRequest', 'preParsing', 'preValidation', 'preHandler']);

function fabricaEspia(this: unknown, ...args: unknown[]) {
    const instancia = fabricaOriginal.apply(this, args);
    const addHookOriginal = instancia.addHook;
    instancia.addHook = function (this: any, fase: string, fn: Function) {
        if (FASES.has(fase)) {
            if (!Object.prototype.hasOwnProperty.call(this, GANCHOS)) {
                this[GANCHOS] = [...(this[GANCHOS] ?? [])];
            }
            this[GANCHOS].push(fn);
        }
        return addHookOriginal.apply(this, arguments as any);
    };
    instancia.addHook('onRoute', function (this: any, o: any) {
        const metodos = Array.isArray(o.method) ? o.method : [o.method];
        for (const m of metodos) {
            if (m === 'HEAD' || m === 'OPTIONS') continue;
            rutas.push({
                metodo: m,
                url: o.url,
                guardias: [...(this?.[GANCHOS] ?? []), ...lista(o.onRequest), ...lista(o.preHandler)],
                handler: o.handler,
            });
        }
    });
    return instancia;
}
Object.assign(fabricaEspia, fastifyModule);
(fabricaEspia as any).default = fabricaEspia;
(fabricaEspia as any).fastify = fabricaEspia;
require.cache[require.resolve('fastify')]!.exports = fabricaEspia;

const ALCANCE = [
    'assertClassroomScope',
    'assertCanSeeClassroom',
    'canSeeClassroom',
    'assertCanSeeStudent',
    'canSeeStudent',
    'teacherHandlesClassroom',
    'teacherHandlesSubject',
    'teacherClassroomIds',
    'assertPuedeVer',
    'studentTutor',
    'tutorId',
];

const RAIZ = path.resolve(__dirname, '..');
const fuentes = (dir: string) =>
    fs
        .readdirSync(path.join(RAIZ, dir), { recursive: true } as any)
        .map(String)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => fs.readFileSync(path.join(RAIZ, dir, f), 'utf8'));
let codigoControladores = '';
let codigoServicios = '';

/** El cuerpo de una función o método por su nombre (aproximado: hasta la siguiente al mismo nivel). */
function cuerpoDe(nombre: string, codigo: string): string | null {
    const re = new RegExp(
        `(?:function\\s+${nombre}\\s*\\(|\\b${nombre}\\s*[=:]\\s*async|\\basync\\s+${nombre}\\s*\\(|^\\s+${nombre}\\s*\\()`,
        'm'
    );
    const m = re.exec(codigo);
    if (!m) return null;
    const desde = m.index;
    const resto = codigo.slice(desde + 1);
    const fin = resto.search(/\n(export |  async [a-zA-Z]+\(|  [a-zA-Z]+\s*\(.*\)\s*[:{]|  (private |public )?async )/);
    return codigo.slice(desde, fin === -1 ? undefined : desde + 1 + fin);
}

function alcanceDe(handler: Function): string[] {
    const nombre = (handler.name || '').replace(/^bound /, '');
    let cuerpo = nombre && nombre !== 'anonymous' ? cuerpoDe(nombre, codigoControladores) : null;
    if (!cuerpo) cuerpo = handler.toString();
    let todo = cuerpo;
    for (const m of cuerpo.matchAll(/[sS]ervice\.([a-zA-Z0-9_]+)\(/g)) {
        todo += cuerpoDe(m[1], codigoServicios) ?? '';
    }
    for (const m of cuerpo.matchAll(/\b([a-z][a-zA-Z0-9]+)\(\s*request/g)) {
        todo += cuerpoDe(m[1], codigoControladores) ?? '';
    }
    return ALCANCE.filter((g) => todo.includes(g));
}

(async () => {
    codigoControladores = [...fuentes('controllers'), ...fuentes('routes')].join('\n');
    codigoServicios = fuentes('services').join('\n');

    const { buildServer } = await import('../server');
    const auth = await import('../middleware/auth.middleware');
    const nombres = new Map<Function, string>([
        [auth.authenticate, 'authenticate'],
        [auth.requireAdmin, 'requireAdmin'],
        [auth.requireTeacher, 'requireTeacher'],
        [auth.requireStudent, 'requireStudent'],
        [auth.requireTutor, 'requireTutor'],
        [auth.optionalAuthenticate, 'optionalAuthenticate'],
        [auth.verifyInstitute, 'verifyInstitute'],
    ]);

    const server = await buildServer();
    await server.ready();

    const filas = rutas
        .filter((r) => r.url.startsWith('/api'))
        .sort((a, b) => a.url.localeCompare(b.url) || a.metodo.localeCompare(b.metodo))
        .map((r) => {
            const g = r.guardias.map((f) => {
                if (nombres.has(f)) return nombres.get(f)!;
                const t = f.toString();
                if (t.includes('allowedRoles')) return 'requireRoles(…)';
                if (t.includes('userIdParam') || t.includes('Solo puedes acceder a tus propios datos'))
                    return 'requireSelfOrAdmin';
                return f.name && f.name !== 'anonymous' ? f.name : '';
            }).filter(Boolean);
            const conAuth = g.includes('authenticate') || g.some((x) => /superAdminAuth/i.test(x));
            const deTodas = new Set(['handleCors', 'helmetConfigureReply', 'helmetApplyHeaders', 'identifyTenant', 'smartCacheMiddleware', 'onRequest', 'preParsing', 'preHandler']);
            const rol = g.filter((x) => x !== 'authenticate' && !deTodas.has(x));
            return { ...r, conAuth, rol, alcance: alcanceDe(r.handler) };
        });

    const linea = (s: string[]) => (s.length ? s.map((x) => '`' + x + '`').join(' ') : '—');
    const out: string[] = [];
    out.push('# Mapa de rutas (sacado del servidor)');
    out.push('');
    out.push(`Generado por \`src/scripts/mapa-de-rutas.ts\`. ${filas.length} rutas bajo \`/api\`.`);
    out.push('Alcance = guardias de alcance que aparecen en el controlador o en el servicio al que llama');
    out.push('(heurística de código: lo que cuenta es la prueba `quien-puede-que.test.ts`).');
    out.push('');
    out.push('| Método | Ruta | authenticate | Guardia de rol | Guardia de alcance |');
    out.push('|---|---|---|---|---|');
    for (const f of filas) {
        out.push(`| ${f.metodo} | \`${f.url}\` | ${f.conAuth ? 'sí' : '**NO**'} | ${linea(f.rol)} | ${linea(f.alcance)} |`);
    }
    process.stdout.write(out.join('\n') + '\n');
    await server.close().catch(() => undefined);
    process.exit(0);
})();
