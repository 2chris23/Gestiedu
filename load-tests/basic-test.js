/**
 * TEST BÁSICO DE CARGA - K6
 *
 * Simula el comportamiento típico de estudiantes y tutores
 * navegando por el sistema (solo lectura).
 *
 * Etapas:
 *   - 0-2min: Ramp up → 100 usuarios
 *   - 2-7min: Meseta → 100 usuarios (verificar cache)
 *   - 7-9min: Ramp up → 300 usuarios
 *   - 9-14min: Meseta → 300 usuarios (verificar estabilidad)
 *   - 14-16min: Ramp down → 0
 *
 * EJECUTAR:
 *   k6 run load-tests/basic-test.js
 *   k6 run --env API_URL=http://localhost:3001 load-tests/basic-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, authHeaders } from './config.js';

// Métricas customizadas
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const loginErrors = new Counter('login_errors');
const dashboardDuration = new Trend('dashboard_duration');
const gradesDuration = new Trend('grades_duration');
const cacheHitRate = new Rate('cache_hit_rate');

// Cargar usuarios de prueba desde CSV
const testUsers = new SharedArray('testUsers', function () {
    const data = open('./test-users.csv');
    const lines = data.split('\n').slice(1); // Saltar header
    return lines
        .filter(line => line.trim())
        .filter(line => line.startsWith('STUDENT') || line.startsWith('TUTOR'))
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

export const options = {
    stages: [
        { duration: '2m', target: 100 },   // Ramp up suave
        { duration: '5m', target: 100 },   // Meseta: verificar cache warming
        { duration: '2m', target: 300 },   // Ramp up agresivo
        { duration: '5m', target: 300 },   // Meseta: verificar estabilidad
        { duration: '2m', target: 0 },     // Ramp down
    ],
    thresholds: {
        ...config.thresholds,
        'dashboard_duration': ['p(95)<300'],  // Dashboard debe ir < 300ms
        'cache_hit_rate': ['rate>0.5'],        // Al menos 50% cache hits
    },
};

/**
 * Setup: Login de admin para verificar que el sistema esté activo
 */
export function setup() {
    const res = http.post(
        `${config.apiUrl}/api/auth/login`,
        JSON.stringify({ email: config.admin.email, password: config.admin.password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': config.instituteSlug,
            },
        }
    );

    if (res.status !== 200) {
        console.error(`❌ Admin login failed: ${res.status} - ${res.body}`);
    } else {
        console.log('✅ Sistema operativo - iniciando test básico');
        console.log(`   Instituto: ${config.instituteSlug}`);
        console.log(`   Usuarios disponibles: ${testUsers.length}`);
    }
}

/**
 * Función principal - ejecutada por cada VU
 */
export default function () {
    // Seleccionar usuario aleatorio del CSV
    const userIdx = Math.floor(Math.random() * testUsers.length);
    const user = testUsers[userIdx];

    // === LOGIN ===
    let token = null;

    group('1. Login', () => {
        const loginRes = http.post(
            `${config.apiUrl}/api/auth/login`,
            JSON.stringify({ email: user.email, password: user.password }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Institute-Slug': config.instituteSlug,
                },
            }
        );

        const loginOk = check(loginRes, {
            'login status 200': (r) => r.status === 200,
            'login tiene token': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return !!(body.accessToken || body.token);
                } catch { return false; }
            },
        });

        if (!loginOk) {
            loginErrors.add(1);
            return;
        }

        const body = JSON.parse(loginRes.body);
        token = body.accessToken || body.token;
    });

    if (!token) {
        sleep(2);
        return;
    }

    const headers = authHeaders(token, config.instituteSlug);

    sleep(1);

    // === DASHBOARD ===
    group('2. Dashboard', () => {
        const start = Date.now();
        const res = http.get(`${config.apiUrl}/api/dashboard`, { headers });
        dashboardDuration.add(Date.now() - start);

        check(res, {
            'dashboard status 200': (r) => r.status === 200,
            'dashboard tiene datos': (r) => {
                try { return !!JSON.parse(r.body); } catch { return false; }
            },
        });

        // Registrar cache hit/miss
        const xCache = res.headers['X-Cache'] || res.headers['x-cache'];
        if (xCache === 'HIT') {
            cacheHits.add(1);
            cacheHitRate.add(true);
        } else if (xCache === 'MISS') {
            cacheMisses.add(1);
            cacheHitRate.add(false);
        }
    });

    sleep(3);

    // === NOTAS ===
    group('3. Notas', () => {
        const start = Date.now();
        const res = http.get(`${config.apiUrl}/api/grades`, { headers });
        gradesDuration.add(Date.now() - start);

        check(res, {
            'grades status 200 o 404': (r) => r.status === 200 || r.status === 404,
        });

        const xCache = res.headers['X-Cache'] || res.headers['x-cache'];
        if (xCache === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (xCache === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });

    sleep(5);

    // === ASISTENCIA ===
    group('4. Asistencia', () => {
        const res = http.get(`${config.apiUrl}/api/attendance`, { headers });
        check(res, {
            'attendance status 200 o 404': (r) => r.status === 200 || r.status === 404,
        });

        const xCache = res.headers['X-Cache'] || res.headers['x-cache'];
        if (xCache === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (xCache === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });

    sleep(4);

    // === MATERIAS ===
    group('5. Materias', () => {
        const res = http.get(`${config.apiUrl}/api/subjects`, { headers });
        check(res, {
            'subjects status 200 o 404': (r) => r.status === 200 || r.status === 404,
        });

        const xCache = res.headers['X-Cache'] || res.headers['x-cache'];
        if (xCache === 'HIT') { cacheHits.add(1); cacheHitRate.add(true); }
        else if (xCache === 'MISS') { cacheMisses.add(1); cacheHitRate.add(false); }
    });

    sleep(5);

    // === NOTIFICACIONES ===
    group('6. Notificaciones', () => {
        const res = http.get(`${config.apiUrl}/api/notifications`, { headers });
        check(res, {
            'notifications status 200 o 404': (r) => r.status === 200 || r.status === 404,
        });
    });

    sleep(Math.random() * 5 + 5); // Pausa realista entre 5-10 segundos
}

/**
 * Teardown: Imprimir resumen de cache
 */
export function teardown() {
    console.log('\n📊 RESUMEN DE CACHE:');
    console.log(`   Hits: (ver k6 metrics 'cache_hits')`);
    console.log(`   Misses: (ver k6 metrics 'cache_misses')`);
    console.log(`   Objetivo: >50% hit rate para usuarios READ-ONLY`);
}
