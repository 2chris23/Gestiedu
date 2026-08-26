/**
 * STRESS TEST - K6
 *
 * Lleva el sistema al límite para identificar el punto de ruptura.
 * Escala agresivamente hasta 1000 VUs y mide degradación.
 *
 * ⚠️ ADVERTENCIA: Este test puede saturar el servidor.
 * Ejecutar SOLO en ambiente de prueba, nunca en producción.
 *
 * EJECUTAR:
 *   k6 run load-tests/stress-test.js
 *
 * INTERPRETAR RESULTADOS:
 *   - La p95 debería mantenerse < 1s hasta cierto punto
 *   - Observar cuándo empieza a degradar
 *   - Error rate no debería superar 5%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, authHeaders } from './config.js';

const errors = new Counter('stress_errors');
const degradationRate = new Rate('degradation_rate');  // requests > 1s
const requestDuration = new Trend('stress_request_duration');

const allUsers = new SharedArray('allUsers', function () {
    const data = open('./test-users.csv');
    return data.split('\n').slice(1)
        .filter(line => line.trim() && !line.startsWith('ADMIN'))
        .map(line => {
            const [role, email, password] = line.split(',');
            return { role, email, password };
        });
});

export const options = {
    stages: [
        { duration: '1m', target: 100 },   // Warm up
        { duration: '2m', target: 300 },   // Nivel normal
        { duration: '2m', target: 600 },   // Nivel alto
        { duration: '2m', target: 1000 },  // Nivel de estrés
        { duration: '3m', target: 1000 },  // Meseta de estrés
        { duration: '2m', target: 600 },   // Verificar recuperación
        { duration: '2m', target: 0 },     // Ramp down
    ],
    thresholds: {
        // Thresholds más permisivos para stress test
        'http_req_duration': ['p(95)<2000'],   // Permitir hasta 2s
        'http_req_failed': ['rate<0.05'],      // Hasta 5% de errores
        'stress_errors': ['count<500'],        // Máximo 500 errores totales
    },
};

export default function () {
    const user = allUsers[Math.floor(Math.random() * allUsers.length)];

    // Login
    const loginRes = http.post(
        `${config.apiUrl}/api/auth/login`,
        JSON.stringify({ email: user.email, password: user.password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': config.instituteSlug,
            },
            timeout: '10s',
        }
    );

    if (loginRes.status !== 200) {
        errors.add(1);
        sleep(1);
        return;
    }

    const body = JSON.parse(loginRes.body);
    const token = body.accessToken || body.token;
    const headers = authHeaders(token, config.instituteSlug);

    // Hacer requests continuos sin pause larga
    const start = Date.now();

    const dashRes = http.get(`${config.apiUrl}/api/dashboard`, {
        headers,
        timeout: '10s',
    });

    const duration = Date.now() - start;
    requestDuration.add(duration);

    // Registrar si la request tardó más de 1s (degradación)
    degradationRate.add(duration > 1000);

    check(dashRes, {
        'stress dashboard not 500': (r) => r.status !== 500,
        'stress dashboard not timeout': (r) => r.status !== 0,
    });

    if (dashRes.status >= 500) {
        errors.add(1);
    }

    sleep(0.5); // Pausa mínima para ser más agresivo
}

export function handleSummary(data) {
    const p95 = data.metrics['http_req_duration']?.values?.['p(95)'] || 0;
    const errorRate = data.metrics['http_req_failed']?.values?.rate || 0;
    const totalReqs = data.metrics['http_reqs']?.values?.count || 0;
    const degraded = data.metrics['degradation_rate']?.values?.rate || 0;

    return {
        stdout: `
╔══════════════════════════════════════════════╗
║          STRESS TEST - RESULTADOS            ║
╠══════════════════════════════════════════════╣
║ Total Requests:    ${String(Math.round(totalReqs)).padStart(10)} requests    ║
║ p95 Duration:      ${String(Math.round(p95)).padStart(7)}ms                ║
║ Error Rate:        ${String((errorRate * 100).toFixed(2)).padStart(8)}%                ║
║ Degraded (>1s):    ${String((degraded * 100).toFixed(2)).padStart(8)}%                ║
╠══════════════════════════════════════════════╣
║ DIAGNÓSTICO:                                 ║
║ ${p95 < 1000 ? '✅ p95 < 1s - Sistema aguantó bien    ' : '⚠️  p95 > 1s - Degradación detectada    '}   ║
║ ${errorRate < 0.01 ? '✅ Errores < 1% - Excelente           ' : errorRate < 0.05 ? '⚠️  Errores < 5% - Aceptable          ' : '❌ Errores > 5% - Sistema sobrecargado'}   ║
╚══════════════════════════════════════════════╝
`,
    };
}
