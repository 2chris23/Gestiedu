/**
 * LECTURAS Y ESCRITURAS A LA VEZ — DEL TAMAÑO QUE EL EQUIPO AGUANTA
 *
 * `write-operations-test.js` levanta 4.675 usuarios simulados. En un equipo de
 * 16 GB eso no se puede medir: el propio k6 se come 2,4 GB, el servidor otros
 * 2 GB, y lo que acaba muriendo es la máquina, no el sistema. Se midió: con
 * memoria libre por debajo de 2 GB, el servidor desaparece y la cifra no dice
 * nada de producción.
 *
 * Esta prueba es la misma idea a escala que sí cabe: pocas personas, pero
 * **leyendo y escribiendo a la vez**, que es lo que tira la caché y manda a todo
 * el mundo a la base de datos. Los números absolutos dependen del equipo; lo que
 * vale es **comparar dos configuraciones** corriendo esto mismo dos veces.
 *
 * EJECUTAR:
 *   API_URL=http://localhost:3002 k6 run load-tests/lectura-y-escritura.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders } from './config.js';

const sinConexion = new Counter('sin_conexion_a_la_base');
const ocupado = new Counter('servidor_ocupado_503');
const otrosErrores = new Counter('otros_errores');
const lectura = new Trend('lectura_ms', true);
const escritura = new Trend('escritura_ms', true);
const escriturasHechas = new Counter('escrituras_hechas');
const escriturasFallidas = new Counter('escrituras_fallidas');
const exito = new Rate('salio_bien');

const CSV = './test-users-5k.csv';

const leerCsv = (prefijo, cuantos) =>
    open(CSV)
        .split('\n')
        .slice(1)
        .filter((l) => l.trim().startsWith(prefijo))
        .map((l) => {
            const p = l.trim().split(',');
            return { email: p[1], password: p[2] };
        })
        .slice(0, cuantos);

/** Cuánta gente simular. Se sube poco a poco para encontrar el techo de UNA instancia. */
const CUANTOS_LEEN = Number(__ENV.LECTORES || 300);
const CUANTOS_ESCRIBEN = Number(__ENV.ESCRITORES || 30);

const estudiantes = new SharedArray('estudiantes', () => leerCsv('STUDENT', CUANTOS_LEEN));
const profesores = new SharedArray('profesores', () => leerCsv('TEACHER', CUANTOS_ESCRIBEN));

export const options = {
    scenarios: {
        leen: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: CUANTOS_LEEN },
                { duration: '4m', target: CUANTOS_LEEN },
                { duration: '30s', target: 0 },
            ],
            exec: 'leer',
        },
        escriben: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: CUANTOS_ESCRIBEN },
                { duration: '4m', target: CUANTOS_ESCRIBEN },
                { duration: '30s', target: 0 },
            ],
            exec: 'escribir',
        },
    },
    thresholds: {},
};

export function setup() {
    const deLectura = [];
    for (const e of estudiantes) {
        const t = loginUser(e.email, e.password, config.instituteSlug);
        if (t) deLectura.push(t);
    }

    const deEscritura = [];
    for (const p of profesores) {
        const t = loginUser(p.email, p.password, config.instituteSlug);
        if (t) deEscritura.push(t);
    }

    console.log(`  credenciales: ${deLectura.length} que leen · ${deEscritura.length} que escriben`);
    return { deLectura, deEscritura };
}

/** Clasifica un fallo para saber POR QUÉ falló, no solo que falló. */
function anotarFallo(res) {
    const cuerpo = String(res.body || '');
    if (res.status === 503) ocupado.add(1);
    else if (cuerpo.includes('connection pool')) sinConexion.add(1);
    else otrosErrores.add(1);
}

export function leer(datos) {
    const tokens = datos.deLectura;
    if (!tokens || tokens.length === 0) return;
    const token = tokens[(__VU + __ITER) % tokens.length];

    const res = http.get(`${config.apiUrl}/api/dashboard/student`, {
        headers: authHeaders(token, config.instituteSlug),
        timeout: '30s',
        tags: { name: 'panel-estudiante' },
    });

    lectura.add(res.timings.duration);
    const bien = res.status === 200;
    exito.add(bien);
    if (!bien) anotarFallo(res);
    check(res, { 'el panel responde': (r) => r.status === 200 });
}

/**
 * Los profesores miran sus secciones y dejan una observación.
 *
 * Se eligió la observación y no la nota a propósito: una nota exige una
 * actividad libre por alumno (solo se admite una por actividad), y el escenario
 * acabaría midiendo la búsqueda de huecos en vez de la escritura.
 */
