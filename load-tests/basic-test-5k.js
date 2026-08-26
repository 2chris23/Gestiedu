/**
 * TEST BÁSICO 1.5K (Windows Localhost Edition)
 *
 * Simula solo lectura a escala adecuada para Windows localhost:
 * - 60% Estudiantes (900 VUs)
 * - 30% Tutores   (450 VUs)
 * - 10% Profesores lectura (150 VUs)
 *
 * Rampa: 150 → 600 → 1500 VUs
 * Duración total: ~20 minutos
 *
 * EJECUTAR:
 *   k6 run --env API_URL=http://localhost:3001 --env INSTITUTE_SLUG=test-load-5k basic-test-5k.js
 *
 * ARQUITECTURA:
 *   setup()  → Pre-login de TODOS los usuarios antes del test (1 vez total, sin VUs activos)
 *   default  → VUs usan tokens pre-obtenidos, NUNCA llaman a bcrypt durante el test
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, authHeaders, trackCache } from './config.js';

// ─── Métricas personalizadas ─────────────────────────────────────────────────
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const loginErrors = new Counter('login_errors');
const cacheHitRate = new Rate('cache_hit_rate');
const dashboardDuration = new Trend('dashboard_duration', true);
const gradesDuration = new Trend('grades_duration', true);
const attendanceDuration = new Trend('attendance_duration', true);

// ─── Datos de usuarios (cargados en init, compartidos) ───────────────────────
const CSV_PATH = './test-users-5k.csv';

const students = new SharedArray('students', function () {
    const data = open(CSV_PATH);
    return data.split('\n').slice(1)
        .filter(l => l.trim().startsWith('STUDENT'))
        .map(l => { const p = l.trim().split(','); return { email: p[1], password: p[2] }; });
});

const tutors = new SharedArray('tutors', function () {
    const data = open(CSV_PATH);
    return data.split('\n').slice(1)
        .filter(l => l.trim().startsWith('TUTOR'))
        .map(l => { const p = l.trim().split(','); return { email: p[1], password: p[2] }; });
});

const teachers = new SharedArray('teachers', function () {
    const data = open(CSV_PATH);
    return data.split('\n').slice(1)
        .filter(l => l.trim().startsWith('TEACHER'))
        .map(l => { const p = l.trim().split(','); return { email: p[1], password: p[2] }; });
});

// ─── Configuración de carga ───────────────────────────────────────────────────
export const options = {
    scenarios: {
        // 60% estudiantes → pico 900 VUs
        estudiantes: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 150 },   // Warm up
                { duration: '2m', target: 150 },
                { duration: '3m', target: 450 },   // Ramp up
                { duration: '3m', target: 450 },
                { duration: '4m', target: 900 },   // Peak
                { duration: '4m', target: 900 },
                { duration: '2m', target: 0 },     // Cool down
            ],
            exec: 'studentScenario',
            tags: { role: 'student' },
        },
        // 30% tutores → pico 450 VUs
        tutores: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 75 },
                { duration: '2m', target: 75 },
                { duration: '3m', target: 200 },
                { duration: '3m', target: 200 },
                { duration: '4m', target: 450 },
                { duration: '4m', target: 450 },
                { duration: '2m', target: 0 },
            ],
            exec: 'tutorScenario',
            tags: { role: 'tutor' },
        },
        // 10% profesores (solo lectura) → pico 150 VUs
        profesores_read: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 25 },
                { duration: '2m', target: 25 },
                { duration: '3m', target: 70 },
                { duration: '3m', target: 70 },
                { duration: '4m', target: 150 },
                { duration: '4m', target: 150 },
                { duration: '2m', target: 0 },
            ],
            exec: 'teacherReadScenario',
            tags: { role: 'teacher' },
        },
    },
    setupTimeout: '5m',   // Login secuencial de pocos usuarios (~10s por cada 50)
    thresholds: {
        'http_req_duration{role:student}': ['p(95)<500'],
        'http_req_duration{role:tutor}': ['p(95)<500'],
        'http_req_duration{role:teacher}': ['p(95)<600'],
        'http_req_failed': ['rate<0.05'],       // 5% tolerancia
        'cache_hit_rate': ['rate>0.50'],        // 50% cache hits
        'dashboard_duration': ['p(95)<500'],
        'http_reqs': ['rate>100'],              // Objetivo mínimo conservador
    },
};

// ─── Helper: login en batch ───────────────────────────────────────────────────
/**
 * Hace login de un array de usuarios en batches PEQUEÑOS para no saturar bcrypt.
 * batchSize=5 permite ~200ms/batch con cost=8 → estable bajo carga.
 */
