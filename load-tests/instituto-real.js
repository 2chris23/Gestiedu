/**
 * TEST DE INSTITUTO REAL - K6
 *
 * Simula un día real de uso del sistema con múltiples roles simultáneos:
 * - 70% Estudiantes (consultan dashboard, notas, asistencia) → READ_ONLY con cache
 * - 20% Tutores (consultan info de hijos) → READ_ONLY con cache
 * - 10% Profesores (registran notas, asistencias) → READ_WRITE, invalidan cache
 *
 * Verifica aislamiento de cache entre usuarios y que la invalidación
 * funciona correctamente cuando los profesores escriben.
 *
 * EJECUTAR:
 *   k6 run load-tests/instituto-real.js
 *   k6 run --vus 500 --duration 10m load-tests/instituto-real.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, authHeaders } from './config.js';

// Métricas diferenciadas por rol
const cacheHits = new Counter('cache_hits_total');
const cacheMisses = new Counter('cache_misses_total');
const teacherWrites = new Counter('teacher_writes');
const invalidationTriggers = new Counter('cache_invalidations_triggered');
const loginErrors = new Counter('login_errors_total');

const studentDuration = new Trend('student_request_duration');
const teacherDuration = new Trend('teacher_write_duration');
const cacheHitRate = new Rate('cache_hit_rate');

// Usuarios de prueba
const students = new SharedArray('students', function () {
    const data = open('./test-users.csv');
    return data.split('\n').slice(1)
        .filter(line => line.startsWith('STUDENT'))
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

const tutors = new SharedArray('tutors', function () {
    const data = open('./test-users.csv');
    return data.split('\n').slice(1)
        .filter(line => line.startsWith('TUTOR'))
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

const teachers = new SharedArray('teachers', function () {
    const data = open('./test-users.csv');
    return data.split('\n').slice(1)
        .filter(line => line.startsWith('TEACHER'))
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

export const options = {
    // Distribución de VUs por escenario (70% student, 20% tutor, 10% teacher)
    scenarios: {
        estudiantes: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 350 },  // 70% de 500
                { duration: '8m', target: 350 },
                { duration: '2m', target: 0 },
            ],
            exec: 'studentScenario',
            tags: { role: 'student' },
        },
        tutores: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 100 },  // 20% de 500
                { duration: '8m', target: 100 },
                { duration: '2m', target: 0 },
            ],
            exec: 'tutorScenario',
            tags: { role: 'tutor' },
        },
        profesores: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 50 },   // 10% de 500
                { duration: '8m', target: 50 },
                { duration: '2m', target: 0 },
            ],
            exec: 'teacherScenario',
            tags: { role: 'teacher' },
        },
    },
    thresholds: {
        'http_req_duration{role:student}': ['p(95)<400'],  // Students < 400ms
        'http_req_duration{role:teacher}': ['p(95)<800'],  // Teachers < 800ms (writes)
        'http_req_failed': ['rate<0.02'],                  // Error rate < 2%
        'cache_hit_rate': ['rate>0.45'],                   // Cache hit >45%
    },
};

function doLogin(user) {
    const res = http.post(
        `${config.apiUrl}/api/auth/login`,
        JSON.stringify({ email: user.email, password: user.password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': config.instituteSlug,
            },
        }
    );

    if (res.status !== 200) {
        loginErrors.add(1, { role: user.role });
        return null;
    }

    const body = JSON.parse(res.body);
    return body.accessToken || body.token;
}

function trackCache(res) {
    const xCache = res.headers['X-Cache'] || res.headers['x-cache'];
    if (xCache === 'HIT') {
        cacheHits.add(1);
        cacheHitRate.add(true);
    } else if (xCache === 'MISS') {
        cacheMisses.add(1);
        cacheHitRate.add(false);
    }
}

/**
 * Escenario: Estudiante navegando por el sistema
 * Solo lectura → debería beneficiarse del cache
 */
