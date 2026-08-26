#!/usr/bin/env node
/**
 * COMPARACIÓN DE RESULTADOS - K6
 *
 * Compara dos reportes de load testing para detectar mejoras o regresiones.
 *
 * USO:
 *   node load-tests/compare-results.js \
 *     --baseline=load-tests/reports/test-2024-02-15.json \
 *     --current=load-tests/reports/test-2024-02-20.json
 *
 *   # Con reportes de K6 summary (--summary-export flag):
 *   k6 run --summary-export=load-tests/reports/baseline-summary.json ...
 *   k6 run --summary-export=load-tests/reports/current-summary.json ...
 *   node load-tests/compare-results.js \
 *     --baseline=load-tests/reports/baseline-summary.json \
 *     --current=load-tests/reports/current-summary.json
 */

const fs = require('fs');
const path = require('path');

// ─── Parse args ───────────────────────────────────────────────────────────────

const args = {};
process.argv.slice(2).forEach(arg => {
    const [key, val] = arg.replace(/^--/, '').split('=');
    args[key] = val;
});

if (!args.baseline || !args.current) {
    console.error('USO: node compare-results.js --baseline=<archivo> --current=<archivo>');
    process.exit(1);
}

// ─── Leer métricas de un JSON de K6 ──────────────────────────────────────────

