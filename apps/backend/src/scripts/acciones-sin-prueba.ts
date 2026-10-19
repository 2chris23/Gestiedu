/**
 * CADA OPCIÓN, CON SU PRUEBA (puerta 4 de `docs/LISTO-PARA-EL-PILOTO.md`)
 *
 *   npx tsx src/scripts/acciones-sin-prueba.ts            # el resumen y la lista
 *   npx tsx src/scripts/acciones-sin-prueba.ts --exigir   # sale 1 si queda alguna
 *
 * Qué mide: arranca el servidor tal cual se sirve, apunta cada ruta que se
 * registra y la busca en las pruebas de integración y de navegador (la
 * dirección con cada `:param` como comodín, o su último trozo fijo si está en
 * una plantilla). Una ruta que no sale en ninguna prueba es una opción que
 * nadie ha comprobado.
 *
 * Qué NO mide: que la prueba compruebe el DATO (eso lo dice leerla), ni las
 * rutas que una prueba arma con variables raras. Es un piso, no un techo:
 * «sin prueba» seguro; «con prueba», probablemente.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fastifyModule = require('fastify');
const fabricaOriginal = fastifyModule.default ?? fastifyModule;
const rutas: Array<{ metodo: string; url: string }> = [];
function fabricaEspia(this: unknown, ...args: unknown[]) {
    const instancia = fabricaOriginal.apply(this, args);
    instancia.addHook('onRoute', (o: any) => {
        for (const m of Array.isArray(o.method) ? o.method : [o.method]) {
            if (m !== 'HEAD' && m !== 'OPTIONS') rutas.push({ metodo: m, url: o.url });
        }
    });
    return instancia;
}
Object.assign(fabricaEspia, fastifyModule);
(fabricaEspia as any).default = fabricaEspia;
(fabricaEspia as any).fastify = fabricaEspia;
require.cache[require.resolve('fastify')]!.exports = fabricaEspia;

const RAIZ = path.resolve(__dirname, '../..');
function archivos(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return (fs.readdirSync(dir, { recursive: true } as any) as string[])
        .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
        .map((f) => path.join(dir, f));
}
const PRUEBAS = [...archivos(path.join(RAIZ, 'tests')), ...archivos(path.resolve(RAIZ, '../../tests/e2e'))];
// Las pantallas también cuentan: una prueba de navegador pulsa el botón y la pantalla llama a la ruta.
const PANTALLAS = archivos(path.resolve(RAIZ, '../web/src'));

/**
 * Rutas que ninguna pantalla llama (comprobado buscando en `apps/web/src`, 19-oct-2026).
 * La puerta 4 es «cada opción funciona», y una opción es lo que se pulsa: estas
 * se cuentan aparte. Cada una dice por qué sigue. Quitarlas es un pendiente
 * (`docs/LISTO-PARA-EL-PILOTO.md`): menos puertas, menos que vigilar.
 */
const SIN_PANTALLA: Record<string, string> = {
    'POST /api/subjects/grade/:grade/assign': 'la pantalla que la usaba (SubjectTagManager) ya no existe; la usa schedule-conflict-doors para vigilar los choques',
    'DELETE /api/subjects/grade/:grade/:subjectId': 'igual; con trabajo responde 409 CLASE_CON_TRABAJO, como «Dónde se da»',
    'DELETE /api/classrooms/:classroomId/subjects/:subjectId': 'se quita en Materias → «Dónde se da»; con trabajo, 409 CLASE_CON_TRABAJO',
    'DELETE /api/schedules/:id': 'el horario viejo (Schedule): la web usa los bloques',
    'DELETE /api/students/:id': 'los usuarios se gestionan en /users; pide un cuid y el id es la cédula: no puede funcionar',
    'PUT /api/students/profile/me': 'nadie edita su propia ficha (solo el admin, en /users); la vigila auditoria-permisos',
    'POST /api/teachers': 'los usuarios se crean en /users',
    'PUT /api/teachers/:id': 'en /users; pide un cuid y el id es la cédula',
    'DELETE /api/teachers/:id': 'en /users; pide un cuid y el id es la cédula',
    'PUT /api/teachers/profile/me': 'nadie edita su propia ficha; la vigila auditoria-permisos',
    'POST /api/notifications/system': 'los avisos van por /api/avisos',
    'PUT /api/notifications/:id': 'los avisos van por /api/avisos',
    'DELETE /api/notifications/:id': 'los avisos van por /api/avisos',
    'PUT /api/institutes/:id/config': 'la configuración se guarda en /institutes/current/config',
    'POST /api/superadmin/institutes/:id/reprovision': 'herramienta de operación, sin pantalla (DESPLIEGUE.md)',
    'GET /api/superadmin/monitoring/alerts': 'herramienta de operación; el panel de Salud la sustituye',
    'PATCH /api/superadmin/monitoring/alerts/:id/resolve': 'herramienta de operación; el panel de Salud la sustituye',
};

