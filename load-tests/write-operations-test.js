/**
 * CARGA CON ESCRITURAS
 *
 * Lo que pasa en un día normal del liceo: casi todo el mundo leyendo, y un
 * puñado de profesores escribiendo a la vez (pasando asistencia, poniendo notas,
 * dejando actividades).
 *
 *   - 3.000 estudiantes  (solo leen)
 *   - 1.500 representantes (solo leen)
 *   -   150 profesores   (leen Y escriben)
 *   -    25 administrativos
 *
 * Duración: ~20 minutos.
 *
 * ─── DOS COSAS QUE HAY QUE SABER ANTES DE MIRAR LOS NÚMEROS ─────────────────
 *
 * 1. **Las credenciales se piden UNA vez, en setup().** Antes este archivo hacía
 *    login en cada iteración: con 4.675 usuarios eso son decenas de miles de
 *    logins por minuto. Medía bcrypt y el freno de peticiones, no las
 *    escrituras. Se midió: 278.181 rechazos por minuto, todos en /api/auth/login.
 *
 * 2. **Las credenciales caducan.** Con JWT_EXPIRES_IN=15m y una prueba de 20
 *    minutos, desde el minuto 15 todo devuelve 401 y el error se dispara sin que
 *    al sistema le pase nada. Para medir de verdad, arrancar el servidor con una
 *    caducidad mayor que la prueba (un .env.production temporal con
 *    JWT_EXPIRES_IN=45m; el .env pisa lo que se ponga en la consola).
 *
 * EJECUTAR:
 *   k6 run --summary-export=reports/write-summary.json write-operations-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders, trackCache } from './config.js';

// ─── Métricas ─────────────────────────────────────────────────────────────────
const writeOpsTotal = new Counter('write_operations_total');
const writeOpsFailed = new Counter('write_operations_failed');
const writeDuration = new Trend('write_duration', true);
const cacheHitRate = new Rate('cache_hit_rate');
const loginErrors = new Counter('login_errors');
const sinDatos = new Counter('escenarios_sin_datos');

// ─── Usuarios ─────────────────────────────────────────────────────────────────
const CSV = './test-users-5k.csv';

const leerCsv = (prefijo) =>
    open(CSV)
        .split('\n')
        .slice(1)
        .filter((l) => l.trim().startsWith(prefijo))
        .map((l) => {
            const p = l.trim().split(',');
            return { email: p[1], password: p[2] };
        });

const students = new SharedArray('students', () => leerCsv('STUDENT'));
const tutors = new SharedArray('tutors', () => leerCsv('TUTOR'));
const teachers = new SharedArray('teachers', () => leerCsv('TEACHER'));
const admins = new SharedArray('admins', () => leerCsv('ADMIN'));

export const options = {
    scenarios: {
        estudiantes: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 1500 },
                { duration: '14m', target: 3000 },
                { duration: '4m', target: 0 },
            ],
            exec: 'studentScenario',
            tags: { role: 'student' },
        },
        tutores: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 750 },
                { duration: '14m', target: 1500 },
                { duration: '4m', target: 0 },
            ],
            exec: 'tutorScenario',
            tags: { role: 'tutor' },
        },
        profesores_escritura: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 75 },
                { duration: '14m', target: 150 },
                { duration: '4m', target: 0 },
            ],
            exec: 'teacherWriteScenario',
            tags: { role: 'teacher' },
        },
        administrativos: {
            executor: 'constant-vus',
            vus: 25,
            duration: '20m',
            exec: 'adminScenario',
            tags: { role: 'admin' },
        },
    },
    setupTimeout: '10m',
    thresholds: {
        'http_req_duration': ['p(95)<800'],
        'http_req_duration{role:student}': ['p(95)<500'],
        'http_req_failed': ['rate<0.05'],
        'write_duration': ['p(95)<1500'],
    },
};

// ─── Login por tandas, sin saturar bcrypt ni el freno de peticiones ──────────
function batchLogin(usuarios, slug, tamano = 20) {
    const tokens = [];
    for (let i = 0; i < usuarios.length; i += tamano) {
        for (const u of usuarios.slice(i, i + tamano)) {
            tokens.push(loginUser(u.email, u.password, slug));
        }
        sleep(0.5);
    }
    return tokens;
}

export function setup() {
    const slug = config.instituteSlug;

    // Un puñado de credenciales alcanza: los VUs se las reparten por turnos.
    const muestraEstudiantes = students.slice(0, 100);
    const muestraTutores = tutors.slice(0, 50);
    const muestraProfesores = teachers.slice(0, 40);
    const muestraAdmins = admins.slice(0, 10);

    console.log(`[setup] Pidiendo credenciales de ${muestraEstudiantes.length} estudiantes...`);
    const studentTokens = batchLogin(muestraEstudiantes, slug);
    console.log(`[setup] Estudiantes: ${studentTokens.filter(Boolean).length}/${muestraEstudiantes.length}`);

    console.log(`[setup] Representantes...`);
    const tutorTokens = batchLogin(muestraTutores, slug);
    console.log(`[setup] Representantes: ${tutorTokens.filter(Boolean).length}/${muestraTutores.length}`);

    console.log(`[setup] Profesores...`);
    const teacherTokens = batchLogin(muestraProfesores, slug);
    console.log(`[setup] Profesores: ${teacherTokens.filter(Boolean).length}/${muestraProfesores.length}`);

    console.log(`[setup] Administrativos...`);
    const adminTokens = batchLogin(muestraAdmins, slug);
    console.log(`[setup] Administrativos: ${adminTokens.filter(Boolean).length}/${muestraAdmins.length}`);

    return { slug, studentTokens, tutorTokens, teacherTokens, adminTokens };
}

const tomarToken = (lista) => (lista && lista.length ? lista[__VU % lista.length] : null);

const anotarCache = (r) => {
    const h = trackCache(r);
    if (h === 'HIT') cacheHitRate.add(true);
    else if (h === 'MISS') cacheHitRate.add(false);
};

const leerJson = (r) => {
    try {
        return JSON.parse(r.body);
    } catch {
        return null;
    }
};

// ─── Estudiante: solo mira lo suyo ───────────────────────────────────────────
export function studentScenario(data) {
    const token = tomarToken(data.studentTokens);
    if (!token) {
        loginErrors.add(1);
        sleep(5);
        return;
    }
    const hdr = authHeaders(token, data.slug);

    const r = http.get(`${config.apiUrl}/api/dashboard/student`, { headers: hdr });
    check(r, { 'panel del alumno ok': (x) => x.status < 500 });
    anotarCache(r);
    sleep(5);

    http.get(`${config.apiUrl}/api/students/my-grades`, { headers: hdr });
    sleep(10);
    http.get(`${config.apiUrl}/api/students/my-attendance`, { headers: hdr });
    sleep(8);
    http.get(`${config.apiUrl}/api/activities/student/my-activities`, { headers: hdr });
    sleep(5);
}

// ─── Representante ───────────────────────────────────────────────────────────
export function tutorScenario(data) {
    const token = tomarToken(data.tutorTokens);
    if (!token) {
        loginErrors.add(1);
        sleep(5);
        return;
    }
    const hdr = authHeaders(token, data.slug);

    const r = http.get(`${config.apiUrl}/api/dashboard/tutor`, { headers: hdr });
    check(r, { 'panel del representante ok': (x) => x.status < 500 });
    anotarCache(r);
    sleep(4);

    http.get(`${config.apiUrl}/api/notifications/my-notifications`, { headers: hdr });
    sleep(6);
}

// ─── Profesor: mira sus secciones y escribe en ellas ─────────────────────────
export function teacherWriteScenario(data) {
    const token = tomarToken(data.teacherTokens);
    if (!token) {
        loginErrors.add(1);
        sleep(5);
        return;
    }
    const hdr = authHeaders(token, data.slug);

    let classroomId = null;
    let subjectId = null;
    let studentIds = [];

    group('Profesor: sus secciones', () => {
        const r = http.get(`${config.apiUrl}/api/teachers/my-classrooms`, { headers: hdr });
        check(r, { 'mis secciones ok': (x) => x.status < 500 });
        const d = leerJson(r);
        const lista = d && (d.classrooms || d.data || d);
        if (Array.isArray(lista) && lista.length > 0) {
            classroomId = lista[Math.floor(Math.random() * lista.length)].id;
        }
        sleep(2);
    });

    if (!classroomId) {
        sinDatos.add(1);
        sleep(10);
        return;
    }

    group('Profesor: materias de la sección', () => {
        const r = http.get(`${config.apiUrl}/api/classrooms/${classroomId}/subjects`, { headers: hdr });
        const d = leerJson(r);
        const lista = d && (d.subjects || d.data || d);
        if (Array.isArray(lista) && lista.length > 0) {
            const cs = lista[Math.floor(Math.random() * lista.length)];
            subjectId = cs.subjectId || (cs.subject && cs.subject.id) || cs.id;
        }
        sleep(2);
    });

    group('Profesor: alumnos de la sección', () => {
        const r = http.get(`${config.apiUrl}/api/students?classroomId=${classroomId}&limit=50`, {
            headers: hdr,
        });
        check(r, { 'alumnos ok': (x) => x.status < 500 });
        const d = leerJson(r);
        const lista = d && (d.students || d.data || d);
        if (Array.isArray(lista)) studentIds = lista.slice(0, 40).map((s) => s.id);
        sleep(3);
    });

    if (!subjectId || studentIds.length === 0) {
        sinDatos.add(1);
        sleep(10);
        return;
    }

    // ESCRITURA 1: pasar lista
    group('Profesor: pasar asistencia', () => {
        const inicio = Date.now();
        const hoy = new Date().toISOString().split('T')[0];
        const attendances = studentIds.map((id) => {
            const s = Math.random();
            return { studentId: id, status: s < 0.9 ? 'PRESENT' : s < 0.95 ? 'LATE' : 'ABSENT' };
        });

        const r = http.post(
            `${config.apiUrl}/api/attendance/bulk`,
            JSON.stringify({ classroomId, subjectId, date: hoy, attendances }),
            { headers: hdr }
        );

        writeDuration.add(Date.now() - inicio);
        writeOpsTotal.add(1, { type: 'asistencia' });
        if (r.status >= 400) writeOpsFailed.add(1);
        check(r, { 'asistencia sin error del servidor': (x) => x.status < 500 });
        sleep(20);
    });

    // ESCRITURA 2: guardar la clase (tema + asistencia), la pantalla más usada
    group('Profesor: guardar la clase', () => {
        const inicio = Date.now();
        const hoy = new Date().toISOString().split('T')[0];
        const r = http.post(
            `${config.apiUrl}/api/sessions/live-save`,
            JSON.stringify({
                classroomId,
                subjectId,
                date: hoy,
                topic: `Tema de carga ${Date.now()}`,
                attendances: studentIds.slice(0, 20).map((id) => ({ studentId: id, status: 'PRESENT' })),
            }),
            { headers: hdr }
        );
        writeDuration.add(Date.now() - inicio);
        writeOpsTotal.add(1, { type: 'clase' });
        if (r.status >= 400) writeOpsFailed.add(1);
        check(r, { 'clase sin error del servidor': (x) => x.status < 500 });
        sleep(15);
    });

    // ESCRITURA 3: dejar una actividad para los alumnos
    group('Profesor: dejar actividad', () => {
        const inicio = Date.now();
        const r = http.post(
            `${config.apiUrl}/api/sessions/activities`,
            JSON.stringify({
                classroomId,
                subjectId,
                title: `Actividad de carga ${Date.now()}`,
                description: 'Generada por la prueba de carga',
                target: 'NEXT',
                maxScore: 20,
            }),
            { headers: hdr }
        );
        writeDuration.add(Date.now() - inicio);
        writeOpsTotal.add(1, { type: 'actividad' });
        if (r.status >= 400) writeOpsFailed.add(1);
        check(r, { 'actividad sin error del servidor': (x) => x.status < 500 });
        sleep(15);
    });
}

// ─── Administrativo: mira los paneles del liceo ──────────────────────────────
export function adminScenario(data) {
    const token = tomarToken(data.adminTokens);
    if (!token) {
        loginErrors.add(1);
        sleep(5);
        return;
    }
    const hdr = authHeaders(token, data.slug);

    const r = http.get(`${config.apiUrl}/api/dashboard/admin`, { headers: hdr });
    check(r, { 'panel del admin ok': (x) => x.status < 500 });
    anotarCache(r);
    sleep(8);

    http.get(`${config.apiUrl}/api/users?limit=25`, { headers: hdr });
    sleep(12);
}

export function handleSummary(data) {
    const m = data.metrics;
    const v = (n, campo = 'value') => (m[n] && m[n].values ? m[n].values[campo] : 0);
    const p95 = (n) => (m[n] && m[n].values ? m[n].values['p(95)'] : 0);

    const linea = (etiqueta, valor, objetivo) =>
        `║ ${etiqueta.padEnd(26)} ${String(valor).padStart(12)}  ${objetivo.padEnd(18)}║`;

    const texto = [
        '',
        '╔══════════════════════════════════════════════════════════════════╗',
        '║              CARGA CON ESCRITURAS — RESULTADOS                   ║',
        '╠══════════════════════════════════════════════════════════════════╣',
        linea('Peticiones', Math.round(v('http_reqs', 'count')), ''),
        linea('p(95) general', `${Math.round(p95('http_req_duration'))} ms`, '(objetivo <800)'),
        linea('p(95) escrituras', `${Math.round(p95('write_duration'))} ms`, '(objetivo <1500)'),
        linea('Escrituras hechas', Math.round(v('write_operations_total', 'count')), ''),
        linea('Escrituras fallidas', Math.round(v('write_operations_failed', 'count')), ''),
        linea('Errores', `${(v('http_req_failed', 'rate') * 100).toFixed(2)}%`, '(objetivo <5%)'),
        linea('Aciertos de caché', `${(v('cache_hit_rate', 'rate') * 100).toFixed(1)}%`, ''),
        linea('Sin datos para escribir', Math.round(v('escenarios_sin_datos', 'count')), ''),
        '╚══════════════════════════════════════════════════════════════════╝',
        '',
    ].join('\n');

    // Ojo: al poner un resumen propio, k6 deja de escribir el --summary-export.
    // Se devuelve también el JSON para que el summary-export siga funcionando y
    // se puedan comparar dos mediciones.
    const salida = { stdout: texto };
    const destino = __ENV.SUMMARY_JSON;
    if (destino) salida[destino] = JSON.stringify(data, null, 1);
    return salida;
}