function batchLogin(users, slug, batchSize = 5) {
    const tokens = new Array(users.length).fill(null);
    const BASE_URL = config.apiUrl;

    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        const requests = batch.map(u => ([
            'POST',
            `${BASE_URL}/api/auth/login`,
            JSON.stringify({ email: u.email, password: u.password }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Institute-Slug': slug,
                    'X-Subdomain': slug,
                },
                timeout: '30s',
            }
        ]));

        const responses = http.batch(requests);

        for (let j = 0; j < responses.length; j++) {
            const res = responses[j];
            if (res.status === 200 || res.status === 201) {
                try {
                    const body = JSON.parse(res.body);
                    // LoginResponse: { user: {...}, tokens: { accessToken, refreshToken, ... } }
                    const token = body?.tokens?.accessToken
                        || body?.accessToken
                        || body?.token
                        || body?.data?.token
                        || null;
                    tokens[i + j] = token;
                } catch { /* token sigue null */ }
            }
        }

        sleep(0.1); // Pequeña pausa entre batches
    }

    return tokens;
}

// ─── setup(): Pre-login de todos los usuarios ANTES del test ─────────────────
/**
 * Corre UNA SOLA VEZ antes de que arranquen los VUs.
 * Solo loguea los usuarios que los VUs necesitan (no todos los del CSV).
 */
export function setup() {
    const slug = config.instituteSlug;

    // Logeamos un SUBCONJUNTO pequeño — los VUs usan round-robin sobre estos tokens
    // (vu % tokens.length) → 100 tokens son suficientes para 900 VUs concurrentes
    const MAX_STUDENTS = 100;
    const MAX_TUTORS = 50;
    const MAX_TEACHERS = 30;

    const studentSample = students.slice(0, MAX_STUDENTS);
    const tutorSample = tutors.slice(0, MAX_TUTORS);
    const teacherSample = teachers.slice(0, MAX_TEACHERS);

    console.log(`[setup] Pre-login de ${studentSample.length} estudiantes (de ${students.length} en CSV)...`);
    const studentTokens = batchLogin(studentSample, slug, 20);
    const studentOk = studentTokens.filter(t => t !== null).length;
    console.log(`[setup] Estudiantes: ${studentOk}/${studentSample.length} tokens OK`);

    console.log(`[setup] Pre-login de ${tutorSample.length} tutores...`);
    const tutorTokens = batchLogin(tutorSample, slug, 20);
    const tutorOk = tutorTokens.filter(t => t !== null).length;
    console.log(`[setup] Tutores: ${tutorOk}/${tutorSample.length} tokens OK`);

    console.log(`[setup] Pre-login de ${teacherSample.length} profesores...`);
    const teacherTokens = batchLogin(teacherSample, slug, 20);
    const teacherOk = teacherTokens.filter(t => t !== null).length;
    console.log(`[setup] Profesores: ${teacherOk}/${teacherSample.length} tokens OK`);

    const total = studentOk + tutorOk + teacherOk;
    console.log(`[setup] TOTAL: ${total}/1500 tokens listos. Iniciando test...`);

    return {
        studentTokens,
        tutorTokens,
        teacherTokens,
        slug,
    };
}