const escapar =(s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `/api/students/:id/boleta` → busca `/students/<algo>/boleta`. */
function patron(url: string): RegExp {
    const sinApi = url.replace(/^\/api/, '');
    const partes = sinApi.split('/').filter(Boolean).map((p) => (p.startsWith(':') || p === '*' ? '[^/\'"`?\\s]+' : escapar(p)));
    return new RegExp('/' + partes.join('/') + '(?![\\w-])');
}

/**
 * ¿Sale en algún archivo? Entero, o sin su primer trozo si el archivo nombra
 * ese trozo (las pruebas suelen armar `const BASE = '/api/asistencia-qr'` y
 * luego pedir `/pases/${id}/cerrar`).
 */
function sale(url: string, textos: string[]): boolean {
    const entero = patron(url);
    const [primero, ...resto] = url.replace(/^\/api/, '').split('/').filter(Boolean);
    const sinPrimero = resto.length ? patron('/' + resto.join('/')) : null;
    return textos.some((t) => entero.test(t) || (!!sinPrimero && t.includes(primero) && sinPrimero.test(t)));
}

async function main() {
    const { buildServer } = await import('../server');
    const server = await buildServer();
    await server.ready();
    const textoPruebas = PRUEBAS.map((f) => fs.readFileSync(f, 'utf8'));
    const textoPantallas = PANTALLAS.map((f) => fs.readFileSync(f, 'utf8'));
    // Con --probadas=<carpeta>: lo que las pruebas pidieron DE VERDAD
    // (RUTAS_PROBADAS, `utils/rutas-probadas.ts`), no lo que se lee en ellas.
    const carpeta = process.argv.find((a) => a.startsWith('--probadas='))?.split('=')[1];
    let probadas: Set<string> | null = null;
    const probadasBien = new Set<string>();
    if (carpeta) {
        probadas = new Set();
        for (const f of fs.readdirSync(carpeta)) {
            for (const linea of fs.readFileSync(path.join(carpeta, f), 'utf8').split('\n')) {
                const [metodo, url, codigo] = linea.split(' ');
                if (!url) continue;
                probadas.add(`${metodo} ${url}`);
                if (Number(codigo) < 400) probadasBien.add(`${metodo} ${url}`);
            }
        }
    }
    const vistas = new Set<string>();
    const filas = rutas
        .filter((r) => r.url.startsWith('/api/') && !vistas.has(r.metodo + r.url) && vistas.add(r.metodo + r.url))
        .map((r) => {
            const clave = `${r.metodo} ${r.url}`;
            const enPrueba = probadas ? probadas.has(clave) : sale(r.url, textoPruebas);
            return { ...r, enPrueba, enPantalla: sale(r.url, textoPantallas), soloRechazos: probadas ? !probadasBien.has(clave) && enPrueba && !SIN_PANTALLA[clave] : false, sinPantalla: SIN_PANTALLA[clave] ?? null };
        });
    const escritura = (m: string) => m !== 'GET';
    const sin = filas.filter((f) => !f.enPrueba);
    const resumen = {
        rutas: filas.length,
        conPrueba: filas.length - sin.length,
        escrituras: filas.filter((f) => escritura(f.metodo)).length,
        escriturasSinPrueba: sin.filter((f) => escritura(f.metodo)).length,
        lecturasSinPrueba: sin.filter((f) => !escritura(f.metodo)).length,
        // Probadas solo por la puerta de atrás (403, 400…): nadie comprobó que funcionan.
        soloRechazos: filas.filter((f) => f.soloRechazos).length,
        sinPantalla: filas.filter((f) => f.sinPantalla).length,
    };
    console.log(JSON.stringify(resumen, null, 2));
    console.log('\nSin ninguna prueba (las que usa una pantalla, primero):');
    for (const f of sin.sort((a, b) => Number(b.enPantalla) - Number(a.enPantalla) || a.url.localeCompare(b.url))) {
        console.log(`${f.enPantalla ? '★' : ' '} ${f.metodo.padEnd(6)} ${f.url}`);
    }
    if (probadas) {
        console.log('\nProbadas solo con rechazos (ninguna prueba vio que funcionen):');
        for (const f of filas.filter((x) => x.soloRechazos)) console.log(`  ${f.metodo.padEnd(6)} ${f.url}`);
        console.log('\nSin pantalla (no son opciones que se pulsen; se cuentan aparte):');
        for (const f of filas.filter((x) => x.sinPantalla)) console.log(`  ${f.metodo.padEnd(6)} ${f.url} — ${f.sinPantalla}`);
    }
    await server.close().catch(() => undefined);
    process.exit(process.argv.includes('--exigir') && sin.length ? 1 : 0);
}
main().catch((e) => {
    console.error(e);
    process.exit(2);
});
