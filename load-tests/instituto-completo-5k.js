/**
 * INSTITUTO COMPLETO 5K - K6
 *
 * Simula un día escolar completo de 7 AM a 3 PM (8 horas → ~45 min simulados).
 * Varía la carga según el horario:
 *   7-8 AM   → Entrada: asistencia, pico máximo
 *   8-12 PM  → Clases: calificaciones, actividades
 *   12-1 PM  → Almuerzo: carga reducida
 *   1-3 PM   → Tarde: carga moderada
 *   3-4 PM   → Salida: consultas finales
 *
 * EJECUTAR:
 *   k6 run load-tests/instituto-completo-5k.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders, trackCache } from './config.js';

const writeOps = new Counter('write_ops');
const writeErrors = new Counter('write_errors');
const cacheHitRate = new Rate('cache_hit_rate');
const responseDuration = new Trend('response_duration', true);

const CSV = './test-users-5k.csv';

const students = new SharedArray('students', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('STUDENT'))
        .map(l => { const [, e, p] = l.split(','); return { email: e, password: p }; });
});
const tutors = new SharedArray('tutors', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('TUTOR'))
        .map(l => { const [, e, p] = l.split(','); return { email: e, password: p }; });
});
const teachers = new SharedArray('teachers', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('TEACHER'))
        .map(l => { const [, e, p] = l.split(','); return { email: e, password: p }; });
});

/*
 * Los stages mapean 8 horas escolares → 45 min de test.
 * Escala: 1 hora real → ~5.6 min de test
 *
 * 7:00-8:00  Entrada     → 5m
 * 8:00-10:00 1ra mitad   → 11m
 * 10:00-12:00 2da mitad  → 11m
 * 12:00-1:00 Almuerzo    → 6m
 * 1:00-3:00  Tarde       → 11m
 * 3:00-4:00  Salida      → 5m
 */
export const options = {
    scenarios: {
        // ── ESTUDIANTES ──────────────────────────────────────────────────────────
        estudiantes: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                // Entrada (7-8 AM)
                { duration: '2m', target: 2000 },
                { duration: '3m', target: 3500 },
                // 1ra mitad (8-10 AM)
                { duration: '11m', target: 3500 },
                // 2da mitad (10-12 PM)
                { duration: '11m', target: 3000 },
                // Almuerzo (12-1 PM)
                { duration: '6m', target: 2000 },
                // Tarde (1-3 PM)
                { duration: '11m', target: 2500 },
                // Salida (3-4 PM)
                { duration: '3m', target: 1500 },
                { duration: '2m', target: 0 },
            ],
            exec: 'studentScenario',
            tags: { role: 'student' },
        },

        // ── TUTORES ──────────────────────────────────────────────────────────────
        tutores: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 1000 },
                { duration: '3m', target: 2000 },
                { duration: '11m', target: 1500 },
                { duration: '11m', target: 1000 },
                { duration: '6m', target: 500 },
                { duration: '11m', target: 800 },
                { duration: '3m', target: 1000 },
                { duration: '2m', target: 0 },
            ],
            exec: 'tutorScenario',
            tags: { role: 'tutor' },
        },

        // ── PROFESORES ───────────────────────────────────────────────────────────
        profesores: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 100 },    // Entrada: pasan asistencia
                { duration: '3m', target: 150 },
                { duration: '11m', target: 150 },   // 1ra mitad: notas
                { duration: '11m', target: 150 },   // 2da mitad: notas
                { duration: '6m', target: 100 },    // Almuerzo: menos
                { duration: '11m', target: 150 },   // Tarde: calificaciones finales
                { duration: '3m', target: 0 },
                { duration: '2m', target: 0 },
            ],
            exec: 'teacherScenario',
            tags: { role: 'teacher' },
        },
    },

    thresholds: {
        'http_req_duration': ['p(95)<800'],
        'http_req_duration{role:student}': ['p(95)<500'],
        'http_req_duration{role:tutor}': ['p(95)<500'],
        'http_req_duration{role:teacher}': ['p(95)<1200'],
        'http_req_failed': ['rate<0.02'],
        'cache_hit_rate': ['rate>0.60'],
        'write_errors': ['count<1000'],
    },
};

