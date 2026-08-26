/**
 * TEST CON ESCRITURAS - K6
 *
 * Simula operaciones reales de escritura de profesores y admins junto con
 * la lectura masiva de estudiantes y tutores.
 *
 * - 3,000 VUs Estudiantes (solo lectura)
 * - 1,500 VUs Tutores (solo lectura)
 * - 150  VUs Profesores (POST asistencia, calificaciones, actividades)
 * - 25   VUs Admins (POST usuarios, PUT datos)
 *
 * Duración: ~20 minutos
 *
 * EJECUTAR:
 *   k6 run load-tests/write-operations-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders, trackCache } from './config.js';

// ─── Métricas ─────────────────────────────────────────────────────────────────
const writeOpsTotal = new Counter('write_operations_total');
const writeOpsFailed = new Counter('write_operations_failed');
const cacheInvalidations = new Counter('cache_invalidations_triggered');
const writeDuration = new Trend('write_duration', true);
const cacheHitRate = new Rate('cache_hit_rate');
const loginErrors = new Counter('login_errors');

// ─── Usuarios ─────────────────────────────────────────────────────────────────
const CSV = './test-users-5k.csv';

const students = new SharedArray('students', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('STUDENT'))
        .map(l => { const [, email, password, , id] = l.split(','); return { email, password, id }; });
});

const tutors = new SharedArray('tutors', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('TUTOR'))
        .map(l => { const [, email, password] = l.split(','); return { email, password }; });
});

const teachers = new SharedArray('teachers', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('TEACHER'))
        .map(l => { const [, email, password, , id] = l.split(','); return { email, password, id }; });
});

const admins = new SharedArray('admins', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.startsWith('ADMIN'))
        .map(l => { const [, email, password] = l.split(','); return { email, password }; });
});

// ─── Configuración ────────────────────────────────────────────────────────────
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
        profesores: {
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
        admins: {
            executor: 'constant-vus',
            vus: 25,
            duration: '20m',
            exec: 'adminWriteScenario',
            tags: { role: 'admin' },
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<800'],
        'http_req_duration{role:student}': ['p(95)<500'],
        'http_req_duration{role:teacher}': ['p(95)<1000'],
        'http_req_failed': ['rate<0.02'],
        'write_operations_failed': ['count<500'],
        'cache_hit_rate': ['rate>0.60'],
    },
};

// ─── Escenario: Estudiante ─────────────────────────────────────────────────────
export function studentScenario() {
    const u = students[__VU % students.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { loginErrors.add(1); sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    const r = http.get(`${config.apiUrl}/api/dashboard`, { headers: hdr });
    check(r, { 'student dash ok': x => x.status < 500 });
    const h = trackCache(r);
    if (h === 'HIT') cacheHitRate.add(true);
    else if (h === 'MISS') cacheHitRate.add(false);
    sleep(5);

    http.get(`${config.apiUrl}/api/students/me/grades`, { headers: hdr });
    sleep(10);
    http.get(`${config.apiUrl}/api/students/me/attendance`, { headers: hdr });
    sleep(8);
    http.get(`${config.apiUrl}/api/activities`, { headers: hdr });
    sleep(5);
}

// ─── Escenario: Tutor ─────────────────────────────────────────────────────────
export function tutorScenario() {
    const u = tutors[__VU % tutors.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { loginErrors.add(1); sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    http.get(`${config.apiUrl}/api/tutors/me/children`, { headers: hdr });
    sleep(3);
    http.get(`${config.apiUrl}/api/notifications`, { headers: hdr });
    sleep(5);
}

// ─── Escenario: Profesor (READ + WRITE) ───────────────────────────────────────
export function teacherWriteScenario() {
    const u = teachers[__VU % teachers.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { loginErrors.add(1); sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    // Ver aulas
    let classroomId = null;
    let studentIds = [];
    group('Teacher: Ver aulas', () => {
        const r = http.get(`${config.apiUrl}/api/teachers/me/classrooms`, { headers: hdr });
        check(r, { 'classrooms ok': x => x.status < 500 });
        try {
            const d = JSON.parse(r.body);
            const cl = d.classrooms || d.data || d;
            if (Array.isArray(cl) && cl.length > 0) {
                classroomId = cl[Math.floor(Math.random() * cl.length)].id;
            }
        } catch { }
        sleep(2);
    });

    if (!classroomId) { sleep(5); return; }

    // Ver estudiantes del aula
    group('Teacher: Estudiantes del aula', () => {
        const r = http.get(`${config.apiUrl}/api/classrooms/${classroomId}/students`, { headers: hdr });
        check(r, { 'students ok': x => x.status < 500 });
        try {
            const d = JSON.parse(r.body);
            studentIds = (d.students || d.data || d).slice(0, 50).map(s => s.id);
        } catch { }
        sleep(3);
    });

    // POST: Asistencia masiva
    group('Teacher: POST asistencia', () => {
        const start = Date.now();
        const today = new Date().toISOString().split('T')[0];
        const records = studentIds.map(id => {
            const r = Math.random();
            return {
                studentId: id,
                status: r < 0.90 ? 'PRESENT' : r < 0.95 ? 'LATE' : 'ABSENT',
                periods: r < 0.90 ? 255 : r < 0.95 ? 127 : 0,
            };
        });

        const r = http.post(
            `${config.apiUrl}/api/attendance/bulk`,
            JSON.stringify({ classroomId, date: today, records }),
            { headers: hdr }
        );

        writeDuration.add(Date.now() - start);
        writeOpsTotal.add(1, { type: 'attendance' });

        if (r.status >= 400 && r.status !== 422) writeOpsFailed.add(1);
        if (r.status === 200 || r.status === 201) cacheInvalidations.add(1);
        check(r, { 'attendance write not 500': x => x.status !== 500 });
        sleep(20);
    });

    // POST: Nueva actividad
    group('Teacher: POST actividad', () => {
        const start = Date.now();
        const r = http.post(
            `${config.apiUrl}/api/activities`,
            JSON.stringify({
                title: `Actividad K6 ${Date.now()}`,
                type: 'EXAM',
                scope: 'CLASSROOM',
                startDate: new Date().toISOString(),
                dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
                classroomId,
                maxGrade: 20,
                weight: 1,
            }),
            { headers: hdr }
        );
        writeDuration.add(Date.now() - start);
        writeOpsTotal.add(1, { type: 'activity' });
        if (r.status >= 400) writeOpsFailed.add(1);
        check(r, { 'activity write not 500': x => x.status !== 500 });
        sleep(10);
    });

    // POST: Calificaciones
    if (studentIds.length > 0) {
        group('Teacher: POST calificación', () => {
            const start = Date.now();
            const studentId = studentIds[Math.floor(Math.random() * studentIds.length)];

            // Primero buscar actividades del aula
            const actsR = http.get(
                `${config.apiUrl}/api/activities?classroomId=${classroomId}&limit=5`,
                { headers: hdr }
            );

            let activityId = null;
            try {
                const d = JSON.parse(actsR.body);
                const acts = d.activities || d.data || d;
                if (Array.isArray(acts) && acts.length > 0) {
                    activityId = acts[Math.floor(Math.random() * acts.length)].id;
                }
            } catch { }

            if (!activityId) { sleep(5); return; }

            const r = http.post(
                `${config.apiUrl}/api/grades`,
                JSON.stringify({
                    studentId,
                    activityId,
                    score: Math.round(Math.random() * 20 * 100) / 100,
                }),
                { headers: hdr }
            );
            writeDuration.add(Date.now() - start);
            writeOpsTotal.add(1, { type: 'grade' });
            if (r.status >= 400) writeOpsFailed.add(1);
            check(r, { 'grade write not 500': x => x.status !== 500 });
            sleep(15);
        });
    }
}

// ─── Escenario: Admin (READ + WRITE) ──────────────────────────────────────────
export function adminWriteScenario() {
    const u = admins[__VU % admins.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);
    if (!token) { loginErrors.add(1); sleep(2); return; }
    const hdr = authHeaders(token, config.instituteSlug);

    // Listar estudiantes
    group('Admin: Listar usuarios', () => {
        const r = http.get(`${config.apiUrl}/api/users?role=STUDENT&limit=50`, { headers: hdr });
        check(r, { 'list users ok': x => x.status < 500 });
        sleep(3);
    });

    // Crear usuario de prueba
    group('Admin: POST usuario', () => {
        const ts = Date.now();
        const start = Date.now();
        const r = http.post(
            `${config.apiUrl}/api/users`,
            JSON.stringify({
                id: `V-NEW${ts}`,
                email: `new-student-${ts}@testload.com`,
                password: 'Test123!',
                firstName: 'Nuevo',
                lastName: `Estudiante${ts}`,
                role: 'STUDENT',
            }),
            { headers: hdr }
        );
        writeDuration.add(Date.now() - start);
        writeOpsTotal.add(1, { type: 'create_user' });
        if (r.status >= 400 && r.status !== 422) writeOpsFailed.add(1);
        check(r, { 'create user not 500': x => x.status !== 500 });
        sleep(5);
    });

    // Ver aulas
    group('Admin: Ver aulas', () => {
        const r = http.get(`${config.apiUrl}/api/classrooms`, { headers: hdr });
        check(r, { 'classrooms ok': x => x.status < 500 });
        sleep(2);
    });

    // Audit logs
    group('Admin: Audit logs', () => {
        const r = http.get(`${config.apiUrl}/api/audit-logs?limit=20`, { headers: hdr });
        check(r, { 'audit logs ok': x => x.status < 500 });
        sleep(3);
    });
}

export function handleSummary(data) {
    const p95 = data.metrics['http_req_duration']?.values?.['p(95)'] || 0;
    const errs = (data.metrics['http_req_failed']?.values?.rate || 0) * 100;
    const hits = (data.metrics['cache_hit_rate']?.values?.rate || 0) * 100;
    const writes = data.metrics['write_operations_total']?.values?.count || 0;
    const writeFails = data.metrics['write_operations_failed']?.values?.count || 0;
    const writeFailRate = writes > 0 ? (writeFails / writes * 100) : 0;
    const invalidations = data.metrics['cache_invalidations_triggered']?.values?.count || 0;

    const ok = b => b ? '✅' : '❌';

    return {
        stdout: `
╔══════════════════════════════════════════════════════╗
║        WRITE OPERATIONS TEST - RESULTADOS            ║
╠══════════════════════════════════════════════════════╣
║ p(95) Duration tot:  ${String(Math.round(p95) + 'ms').padStart(10)} (obj <800ms)      ║
║ Error rate:          ${String(errs.toFixed(2) + '%').padStart(10)} (obj <2%)          ║
║ Cache hit rate:      ${String(hits.toFixed(1) + '%').padStart(10)} (obj >60%)         ║
║ Write ops total:     ${String(Math.round(writes)).padStart(10)}                        ║
║ Write fail rate:     ${String(writeFailRate.toFixed(2) + '%').padStart(10)} (obj <1%)          ║
║ Cache invalidations: ${String(Math.round(invalidations)).padStart(10)}                        ║
╠══════════════════════════════════════════════════════╣
║ ${ok(p95 < 800)}  p(95)<800ms  ${ok(errs < 2)}  Errors<2%  ${ok(writeFailRate < 1)}  WriteErr<1%  ║
╚══════════════════════════════════════════════════════╝
`,
    };
}
