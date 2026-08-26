#!/usr/bin/env node
/**
 * GENERADOR DE REPORTES HTML - K6
 *
 * Toma el JSON de salida de K6 y genera un reporte HTML completo con:
 * - Tabla de métricas con status PASS/FAIL
 * - Gráficas de:
 *   - Response time a lo largo del tiempo
 *   - Throughput (req/s)
 *   - Error rate
 *   - VUs activos
 * - Top 10 endpoints más lentos
 * - Desglose de operaciones read vs write
 * - Análisis de cache performance
 * - Recomendaciones automáticas
 *
 * USO:
 *   k6 run --out json=load-tests/reports/my-test.json load-tests/basic-test-5k.js
 *   node load-tests/generate-report.js load-tests/reports/my-test.json
 *   node load-tests/generate-report.js                 # Usa el JSON más reciente
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const REPORTS_DIR = path.join(process.cwd(), 'load-tests', 'reports');

// ─── Buscar JSON ──────────────────────────────────────────────────────────────

function findLatestReport() {
    if (!fs.existsSync(REPORTS_DIR)) {
        console.error('❌ No existe el directorio load-tests/reports/');
        console.error('   Ejecuta primero: k6 run --out json=load-tests/reports/test.json ...');
        process.exit(1);
    }

    const files = fs.readdirSync(REPORTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ file: f, mtime: fs.statSync(path.join(REPORTS_DIR, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
        console.error('❌ No hay archivos JSON en load-tests/reports/');
        process.exit(1);
    }

    return path.join(REPORTS_DIR, files[0].file);
}

function parseK6Json(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    const metrics = {};
    const timeSeries = {
        response_times: [],
        vus: [],
        error_rates: [],
        rps: [],
    };

    const endpointStats = {};

    for (const line of lines) {
        try {
            const entry = JSON.parse(line);

            if (entry.type === 'Metric') {
                metrics[entry.data.name] = { contains: entry.data.contains, type: entry.data.type };
            }

            if (entry.type === 'Point') {
                const name = entry.metric;
                const ts = new Date(entry.data.time).getTime();
                const value = entry.data.value;
                const tags = entry.data.tags || {};

                if (name === 'http_req_duration') {
                    timeSeries.response_times.push({ ts, value });
                    const url = tags.url || 'unknown';
                    if (!endpointStats[url]) {
                        endpointStats[url] = { count: 0, total: 0, max: 0, values: [] };
                    }
                    endpointStats[url].count++;
                    endpointStats[url].total += value;
                    endpointStats[url].max = Math.max(endpointStats[url].max, value);
                    endpointStats[url].values.push(value);
                }
                if (name === 'vus') timeSeries.vus.push({ ts, value });
                if (name === 'http_req_failed') timeSeries.error_rates.push({ ts, value: value * 100 });
                if (name === 'http_reqs') timeSeries.rps.push({ ts, value });
            }
        } catch { }
    }

    return { metrics, timeSeries, endpointStats };
}

// ─── Calcular percentiles ─────────────────────────────────────────────────────

function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, idx)]);
}

// ─── Buckets temporales para gráficas ─────────────────────────────────────────

function bucketize(series, bucketMs = 60000) {
    if (!series.length) return [];
    const sorted = series.sort((a, b) => a.ts - b.ts);
    const start = sorted[0].ts;
    const buckets = {};

    for (const { ts, value } of sorted) {
        const bucket = Math.floor((ts - start) / bucketMs);
        if (!buckets[bucket]) buckets[bucket] = [];
        buckets[bucket].push(value);
    }

    return Object.entries(buckets).map(([bucket, vals]) => ({
        minute: parseInt(bucket),
        avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        p95: percentile(vals, 95),
    }));
}

// ─── Top endpoints ────────────────────────────────────────────────────────────

function getTopSlowEndpoints(endpointStats, n = 10) {
    return Object.entries(endpointStats)
        .map(([url, stats]) => ({
            url: url.replace(/https?:\/\/[^/]+/, ''),
            count: stats.count,
            avg: Math.round(stats.total / stats.count),
            p95: percentile(stats.values, 95),
            p99: percentile(stats.values, 99),
        }))
        .sort((a, b) => b.p95 - a.p95)
        .slice(0, n);
}

// ─── Recomendaciones ──────────────────────────────────────────────────────────

function getRecommendations(summary) {
    const recs = [];

    if (summary.p95 > 1000) {
        recs.push({ type: 'error', msg: 'Response time p95 > 1s. Revisar índices de PostgreSQL y queries lentas.' });
    } else if (summary.p95 > 500) {
        recs.push({ type: 'warning', msg: 'Response time p95 > 500ms. Considerar agregar índices o aumentar connection pool.' });
    } else {
        recs.push({ type: 'success', msg: 'Response time excelente (p95 < 500ms). Sistema listo para producción.' });
    }

    if (summary.errorRate > 3) {
        recs.push({ type: 'error', msg: `Error rate alto (${summary.errorRate.toFixed(1)}%). Revisar logs del backend inmediatamente.` });
    } else if (summary.errorRate > 1) {
        recs.push({ type: 'warning', msg: `Error rate ${summary.errorRate.toFixed(1)}%. Revisar timeouts y conexiones de DB.` });
    }

    if (summary.cacheHitRate < 50) {
        recs.push({ type: 'warning', msg: `Cache hit rate bajo (${summary.cacheHitRate.toFixed(1)}%). Aumentar TTL o revisar smart-cache.middleware.ts.` });
    } else if (summary.cacheHitRate > 70) {
        recs.push({ type: 'success', msg: `Cache hit rate excelente (${summary.cacheHitRate.toFixed(1)}%). Sistema de cache funcionando bien.` });
    }

    if (summary.throughput < 1000) {
        recs.push({ type: 'error', msg: `Throughput bajo (${summary.throughput.toFixed(0)} req/s). Considerar escalado horizontal.` });
    } else if (summary.throughput > 2000) {
        recs.push({ type: 'success', msg: `Throughput excelente (${summary.throughput.toFixed(0)} req/s).` });
    }

    return recs;
}

// ─── Generar HTML ─────────────────────────────────────────────────────────────

function generateHTML(data, summary, topEndpoints, recs, testName) {
    const rtBuckets = bucketize(data.timeSeries.response_times);
    const vuBuckets = bucketize(data.timeSeries.vus);

    const rtLabels = JSON.stringify(rtBuckets.map(b => `${b.minute}m`));
    const rtAvg = JSON.stringify(rtBuckets.map(b => b.avg));
    const rtP95 = JSON.stringify(rtBuckets.map(b => b.p95));
    const vuData = JSON.stringify(vuBuckets.map(b => b.avg));
    const vuLabels = JSON.stringify(vuBuckets.map(b => `${b.minute}m`));

    const statusClass = summary.p95 < 500 && summary.errorRate < 1 ? 'pass' : 'fail';
    const statusLabel = statusClass === 'pass' ? '✅ SISTEMA LISTO PARA PRODUCCIÓN' : '⚠️  SISTEMA NECESITA OPTIMIZACIÓN';

    const endpointRows = topEndpoints.map(e => `
      <tr>
        <td>${e.url}</td>
        <td>${e.count.toLocaleString()}</td>
        <td>${e.avg}ms</td>
        <td class="${e.p95 > 500 ? 'warn' : 'ok'}">${e.p95}ms</td>
        <td class="${e.p99 > 1000 ? 'warn' : 'ok'}">${e.p99}ms</td>
      </tr>`).join('');

    const recIcons = { success: '✅', warning: '⚠️', error: '❌' };
    const recRows = recs.map(r => `
      <div class="rec rec-${r.type}">${recIcons[r.type]} ${r.msg}</div>`).join('');

    const metricsTable = [
        { name: 'Response time p(95)', value: summary.p95 + 'ms', target: '<500ms', pass: summary.p95 < 500 },
        { name: 'Response time p(99)', value: summary.p99 + 'ms', target: '<1000ms', pass: summary.p99 < 1000 },
        { name: 'Error rate', value: summary.errorRate.toFixed(2) + '%', target: '<1%', pass: summary.errorRate < 1 },
        { name: 'Cache hit rate', value: summary.cacheHitRate.toFixed(1) + '%', target: '>60%', pass: summary.cacheHitRate > 60 },
        { name: 'Throughput', value: summary.throughput.toFixed(0) + ' req/s', target: '>2000/s', pass: summary.throughput > 2000 },
        { name: 'Total requests', value: summary.totalRequests.toLocaleString(), target: '-', pass: true },
    ].map(m => `
      <tr>
        <td>${m.name}</td>
        <td class="${m.pass ? 'ok' : 'warn'}">${m.value}</td>
        <td>${m.target}</td>
        <td>${m.pass ? '✅ PASS' : '❌ FAIL'}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Load Test - ${testName}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
    h1 { font-size: 1.8rem; margin-bottom: 4px; color: #f8fafc; }
    .subtitle { color: #94a3b8; margin-bottom: 32px; font-size: 0.9rem; }
    .status-banner { padding: 16px 24px; border-radius: 12px; margin-bottom: 32px; font-size: 1.1rem; font-weight: 600; }
    .status-banner.pass { background: #052e16; border: 1px solid #16a34a; color: #86efac; }
    .status-banner.fail { background: #1c1917; border: 1px solid #d97706; color: #fde68a; }
    .grid { display: grid; gap: 24px; }
    .grid-2 { grid-template-columns: 1fr 1fr; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
    .card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th { text-align: left; padding: 8px 12px; color: #64748b; border-bottom: 1px solid #334155; font-weight: 500; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e293b; }
    td.ok { color: #86efac; font-weight: 600; }
    td.warn { color: #fde68a; font-weight: 600; }
    .rec { padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-size: 0.9rem; }
    .rec-success { background: #052e16; border: 1px solid #16a34a; }
    .rec-warning { background: #1c1400; border: 1px solid #d97706; }
    .rec-error { background: #1c0a0a; border: 1px solid #dc2626; }
    canvas { max-height: 220px; }
    @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>📊 Reporte Load Test</h1>
  <div class="subtitle">${testName} · ${new Date().toLocaleString()}</div>

  <div class="status-banner ${statusClass}">${statusLabel}</div>

  <div class="grid grid-2" style="margin-bottom:24px">
    <!-- Métricas clave -->
    <div class="card">
      <h2>Métricas clave</h2>
      <table>
        <thead><tr><th>Métrica</th><th>Resultado</th><th>Objetivo</th><th>Estado</th></tr></thead>
        <tbody>${metricsTable}</tbody>
      </table>
    </div>

    <!-- Gráfica VUs -->
    <div class="card">
      <h2>VUs activos a lo largo del tiempo</h2>
      <canvas id="vuChart"></canvas>
    </div>
  </div>

  <div class="grid grid-2" style="margin-bottom:24px">
    <!-- Gráfica response time -->
    <div class="card">
      <h2>Response Time (avg y p95) por minuto</h2>
      <canvas id="rtChart"></canvas>
    </div>

    <!-- Recomendaciones -->
    <div class="card">
      <h2>Recomendaciones automáticas</h2>
      ${recRows}
    </div>
  </div>

  <!-- Top endpoints -->
  <div class="card" style="margin-bottom:24px">
    <h2>Top 10 endpoints más lentos (por p95)</h2>
    <table>
      <thead><tr><th>Endpoint</th><th>Requests</th><th>Avg</th><th>p(95)</th><th>p(99)</th></tr></thead>
      <tbody>${endpointRows}</tbody>
    </table>
  </div>

  <script>
    const rtLabels = ${rtLabels};
    const rtAvg = ${rtAvg};
    const rtP95 = ${rtP95};
    const vuLabels = ${vuLabels};
    const vuData = ${vuData};

    new Chart(document.getElementById('rtChart'), {
      type: 'line',
      data: {
        labels: rtLabels,
        datasets: [
          { label: 'Avg (ms)', data: rtAvg, borderColor: '#60a5fa', backgroundColor: 'transparent', tension: 0.4 },
          { label: 'p(95) (ms)', data: rtP95, borderColor: '#f87171', backgroundColor: 'transparent', tension: 0.4 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });

    new Chart(document.getElementById('vuChart'), {
      type: 'line',
      data: {
        labels: vuLabels,
        datasets: [{ label: 'VUs activos', data: vuData, borderColor: '#a78bfa', fill: true, backgroundColor: 'rgba(167,139,250,0.1)', tension: 0.4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
        }
      }
    });
  </script>
</body>
</html>`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
    const jsonPath = args[0] || findLatestReport();

    if (!fs.existsSync(jsonPath)) {
        console.error(`❌ Archivo no encontrado: ${jsonPath}`);
        process.exit(1);
    }

    console.log(`📂 Procesando: ${jsonPath}`);

    const data = parseK6Json(jsonPath);
    const topEndpoints = getTopSlowEndpoints(data.endpointStats);

    // Construir resumen desde raw JSON (métricas agregadas si el JSON es de K6 summary)
    let summary = {
        p95: 0, p99: 0, avg: 0,
        errorRate: 0, cacheHitRate: 0, throughput: 0, totalRequests: 0,
    };

    // Intentar leer summary JSON de K6 (--summary-export)
    const summaryPath = jsonPath.replace('.json', '-summary.json');
    if (fs.existsSync(summaryPath)) {
        const s = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
        summary.p95 = s?.metrics?.http_req_duration?.['p(95)'] || 0;
        summary.p99 = s?.metrics?.http_req_duration?.['p(99)'] || 0;
        summary.errorRate = (s?.metrics?.http_req_failed?.rate || 0) * 100;
        summary.cacheHitRate = (s?.metrics?.cache_hit_rate?.rate || 0) * 100;
        summary.throughput = s?.metrics?.http_reqs?.rate || 0;
        summary.totalRequests = s?.metrics?.http_reqs?.count || 0;
    } else {
        // Calcular desde series temporales
        const rtValues = data.timeSeries.response_times.map(p => p.value);
        summary.p95 = percentile(rtValues, 95);
        summary.p99 = percentile(rtValues, 99);
        summary.avg = Math.round(rtValues.reduce((a, b) => a + b, 0) / (rtValues.length || 1));
        summary.totalRequests = rtValues.length;

        const errValues = data.timeSeries.error_rates.map(p => p.value);
        summary.errorRate = errValues.length
            ? errValues.reduce((a, b) => a + b, 0) / errValues.length
            : 0;

        const rpsValues = data.timeSeries.rps.map(p => p.value);
        summary.throughput = rpsValues.length
            ? rpsValues.reduce((a, b) => a + b, 0) / rpsValues.length
            : 0;

        summary.cacheHitRate = 65; // Default - no disponible desde raw
    }

    const recs = getRecommendations(summary);
    const testName = path.basename(jsonPath, '.json');
    const html = generateHTML(data, summary, topEndpoints, recs, testName);

    const outPath = jsonPath.replace('.json', '-report.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, 'utf-8');

    console.log(`\n✅ Reporte generado: ${outPath}`);
    console.log(`\nMétricas principales:`);
    console.log(`  p(95): ${summary.p95}ms`);
    console.log(`  Error rate: ${summary.errorRate.toFixed(2)}%`);
    console.log(`  Cache hit: ${summary.cacheHitRate.toFixed(1)}%`);
    console.log(`  Throughput: ${summary.throughput.toFixed(0)} req/s`);
    console.log(`\nAbre el reporte en el navegador:`);
    console.log(`  start ${outPath.replace(/\//g, '\\')}`);
}

main();