export function studentScenario() {
    const u = students[__VU % students.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    // Simulación de sesión de estudiante (5 requests con pauses)
    const endpoints = [
        '/api/dashboard',
        '/api/students/me/grades',
        '/api/students/me/attendance',
        '/api/activities',
        '/api/students/me/subjects',
    ];
    const pauses = [5, 10, 8, 5, 3];

    for (let i = 0; i < endpoints.length; i++) {
        const start = Date.now();
        const r = http.get(`${config.apiUrl}${endpoints[i]}`, { headers: hdr });
        responseDuration.add(Date.now() - start);
        check(r, { [`student ${endpoints[i]} ok`]: x => x.status < 500 });
        const h = trackCache(r);
        if (h === 'HIT') cacheHitRate.add(true);
        else if (h === 'MISS') cacheHitRate.add(false);
        sleep(pauses[i]);
    }
}

export function tutorScenario() {
    const u = tutors[__VU % tutors.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    http.get(`${config.apiUrl}/api/tutors/me/children`, { headers: hdr });
    sleep(3);
    http.get(`${config.apiUrl}/api/notifications`, { headers: hdr });
    sleep(4);
    http.get(`${config.apiUrl}/api/dashboard`, { headers: hdr });
    sleep(6);
}

export function teacherScenario() {
    const u = teachers[__VU % teachers.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    // Ver aulas
    let classroomId = null;
    const clR = http.get(`${config.apiUrl}/api/teachers/me/classrooms`, { headers: hdr });
    try {
        const d = JSON.parse(clR.body);
        const cl = d.classrooms || d.data || d;
        if (Array.isArray(cl) && cl.length > 0) {
            classroomId = cl[Math.floor(Math.random() * cl.length)].id;
        }
    } catch { }
    sleep(2);

    if (!classroomId) { sleep(5); return; }

    // En horario de entrada (primeros 5 min): pasan asistencia
    const elapsed = __ITER * 5; // aproximación del tiempo transcurrido
    const isEntryTime = elapsed < 300; // primeros 5 minutos

    if (isEntryTime || Math.random() < 0.3) {
        // POST asistencia
        const today = new Date().toISOString().split('T')[0];
        const r = http.post(
            `${config.apiUrl}/api/attendance/bulk`,
            JSON.stringify({
                classroomId,
                date: today,
                records: Array.from({ length: 10 }, (_, i) => ({
                    studentId: `placeholder-${i}`, // En test real serían IDs reales
                    status: Math.random() < 0.9 ? 'PRESENT' : 'ABSENT',
                    periods: Math.random() < 0.9 ? 255 : 0,
                })),
            }),
            { headers: hdr }
        );

        writeOps.add(1);
        if (r.status >= 500) writeErrors.add(1);
        check(r, { 'attendance bulk not 500': x => x.status !== 500 });
        sleep(20);
    } else {
        // Lectura: ver actividades, estudiantes
        http.get(`${config.apiUrl}/api/activities?classroomId=${classroomId}`, { headers: hdr });
        sleep(3);
        http.get(`${config.apiUrl}/api/classrooms/${classroomId}/students`, { headers: hdr });
        sleep(5);
    }
}

export function handleSummary(data) {
    const p95st = data.metrics['http_req_duration{role:student}']?.values?.['p(95)'] || 0;
    const p95te = data.metrics['http_req_duration{role:teacher}']?.values?.['p(95)'] || 0;
    const errs = (data.metrics['http_req_failed']?.values?.rate || 0) * 100;
    const hits = (data.metrics['cache_hit_rate']?.values?.rate || 0) * 100;
    const writes = data.metrics['write_ops']?.values?.count || 0;
    const wErrs = data.metrics['write_errors']?.values?.count || 0;
    const total = data.metrics['http_reqs']?.values?.count || 0;
    const ok = b => b ? '✅' : '❌';

    return {
        stdout: `
╔═══════════════════════════════════════════════════════╗
║     INSTITUTO COMPLETO 5K - DÍA ESCOLAR SIMULADO      ║
╠═══════════════════════════════════════════════════════╣
║ Total requests:      ${String(Math.round(total)).padStart(12)}                        ║
║ Student p(95):       ${String(Math.round(p95st) + 'ms').padStart(12)} (obj <500ms)     ║
║ Teacher p(95):       ${String(Math.round(p95te) + 'ms').padStart(12)} (obj <1200ms)    ║
║ Error rate:          ${String(errs.toFixed(2) + '%').padStart(12)} (obj <2%)           ║
║ Cache hit rate:      ${String(hits.toFixed(1) + '%').padStart(12)} (obj >60%)          ║
║ Writes realizados:   ${String(Math.round(writes)).padStart(12)}                        ║
║ Write errors:        ${String(Math.round(wErrs)).padStart(12)} (obj <1000)             ║
╠═══════════════════════════════════════════════════════╣
║ ${ok(p95st < 500)} Student  ${ok(p95te < 1200)} Teacher  ${ok(errs < 2)} Errors  ${ok(hits > 60)} Cache  ║
╚═══════════════════════════════════════════════════════╝
`,
    };
}