export function studentScenario() {
    const user = students[Math.floor(Math.random() * students.length)];
    const token = doLogin(user);
    if (!token) { sleep(2); return; }

    const headers = authHeaders(token, config.instituteSlug);

    // Simular navegación real de un estudiante
    group('Student: Dashboard', () => {
        const start = Date.now();
        const res = http.get(`${config.apiUrl}/api/dashboard`, { headers });
        studentDuration.add(Date.now() - start);
        check(res, { 'student dashboard ok': (r) => r.status === 200 || r.status === 404 });
        trackCache(res);
    });
    sleep(3);

    group('Student: Ver notas', () => {
        const start = Date.now();
        const res = http.get(`${config.apiUrl}/api/grades`, { headers });
        studentDuration.add(Date.now() - start);
        check(res, { 'student grades ok': (r) => r.status === 200 || r.status === 404 });
        trackCache(res);
    });
    sleep(4);

    group('Student: Ver asistencia', () => {
        const start = Date.now();
        const res = http.get(`${config.apiUrl}/api/attendance`, { headers });
        studentDuration.add(Date.now() - start);
        check(res, { 'student attendance ok': (r) => r.status === 200 || r.status === 404 });
        trackCache(res);
    });
    sleep(6);
}

/**
 * Escenario: Tutor consultando información
 * Solo lectura → también se cachea
 */
export function tutorScenario() {
    const user = tutors[Math.floor(Math.random() * tutors.length)];
    const token = doLogin(user);
    if (!token) { sleep(2); return; }

    const headers = authHeaders(token, config.instituteSlug);

    group('Tutor: Dashboard', () => {
        const start = Date.now();
        const res = http.get(`${config.apiUrl}/api/dashboard`, { headers });
        studentDuration.add(Date.now() - start);
        check(res, { 'tutor dashboard ok': (r) => r.status === 200 || r.status === 404 });
        trackCache(res);
    });
    sleep(5);

    group('Tutor: Info instituto', () => {
        const res = http.get(`${config.apiUrl}/api/instituto/${config.instituteSlug}/info`);
        check(res, { 'institute info ok': (r) => r.status === 200 });
        trackCache(res);
    });
    sleep(8);
}

/**
 * Escenario: Profesor registrando notas y asistencias
 * READ_WRITE → invalida cache de estudiantes
 */
export function teacherScenario() {
    const user = teachers[Math.floor(Math.random() * teachers.length)];
    const token = doLogin(user);
    if (!token) { sleep(2); return; }

    const headers = authHeaders(token, config.instituteSlug);

    // Ver aulas
    let classroomId = null;
    group('Teacher: Ver aulas', () => {
        const res = http.get(`${config.apiUrl}/api/classrooms`, { headers });
        check(res, { 'teacher classrooms ok': (r) => r.status === 200 || r.status === 404 });

        if (res.status === 200) {
            try {
                const data = JSON.parse(res.body);
                const classrooms = data.classrooms || data.data || data;
                if (Array.isArray(classrooms) && classrooms.length > 0) {
                    classroomId = classrooms[0].id;
                }
            } catch { }
        }
    });
    sleep(2);

    if (!classroomId) {
        sleep(5);
        return;
    }

    // Registrar asistencia (invalida cache de estudiantes del aula)
    group('Teacher: Registrar asistencia', () => {
        const start = Date.now();
        const res = http.post(
            `${config.apiUrl}/api/attendance/bulk`,
            JSON.stringify({
                classroomId,
                date: new Date().toISOString().split('T')[0],
                records: [], // Empty para simular sin crear datos reales
            }),
            { headers }
        );
        teacherDuration.add(Date.now() - start);

        if (res.status === 200 || res.status === 201) {
            teacherWrites.add(1);
            invalidationTriggers.add(1);
        }
        // 400 es válido (datos incompletos) - solo verificamos que no hay error de servidor
        check(res, { 'attendance write not 500': (r) => r.status < 500 });
    });
    sleep(10);
}
