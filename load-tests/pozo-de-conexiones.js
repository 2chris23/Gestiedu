/**
 * ¿CUÁNTAS CONEXIONES A LA BASE HACEN FALTA?
 *
 * En la prueba grande, el 15% de las peticiones murieron todas con el mismo
 * error: "Timed out fetching a new connection from the connection pool
 * (connection limit: 2)".
 *
 * Dos por liceo. Y mientras eso pasaba, PostgreSQL tenía 100 plazas y solo 20
 * ocupadas. El sistema se estaba racionando solo.
 *
 * Esta prueba aísla esa variable: mucha gente pidiendo lo mismo —el panel del
 * estudiante, que es la pantalla que más se abre y la que más consultas hace— y
 * se mira qué cambia al mover `TENANT_CONNECTION_LIMIT`.
 *
 * Corta a propósito (4 minutos): se va a correr varias veces seguidas con
 * distintos valores y hay que poder comparar.
 *
 * EJECUTAR:
 *   k6 run --summary-export=reports/pozo-2.json load-tests/pozo-de-conexiones.js
 *
 * Entre una corrida y otra hay que reiniciar el servidor con el nuevo valor:
 * el pozo se crea al abrir la conexión con el liceo, no por petición.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders } from './config.js';

const sinConexion = new Counter('sin_conexion_a_la_base');
const otrosErrores = new Counter('otros_errores');
const duracion = new Trend('duracion_panel', true);
const exito = new Rate('salio_bien');

const CSV = './test-users-5k.csv';

const estudiantes = new SharedArray('estudiantes', () =>
    open(CSV)
        .split('\n')
        .slice(1)
        .filter((l) => l.trim().startsWith('STUDENT'))
        .map((l) => {
            const p = l.trim().split(',');
            return { email: p[1], password: p[2] };
        })
        .slice(0, 400)
);

export const options = {
    scenarios: {
        panel: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 400 },
                { duration: '3m', target: 400 },
                { duration: '30s', target: 0 },
            ],
            exec: 'mirarPanel',
        },
    },
    // Sin umbrales que corten: aquí interesa la cifra, no aprobar o suspender.
    thresholds: {},
};

/**
 * Las credenciales se piden UNA vez, en setup(). Pedirlas en cada vuelta mide
 * bcrypt y el freno de peticiones, no la base de datos.
 */
export function setup() {
    const tokens = [];
    for (const e of estudiantes) {
        const t = loginUser(e.email, e.password, config.instituteSlug);
        if (t) tokens.push(t);
    }
    console.log(`  credenciales listas: ${tokens.length} de ${estudiantes.length}`);
    return { tokens };
}

export function mirarPanel(datos) {
    const tokens = datos.tokens;
    if (!tokens || tokens.length === 0) return;

    const token = tokens[(__VU + __ITER) % tokens.length];
    const res = http.get(`${config.apiUrl}/api/dashboard/student`, {
        headers: authHeaders(token, config.instituteSlug),
        timeout: '30s',
        tags: { name: 'panel-estudiante' },
    });

    duracion.add(res.timings.duration);
    const bien = res.status === 200;
    exito.add(bien);

    if (!bien) {
        const cuerpo = String(res.body || '');
        if (cuerpo.includes('connection pool')) sinConexion.add(1);
        else otrosErrores.add(1);
    }

    check(res, { 'el panel responde': (r) => r.status === 200 });
}

export function handleSummary(datos) {
    const m = datos.metrics;
    const pedidas = m.http_reqs?.values?.count ?? 0;
    const pozo = m.sin_conexion_a_la_base?.values?.count ?? 0;
    const otros = m.otros_errores?.values?.count ?? 0;
    const ok = ((m.salio_bien?.values?.rate ?? 0) * 100).toFixed(1);

    const linea = (etiqueta, valor) => `  ${etiqueta.padEnd(34)} ${valor}`;

    const texto = [
        '',
        '  ═══════════════════════════════════════════════════',
        '  EL POZO DE CONEXIONES',
        '  ═══════════════════════════════════════════════════',
        linea('Peticiones', pedidas.toLocaleString('es-VE')),
        linea('Salieron bien', `${ok}%`),
        linea('Murieron sin conexión a la base', pozo.toLocaleString('es-VE')),
        linea('Otros errores', otros.toLocaleString('es-VE')),
        '',
        linea('Tiempo medio', `${(m.duracion_panel?.values?.avg ?? 0).toFixed(0)} ms`),
        linea('p95 (los 5 peores de cada 100)', `${(m.duracion_panel?.values?.['p(95)'] ?? 0).toFixed(0)} ms`),
        linea('El peor', `${(m.duracion_panel?.values?.max ?? 0).toFixed(0)} ms`),
        '  ═══════════════════════════════════════════════════',
        '',
    ].join('\n');

    const salida = { stdout: texto };
    if (__ENV.SUMMARY_JSON) salida[__ENV.SUMMARY_JSON] = JSON.stringify(datos, null, 2);
    return salida;
}
