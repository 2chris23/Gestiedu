/**
 * STRESS EXTREMO 5K - K6
 *
 * Lleva el sistema al límite para identificar el punto de quiebre.
 * Escala hasta 15,000 VUs en fases progresivas.
 *
 * ⚠️ ADVERTENCIA CRÍTICA: Solo ejecutar en ambiente de prueba aislado.
 * Este test SATURARÁ el servidor. Nunca ejecutar en producción.
 *
 * Fases:
 *   1. Normal  → 2,000 VUs   (5 min ramp + 5 min hold)
 *   2. Alta    → 5,000 VUs   (5 min ramp + 5 min hold)
 *   3. Extrema → 8,000 VUs   (5 min ramp + 5 min hold)
 *   4. Crítica → 12,000 VUs  (5 min ramp + 10 min hold)
 *   5. Límite  → 15,000 VUs  (5 min ramp + hasta quiebre o 10 min)
 *
 * Duración total: ~50 minutos
 *
 * EJECUTAR:
 *   k6 run load-tests/stress-extreme-5k.js
 *   k6 run --out json=load-tests/reports/stress-$(date +%Y%m%d-%H%M).json load-tests/stress-extreme-5k.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config, loginUser, authHeaders } from './config.js';

// ─── Métricas críticas ────────────────────────────────────────────────────────
const stressErrors = new Counter('stress_errors');
const degradationRate = new Rate('degradation_rate');   // requests > 1s
const criticalRate = new Rate('critical_rate');          // requests > 3s
const requestDuration = new Trend('stress_request_duration', true);

// Puntos de quiebre detectados
const phase2kErrors = new Rate('phase_2k_error_rate');
const phase5kErrors = new Rate('phase_5k_error_rate');
const phase8kErrors = new Rate('phase_8k_error_rate');
const phase12kErrors = new Rate('phase_12k_error_rate');

const CSV = './test-users-5k.csv';

const allUsers = new SharedArray('allUsers', function () {
    return open(CSV).split('\n').slice(1)
        .filter(l => l.trim() && !l.startsWith('ADMIN'))
        .map(l => {
            const parts = l.split(',');
            return { role: parts[0], email: parts[1], password: parts[2] };
        });
});

// ─── Configuración ────────────────────────────────────────────────────────────
export const options = {
    stages: [
        // Fase 1: Normal (2,000 VUs)
        { duration: '5m', target: 2000 },
        { duration: '5m', target: 2000 },

        // Fase 2: Alta (5,000 VUs)
        { duration: '5m', target: 5000 },
        { duration: '5m', target: 5000 },

        // Fase 3: Extrema (8,000 VUs)
        { duration: '5m', target: 8000 },
        { duration: '5m', target: 8000 },

        // Fase 4: Crítica (12,000 VUs)
        { duration: '5m', target: 12000 },
        { duration: '10m', target: 12000 },

        // Fase 5: Sobrecarga máxima (15,000 VUs)
        { duration: '5m', target: 15000 },
        { duration: '10m', target: 15000 },

        // Ramp down
        { duration: '3m', target: 0 },
    ],
    thresholds: {
        // En stress test los thresholds son más permisivos
        'http_req_duration': ['p(95)<3000'],     // Permitir hasta 3s
        'http_req_failed': ['rate<0.10'],         // Hasta 10% de errores
        'critical_rate': ['rate<0.30'],           // Max 30% de requests > 3s
    },
    // Guardar reporte automáticamente
    summaryTimeUnit: '1s',
};

// ─── Variables de seguimiento de fases ───────────────────────────────────────
let currentPhase = 1;
let phaseBreakpoint = null;
let degradationVU = null;
let maxThroughput = 0;

export function setup() {
    console.log('\n⚠️  INICIANDO STRESS EXTREMO 5K');
    console.log('   Llevaremos el sistema hasta el límite.');
    console.log('   Monitorear PostgreSQL y Redis durante el test.');
    console.log('   Presionar Ctrl+C para abortar en cualquier momento.\n');
    return { startTime: Date.now() };
}

export default function () {
    const u = allUsers[__VU % allUsers.length];
    const token = loginUser(u.email, u.password, config.instituteSlug);

    if (!token) {
        stressErrors.add(1);
        sleep(1);
        return;
    }

    const hdr = authHeaders(token, config.instituteSlug);
    const start = Date.now();

    const r = http.get(`${config.apiUrl}/api/dashboard`, {
        headers: hdr,
        timeout: '15s',
    });

    const duration = Date.now() - start;
    requestDuration.add(duration);

    const isDegraded = duration > 1000;
    const isCritical = duration > 3000;

    degradationRate.add(isDegraded);
    criticalRate.add(isCritical);

    // Tracking por fase según VUs actuales
    const currentVUs = __VU;
    if (currentVUs <= 2000) phase2kErrors.add(r.status >= 500);
    else if (currentVUs <= 5000) phase5kErrors.add(r.status >= 500);
    else if (currentVUs <= 8000) phase8kErrors.add(r.status >= 500);
    else if (currentVUs <= 12000) phase12kErrors.add(r.status >= 500);

    if (r.status >= 500) {
        stressErrors.add(1);
    }

    check(r, {
        'stress: not timeout': x => x.status !== 0,
        'stress: not server error': x => x.status < 500,
        'stress: under 1s': x => duration < 1000,
        'stress: under 3s': x => duration < 3000,
    });

    sleep(0.5);
}

export function handleSummary(data) {
    const p95 = Math.round(data.metrics['http_req_duration']?.values?.['p(95)'] || 0);
    const p99 = Math.round(data.metrics['http_req_duration']?.values?.['p(99)'] || 0);
    const p50 = Math.round(data.metrics['http_req_duration']?.values?.['p(50)'] || 0);
    const rps = (data.metrics['http_reqs']?.values?.rate || 0).toFixed(1);
    const errRate = ((data.metrics['http_req_failed']?.values?.rate || 0) * 100).toFixed(2);
    const degraded = ((data.metrics['degradation_rate']?.values?.rate || 0) * 100).toFixed(1);
    const critical = ((data.metrics['critical_rate']?.values?.rate || 0) * 100).toFixed(1);
    const totalReqs = Math.round(data.metrics['http_reqs']?.values?.count || 0);
    const totalErrors = Math.round(data.metrics['stress_errors']?.values?.count || 0);

    // Error rates por fase
    const e2k = ((data.metrics['phase_2k_error_rate']?.values?.rate || 0) * 100).toFixed(1);
    const e5k = ((data.metrics['phase_5k_error_rate']?.values?.rate || 0) * 100).toFixed(1);
    const e8k = ((data.metrics['phase_8k_error_rate']?.values?.rate || 0) * 100).toFixed(1);
    const e12k = ((data.metrics['phase_12k_error_rate']?.values?.rate || 0) * 100).toFixed(1);

    // Diagnóstico
    function diagnoseFase(errPct) {
        const n = parseFloat(errPct);
        if (n < 1) return '✅ ESTABLE';
        if (n < 5) return '⚠️  DEGRADADO';
        return '❌ COLAPSANDO';
    }

    // Punto de quiebre estimado
    let breakpointEstimate = 'No alcanzado (sistema aguantó 15K VUs)';
    if (parseFloat(e8k) > 5) breakpointEstimate = '~8,000 VUs';
    else if (parseFloat(e5k) > 5) breakpointEstimate = '~5,000 VUs';
    else if (parseFloat(e12k) > 5) breakpointEstimate = '~12,000 VUs';

    // JSON para compare-results
    const jsonReport = JSON.stringify({
        testName: 'stress-extreme-5k',
        timestamp: new Date().toISOString(),
        p50, p95, p99,
        errorRate: parseFloat(errRate),
        degradedRate: parseFloat(degraded),
        criticalRate: parseFloat(critical),
        throughput: parseFloat(rps),
        totalRequests: totalReqs,
        breakpoint: breakpointEstimate,
        phases: { '2k': e2k, '5k': e5k, '8k': e8k, '12k': e12k },
    }, null, 2);

    return {
        stdout: `
╔══════════════════════════════════════════════════════════════╗
║              STRESS EXTREMO 5K - DIAGNÓSTICO FINAL           ║
╠══════════════════════════════════════════════════════════════╣
║ Total requests:      ${String(totalReqs.toLocaleString()).padStart(15)}                   ║
║ Total errores:       ${String(totalErrors.toLocaleString()).padStart(15)}                   ║
║ Throughput max:      ${(rps + ' req/s').padStart(15)}                   ║
╠══════════════════════════════════════════════════════════════╣
║ Response times:                                              ║
║   p(50):             ${(p50 + 'ms').padStart(15)}                   ║
║   p(95):             ${(p95 + 'ms').padStart(15)} (obj <3000ms)       ║
║   p(99):             ${(p99 + 'ms').padStart(15)}                   ║
╠══════════════════════════════════════════════════════════════╣
║ Análisis por fases:                                          ║
║   @ 2,000 VUs:       ${diagnoseFase(e2k).padStart(15)} (err: ${e2k}%)           ║
║   @ 5,000 VUs:       ${diagnoseFase(e5k).padStart(15)} (err: ${e5k}%)           ║
║   @ 8,000 VUs:       ${diagnoseFase(e8k).padStart(15)} (err: ${e8k}%)           ║
║   @ 12,000 VUs:      ${diagnoseFase(e12k).padStart(15)} (err: ${e12k}%)           ║
╠══════════════════════════════════════════════════════════════╣
║ Degradación (>1s):   ${(degraded + '%').padStart(15)}                   ║
║ Crítico (>3s):       ${(critical + '%').padStart(15)}                   ║
╠══════════════════════════════════════════════════════════════╣
║ 🎯 PUNTO DE QUIEBRE: ${breakpointEstimate.padEnd(39)}║
╚══════════════════════════════════════════════════════════════╝
`,
        'load-tests/reports/stress-latest.json': jsonReport,
    };
}