export function escribir(datos) {
    const tokens = datos.deEscritura;
    if (!tokens || tokens.length === 0) return;
    const token = tokens[(__VU + __ITER) % tokens.length];
    const cabeceras = authHeaders(token, config.instituteSlug);

    const mias = http.get(`${config.apiUrl}/api/teachers/my-classrooms`, {
        headers: cabeceras,
        timeout: '30s',
        tags: { name: 'mis-secciones' },
    });

    lectura.add(mias.timings.duration);
    exito.add(mias.status === 200);
    if (mias.status !== 200) {
        anotarFallo(mias);
        return;
    }

    let seccion = null;
    try {
        const cuerpo = JSON.parse(mias.body);
        const lista = cuerpo?.classrooms ?? cuerpo?.data?.classrooms ?? cuerpo?.data ?? [];
        if (Array.isArray(lista) && lista.length > 0) seccion = lista[0];
    } catch {
        // cuerpo inesperado: se cuenta como error y se sigue
    }
    if (!seccion?.id) return;

    const alumnos = http.get(`${config.apiUrl}/api/students?classroomId=${seccion.id}&limit=20`, {
        headers: cabeceras,
        timeout: '30s',
        tags: { name: 'alumnos-de-la-seccion' },
    });

    lectura.add(alumnos.timings.duration);
    exito.add(alumnos.status === 200);
    if (alumnos.status !== 200) {
        anotarFallo(alumnos);
        return;
    }

    let alumno = null;
    try {
        const cuerpo = JSON.parse(alumnos.body);
        const lista = cuerpo?.students ?? cuerpo?.data?.items ?? cuerpo?.data ?? [];
        if (Array.isArray(lista) && lista.length > 0) {
            alumno = lista[Math.floor(Math.random() * lista.length)];
        }
    } catch {
        // igual que arriba
    }
    if (!alumno?.id) return;

    const res = http.post(
        `${config.apiUrl}/api/observations`,
        JSON.stringify({
            // El controlador espera una LISTA de alumnos (`studentIds`), no uno
            // suelto. Con `studentId` responde 400 y la prueba no escribe nada:
            // parecería que todo va bien cuando en realidad no se midió nada.
            studentIds: [alumno.id],
            classroomId: seccion.id,
            title: `Carga ${__VU}-${__ITER}`,
            description: 'Observación creada por la prueba de carga',
            type: 'OBSERVACION',
        }),
        { headers: cabeceras, timeout: '30s', tags: { name: 'crear-observacion' } }
    );

    escritura.add(res.timings.duration);
    const guardo = res.status === 200 || res.status === 201;
    exito.add(guardo);
    if (guardo) escriturasHechas.add(1);
    else {
        escriturasFallidas.add(1);
        anotarFallo(res);
    }
}

export function handleSummary(datos) {
    const m = datos.metrics;
    const linea = (e, v) => `  ${e.padEnd(36)} ${v}`;
    // `toLocaleString` revienta dentro de k6 (su motor no trae Intl completo) y
    // tumba el resumen entero después de 5 minutos de prueba. Se formatea a mano.
    const n = (x) => String(Math.round(x ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const ms = (metrica, campo) => `${(m[metrica]?.values?.[campo] ?? 0).toFixed(0)} ms`;

    const texto = [
        '',
        '  ═══════════════════════════════════════════════════════',
        '  LEYENDO Y ESCRIBIENDO A LA VEZ',
        '  ═══════════════════════════════════════════════════════',
        linea('Peticiones', n(m.http_reqs?.values?.count)),
        linea('Salieron bien', `${((m.salio_bien?.values?.rate ?? 0) * 100).toFixed(1)}%`),
        '',
        linea('Escrituras guardadas', n(m.escrituras_hechas?.values?.count)),
        linea('Escrituras perdidas', n(m.escrituras_fallidas?.values?.count)),
        '',
        '  Por qué falló lo que falló:',
        linea('  sin conexión a la base', n(m.sin_conexion_a_la_base?.values?.count)),
        linea('  servidor ocupado (503, a propósito)', n(m.servidor_ocupado_503?.values?.count)),
        linea('  otros', n(m.otros_errores?.values?.count)),
        '',
        linea('Lectura — media', ms('lectura_ms', 'avg')),
        linea('Lectura — p95', ms('lectura_ms', 'p(95)')),
        linea('Escritura — media', ms('escritura_ms', 'avg')),
        linea('Escritura — p95', ms('escritura_ms', 'p(95)')),
        '  ═══════════════════════════════════════════════════════',
        '',
    ].join('\n');

    const salida = { stdout: texto };
    if (__ENV.SUMMARY_JSON) salida[__ENV.SUMMARY_JSON] = JSON.stringify(datos, null, 2);
    return salida;
}