// ─── Escenario: Estudiante ─────────────────────────────────────────────────────
export function studentScenario(data) {
    const idx = (__VU - 1) % data.studentTokens.length;
    const token = data.studentTokens[idx];

    if (!token) { loginErrors.add(1); sleep(5); return; }
    const hdr = authHeaders(token, data.slug);

    group('Student: Dashboard', () => {
        const start = Date.now();
        // GET /api/dashboard/student (requireStudent)
        const r = http.get(`${config.apiUrl}/api/dashboard/student`, { headers: hdr });
        dashboardDuration.add(Date.now() - start);
        check(r, { 'dashboard ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(5);

    group('Student: Notas', () => {
        const start = Date.now();
        // GET /api/students/my-grades (requireStudent)
        const r = http.get(`${config.apiUrl}/api/students/my-grades`, { headers: hdr });
        gradesDuration.add(Date.now() - start);
        check(r, { 'grades ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(10);

    group('Student: Asistencia', () => {
        const start = Date.now();
        // GET /api/students/my-attendance (requireStudent)
        const r = http.get(`${config.apiUrl}/api/students/my-attendance`, { headers: hdr });
        attendanceDuration.add(Date.now() - start);
        check(r, { 'attendance ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(8);

    group('Student: Actividades', () => {
        // GET /api/activities/student/my-activities (requireStudent)
        const r = http.get(`${config.apiUrl}/api/activities/student/my-activities`, { headers: hdr });
        check(r, { 'activities ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(5);

    group('Student: Notificaciones', () => {
        // GET /api/notifications/my-notifications (authenticate)
        const r = http.get(`${config.apiUrl}/api/notifications/my-notifications`, { headers: hdr });
        check(r, { 'notif ok': (x) => x.status < 500 });
    });
    sleep(3);
}

// ─── Escenario: Tutor ──────────────────────────────────────────────────────────
export function tutorScenario(data) {
    const idx = (__VU - 1) % data.tutorTokens.length;
    const token = data.tutorTokens[idx];

    if (!token) { loginErrors.add(1); sleep(5); return; }
    const hdr = authHeaders(token, data.slug);

    group('Tutor: Dashboard', () => {
        const start = Date.now();
        // GET /api/dashboard/tutor (requireTutor)
        const r = http.get(`${config.apiUrl}/api/dashboard/tutor`, { headers: hdr });
        dashboardDuration.add(Date.now() - start);
        check(r, { 'tutor dashboard ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(5);

    group('Tutor: Notificaciones', () => {
        // GET /api/notifications/my-notifications (authenticate)
        const r = http.get(`${config.apiUrl}/api/notifications/my-notifications`, { headers: hdr });
        check(r, { 'tutor notif ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(10);
}

// ─── Escenario: Profesor solo lectura ─────────────────────────────────────────
export function teacherReadScenario(data) {
    const idx = (__VU - 1) % data.teacherTokens.length;
    const token = data.teacherTokens[idx];

    if (!token) { loginErrors.add(1); sleep(5); return; }
    const hdr = authHeaders(token, data.slug);

    group('Teacher: Dashboard', () => {
        // GET /api/teachers/my-dashboard (requireTeacher)
        const r = http.get(`${config.apiUrl}/api/teachers/my-dashboard`, { headers: hdr });
        check(r, { 'teacher dashboard ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(4);

    group('Teacher: Mis aulas', () => {
        // GET /api/teachers/my-classrooms (requireTeacher)
        const r = http.get(`${config.apiUrl}/api/teachers/my-classrooms`, { headers: hdr });
        check(r, { 'classrooms ok': (x) => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (h === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });
    sleep(4);

    group('Teacher: Mis materias', () => {
        // GET /api/teachers/my-subjects (requireTeacher)
        const r = http.get(`${config.apiUrl}/api/teachers/my-subjects`, { headers: hdr });
        check(r, { 'subjects ok': (x) => x.status < 500 });
    });
    sleep(5);

    group('Teacher: Notificaciones', () => {
        // GET /api/notifications/my-notifications (authenticate)
        const r = http.get(`${config.apiUrl}/api/notifications/my-notifications`, { headers: hdr });
        check(r, { 'notif ok': (x) => x.status < 500 });
    });
    sleep(3);
}

export function handleSummary(data) {
    const p95 = data.metrics['http_req_duration']?.values?.['p(95)'] || 0;
    const errs = (data.metrics['http_req_failed']?.values?.rate || 0) * 100;
    const hits = (data.metrics['cache_hit_rate']?.values?.rate || 0) * 100;
    const rps = data.metrics['http_reqs']?.values?.rate || 0;
    const dashP95 = data.metrics['dashboard_duration']?.values?.['p(95)'] || 0;
    const totalReqs = data.metrics['http_reqs']?.values?.count || 0;

    const ok = (b) => b ? '✅' : '❌';

    return {
        stdout: `
╔══════════════════════════════════════════════════════╗
║           BASIC TEST 1.5K - RESULTADOS FINALES       ║
╠══════════════════════════════════════════════════════╣
║ Total Requests:      ${String(Math.round(totalReqs)).padStart(12)}                ║
║ p(95) Duration:      ${String(Math.round(p95) + 'ms').padStart(12)} (objetivo <500ms)  ║
║ Dashboard p(95):     ${String(Math.round(dashP95) + 'ms').padStart(12)} (objetivo <500ms)  ║
║ Error rate:          ${String(errs.toFixed(2) + '%').padStart(12)} (objetivo <5%)    ║
║ Cache hit rate:      ${String(hits.toFixed(1) + '%').padStart(12)} (objetivo >50%)   ║
║ Throughput:          ${String(Math.round(rps) + ' req/s').padStart(12)} (objetivo >100/s) ║
╠══════════════════════════════════════════════════════╣
║ VEREDICTO:                                           ║
║ ${ok(p95 < 500)}  Response time  ${ok(errs < 5)}  Error rate                  ║
║ ${ok(hits > 50)}  Cache hits     ${ok(rps > 100)}  Throughput                  ║
╚══════════════════════════════════════════════════════╝
`,
    };
}