function readMetrics(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Archivo no encontrado: ${filePath}`);
        process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    try {
        // Intentar parsear como K6 summary JSON (--summary-export)
        const json = JSON.parse(content);
        const m = json.metrics || json;

        return {
            p95: m?.http_req_duration?.['p(95)'] || m?.http_req_duration?.p95 || 0,
            p99: m?.http_req_duration?.['p(99)'] || m?.http_req_duration?.p99 || 0,
            avg: m?.http_req_duration?.avg || 0,
            errorRate: (m?.http_req_failed?.rate || 0) * 100,
            cacheHitRate: (m?.cache_hit_rate?.rate || 0) * 100,
            throughput: m?.http_reqs?.rate || 0,
            totalRequests: m?.http_reqs?.count || 0,
            writeFailRate: (m?.write_operations_failed?.rate || 0) * 100,
            dashP95: m?.dashboard_duration?.['p(95)'] || 0,
        };
    } catch {
        // Si es NDJSON de K6, parsear línea a línea
        const lines = content.split('\n').filter(Boolean);
        const rtValues = [];
        const errValues = [];
        let totalReqs = 0;

        for (const line of lines) {
            try {
                const e = JSON.parse(line);
                if (e.type === 'Point') {
                    if (e.metric === 'http_req_duration') rtValues.push(e.data.value);
                    if (e.metric === 'http_req_failed') errValues.push(e.data.value);
                    if (e.metric === 'http_reqs') totalReqs++;
                }
            } catch { }
        }

        const sorted = [...rtValues].sort((a, b) => a - b);
        const p = pct => Math.round(sorted[Math.ceil((pct / 100) * sorted.length) - 1] || 0);

        return {
            p95: p(95),
            p99: p(99),
            avg: Math.round(rtValues.reduce((a, b) => a + b, 0) / (rtValues.length || 1)),
            errorRate: errValues.length
                ? (errValues.filter(v => v > 0).length / errValues.length) * 100
                : 0,
            cacheHitRate: 0,
            throughput: totalReqs / 60,
            totalRequests: rtValues.length,
            writeFailRate: 0,
            dashP95: 0,
        };
    }
}

// ─── Formatear cambio ─────────────────────────────────────────────────────────

function formatChange(baseline, current, lowerIsBetter = true) {
    if (baseline === 0) return '   N/A   ';

    const pct = ((current - baseline) / baseline) * 100;
    const arrow = pct > 0 ? '↑' : '↓';
    const improved = lowerIsBetter ? pct < 0 : pct > 0;
    const symbol = improved ? '✅' : pct === 0 ? '➡️ ' : '⚠️ ';

    return `${symbol} ${arrow}${Math.abs(pct).toFixed(1)}%`;
}

function pad(s, n) { return String(s).padStart(n); }
function padR(s, n) { return String(s).padEnd(n); }

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
    const baseline = readMetrics(args.baseline);
    const current = readMetrics(args.current);

    const baselineName = path.basename(args.baseline, '.json');
    const currentName = path.basename(args.current, '.json');

    console.log('\n' + '═'.repeat(72));
    console.log('  📊 COMPARACIÓN DE RESULTADOS DE LOAD TESTING');
    console.log('═'.repeat(72));
    console.log(`\n  Baseline: ${baselineName}`);
    console.log(`  Actual:   ${currentName}`);
    console.log(`  Fecha:    ${new Date().toLocaleString()}\n`);

    const metrics = [
        { name: 'p(95) Response time', bVal: `${Math.round(baseline.p95)}ms`, cVal: `${Math.round(current.p95)}ms`, b: baseline.p95, c: current.p95, lower: true },
        { name: 'p(99) Response time', bVal: `${Math.round(baseline.p99)}ms`, cVal: `${Math.round(current.p99)}ms`, b: baseline.p99, c: current.p99, lower: true },
        { name: 'Avg Response time', bVal: `${Math.round(baseline.avg)}ms`, cVal: `${Math.round(current.avg)}ms`, b: baseline.avg, c: current.avg, lower: true },
        { name: 'Error rate', bVal: `${baseline.errorRate.toFixed(2)}%`, cVal: `${current.errorRate.toFixed(2)}%`, b: baseline.errorRate, c: current.errorRate, lower: true },
        { name: 'Cache hit rate', bVal: `${baseline.cacheHitRate.toFixed(1)}%`, cVal: `${current.cacheHitRate.toFixed(1)}%`, b: baseline.cacheHitRate, c: current.cacheHitRate, lower: false },
        { name: 'Throughput', bVal: `${baseline.throughput.toFixed(0)} req/s`, cVal: `${current.throughput.toFixed(0)} req/s`, b: baseline.throughput, c: current.throughput, lower: false },
        { name: 'Total requests', bVal: baseline.totalRequests.toLocaleString(), cVal: current.totalRequests.toLocaleString(), b: baseline.totalRequests, c: current.totalRequests, lower: false },
    ];

    // Header de tabla
    console.log(
        padR('Métrica', 28) + '│ ' +
        padR('Baseline', 16) + '│ ' +
        padR('Actual', 16) + '│ ' +
        'Cambio'
    );
    console.log('─'.repeat(28) + '┼─' + '─'.repeat(16) + '┼─' + '─'.repeat(16) + '┼─' + '─'.repeat(14));

    let improvements = 0;
    let regressions = 0;

    for (const m of metrics) {
        const change = formatChange(m.b, m.c, m.lower);
        const improved = m.lower ? m.c <= m.b : m.c >= m.b;
        if (m.b > 0) {
            if (improved) improvements++;
            else regressions++;
        }
        console.log(
            padR(m.name, 28) + '│ ' +
            padR(m.bVal, 16) + '│ ' +
            padR(m.cVal, 16) + '│ ' +
            change
        );
    }

    // Veredicto
    console.log('\n' + '═'.repeat(72));
    const score = improvements / (improvements + regressions);

    let verdict;
    if (score >= 0.8 && current.p95 < 500 && current.errorRate < 1) {
        verdict = '🎉 MEJORA SIGNIFICATIVA - Sistema optimizado correctamente';
    } else if (score >= 0.6) {
        verdict = '✅ MEJORA PARCIAL - Algunas métricas mejoraron';
    } else if (score === 0.5) {
        verdict = '➡️  SIN CAMBIO - Métricas similares al baseline';
    } else if (regressions > improvements && current.errorRate > baseline.errorRate * 1.5) {
        verdict = '🚨 REGRESIÓN CRÍTICA - El sistema empeoró significativamente';
    } else {
        verdict = '⚠️  POSIBLE REGRESIÓN - Revisar cambios recientes';
    }

    console.log(`\n  VEREDICTO: ${verdict}`);
    console.log(`\n  Mejoras: ${improvements} métricas | Regresiones: ${regressions} métricas`);

    // Recomendaciones
    const recs = [];
    if (current.p95 > baseline.p95 * 1.2) {
        recs.push('⚠️  Response time aumentó >20%. Revisar queries de DB o N+1 problems.');
    }
    if (current.errorRate > baseline.errorRate * 1.5) {
        recs.push('🚨 Error rate aumentó >50%. Verificar logs de Fastify y PostgreSQL.');
    }
    if (current.cacheHitRate < baseline.cacheHitRate * 0.8) {
        recs.push('⚠️  Cache hit rate bajó >20%. Revisar TTL y estrategia de invalidación.');
    }
    if (current.throughput > baseline.throughput * 1.2) {
        recs.push('✅ Throughput mejoró >20%. Excelente resultado.');
    }

    if (recs.length > 0) {
        console.log('\n  Recomendaciones:');
        recs.forEach(r => console.log(`  ${r}`));
    }

    console.log('\n' + '═'.repeat(72) + '\n');
}

main();
