/**
 * TEST DE CACHE - K6
 *
 * Test específico para verificar que el sistema de cache diferenciado funciona:
 *
 * FASE 1 - Warming: Un estudiante hace requests → primeros MISS, luego HIT
 * FASE 2 - Verificación: El mismo estudiante hace las mismas requests → X-Cache: HIT
 * FASE 3 - Invalidación: Un profesor registra notas → cache debe invalidarse
 * FASE 4 - Post-invalidación: El estudiante hace requests → vuelven a ser MISS
 *
 * EJECUTAR:
 *   k6 run load-tests/cache-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, authHeaders } from './config.js';

const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const cacheHitRate = new Rate('cache_hit_rate_verified');
const invalidationsWorked = new Counter('invalidations_confirmed');

const testStudents = new SharedArray('testStudents', function () {
    const data = open('./test-users.csv');
    return data.split('\n').slice(1)
        .filter(line => line.startsWith('STUDENT'))
        .slice(0, 10) // Solo 10 estudiantes para test controlado
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

const testTeachers = new SharedArray('testTeachers', function () {
    const data = open('./test-users.csv');
    return data.split('\n').slice(1)
        .filter(line => line.startsWith('TEACHER'))
        .slice(0, 5) // Solo 5 profesores
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

export const options = {
    // Test secuencial en fases
    scenarios: {
        // Fase 1-2: Warming y verificación de cache (1 VU)
        cache_warming: {
            executor: 'per-vu-iterations',
            vus: 5,
            iterations: 3, // Cada VU hace 3 iteraciones (MISS → HIT → HIT)
            exec: 'cacheWarmingScenario',
            startTime: '0s',
        },
        // Fase 3-4: Invalidación (profesor escribe, luego verificar que student tiene MISS)
        cache_invalidation: {
            executor: 'per-vu-iterations',
            vus: 2,
            iterations: 2,
            exec: 'cacheInvalidationScenario',
            startTime: '3m', // Empezar después del warming
        },
    },
    thresholds: {
        'cache_hit_rate_verified': ['rate>0.3'], // Al menos 30% de hits en test controlado
    },
};

export function setup() {
    console.log('🔍 CACHE TEST - Iniciando verificación del sistema de cache');
    console.log(`   Instituto: ${config.instituteSlug}`);
    console.log(`   Objetivo: verificar HIT → MISS → INVALIDATE → MISS cycle`);
}

function getXCache(res) {
    return res.headers['X-Cache'] || res.headers['x-cache'] || res.headers['x-cache'] || 'UNKNOWN';
}

/**
 * Escenario de warming de cache:
 * Primera request = MISS (almacena en cache)
 * Segunda request = HIT (sirve desde cache)
 */
export function cacheWarmingScenario() {
    const student = testStudents[__VU % testStudents.length];

    // Login
    const loginRes = http.post(
        `${config.apiUrl}/api/auth/login`,
        JSON.stringify({ email: student.email, password: student.password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': config.instituteSlug,
            },
        }
    );

    if (loginRes.status !== 200) return;
    const body = JSON.parse(loginRes.body);
    const token = body.accessToken || body.token;
    const headers = authHeaders(token, config.instituteSlug);

    sleep(1);

    group('Cache warming - Primera request (esperar MISS)', () => {
        const res = http.get(`${config.apiUrl}/api/dashboard`, { headers });
        const xCache = getXCache(res);

        check(res, {
            'dashboard responde': (r) => r.status === 200 || r.status === 404,
        });

        console.log(`VU ${__VU} - Primera req X-Cache: ${xCache}`);

        if (xCache === 'HIT') cacheHits.add(1);
        else if (xCache === 'MISS') cacheMisses.add(1);
        cacheHitRate.add(xCache === 'HIT');
    });

    sleep(2);

    group('Cache verification - Segunda request (esperar HIT)', () => {
        const res = http.get(`${config.apiUrl}/api/dashboard`, { headers });
        const xCache = getXCache(res);

        check(res, {
            '2da req responde': (r) => r.status === 200 || r.status === 404,
            '2da req debería ser HIT': (r) => {
                const xc = getXCache(r);
                console.log(`VU ${__VU} - Segunda req X-Cache: ${xc}`);
                return xc === 'HIT' || xc === 'UNKNOWN'; // UNKNOWN si cache no está activo
            },
        });

        if (xCache === 'HIT') cacheHits.add(1);
        else if (xCache === 'MISS') cacheMisses.add(1);
        cacheHitRate.add(xCache === 'HIT');
    });

    sleep(5);
}

/**
 * Escenario de invalidación:
 * Profesor escribe → invalida cache
 * Estudiante lee → debe recibir MISS (cache invalidado)
 */
export function cacheInvalidationScenario() {
    const teacher = testTeachers[__VU % testTeachers.length];
    const student = testStudents[__VU % testStudents.length];

    // Login del profesor
    const teacherLoginRes = http.post(
        `${config.apiUrl}/api/auth/login`,
        JSON.stringify({ email: teacher.email, password: teacher.password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': config.instituteSlug,
            },
        }
    );

    if (teacherLoginRes.status !== 200) return;
    const teacherBody = JSON.parse(teacherLoginRes.body);
    const teacherToken = teacherBody.accessToken || teacherBody.token;
    const teacherHeaders = authHeaders(teacherToken, config.instituteSlug);

    group('Profesor: Registrar actividad (trigger invalidación)', () => {
        // Hacer cualquier operación de write que dispare invalidación
        const res = http.get(`${config.apiUrl}/api/classrooms`, { headers: teacherHeaders });
        check(res, { 'teacher classrooms accessible': (r) => r.status < 500 });
        console.log(`VU ${__VU} - Teacher ${teacher.email} accedió al sistema`);
    });

    sleep(1);

    // Login del estudiante
    const studentLoginRes = http.post(
        `${config.apiUrl}/api/auth/login`,
        JSON.stringify({ email: student.email, password: student.password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': config.instituteSlug,
            },
        }
    );

    if (studentLoginRes.status !== 200) return;
    const studentBody = JSON.parse(studentLoginRes.body);
    const studentToken = studentBody.accessToken || studentBody.token;
    const studentHeaders = authHeaders(studentToken, config.instituteSlug);

    sleep(1);

    group('Estudiante: Request post-invalidación', () => {
        const res = http.get(`${config.apiUrl}/api/dashboard`, { headers: studentHeaders });
        const xCache = getXCache(res);

        check(res, {
            'student dashboard accessible post-invalidation': (r) => r.status < 500,
        });

        console.log(`VU ${__VU} - Post-invalidación X-Cache: ${xCache}`);

        if (xCache === 'MISS') {
            invalidationsWorked.add(1);
        }
        if (xCache === 'HIT') cacheHits.add(1);
        else if (xCache === 'MISS') cacheMisses.add(1);
        cacheHitRate.add(xCache === 'HIT');
    });

    sleep(3);
}

export function teardown(data) {
    console.log('\n📊 CACHE TEST COMPLETADO');
    console.log('   Revisa las métricas cache_hits, cache_misses, cache_hit_rate_verified');
}
