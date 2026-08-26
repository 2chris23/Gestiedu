/**
 * LOAD TEST - Harness de carga ligero (sin dependencias externas)
 * ===============================================================
 * Dispara requests concurrentes contra un endpoint y reporta RPS y
 * latencias p50/p95/p99.
 *
 * USO:
 *   npx tsx src/scripts/load-test.ts                                    # http://localhost:3001/health, 20 concurrentes, 10s
 *   npx tsx src/scripts/load-test.ts --url http://localhost:3001/health --concurrency 50 --duration 15
 *
 * Criterio de referencia (ajustar según infraestructura):
 *   - p95 < 250ms
 *   - 0 errores HTTP
 *   - RPS estable durante la duración
 */

import http from 'http';

interface CliArgs {
  url: string;
  concurrency: number;
  durationSeconds: number;
  maxRequests: number | undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    url: 'http://localhost:3001/health',
    concurrency: 20,
    durationSeconds: 10,
    maxRequests: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--url' && next) args.url = next;
    else if (flag === '--concurrency' && next) args.concurrency = parseInt(next, 10) || 20;
    else if (flag === '--duration' && next) args.durationSeconds = parseInt(next, 10) || 10;
    else if (flag === '--max-requests' && next) args.maxRequests = parseInt(next, 10);
  }
  return args;
}

function percentiles(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function fireRequest(
  url: string,
  onDone: (latencyMs: number, statusCode: number | null) => void
): void {
  const start = process.hrtime.bigint();
  const request = http.get(url, (res) => {
    res.resume();
    res.on('end', () => {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      onDone(latencyMs, res.statusCode ?? null);
    });
  });
  request.on('error', () => {
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    onDone(latencyMs, null);
  });
}

async function runLoadTest(args: CliArgs): Promise<void> {
  const { url, concurrency, durationSeconds, maxRequests } = args;
  const deadlineMs = Date.now() + durationSeconds * 1000;

  let completed = 0;
  let errors = 0;
  let non2xx = 0;
  const latencies: number[] = [];

  const budgetExhausted = (): boolean =>
    Date.now() >= deadlineMs || (maxRequests !== undefined && completed >= maxRequests);

  await new Promise<void>((resolve) => {
    let active = 0;
    let finished = false;

    const schedule = (): void => {
      if (finished) return;
      if (budgetExhausted()) {
        if (active === 0) {
          finished = true;
          resolve();
        }
        return;
      }
      active++;
      fireRequest(url, (latencyMs, statusCode) => {
        active--;
        completed++;
        latencies.push(latencyMs);
        if (statusCode === null) errors++;
        else if (statusCode < 200 || statusCode >= 300) non2xx++;
        if (budgetExhausted() && active === 0) {
          finished = true;
          resolve();
        } else {
          schedule();
        }
      });
    };

    for (let i = 0; i < concurrency; i++) schedule();
  });

  const elapsedSeconds = durationSeconds;
  const sorted = [...latencies].sort((a, b) => a - b);

  console.log('\n=== RESULTADOS DEL LOAD TEST ===');
  console.log(`URL:            ${url}`);
  console.log(`Concurrencia:   ${concurrency}`);
  console.log(`Duración:       ${durationSeconds}s`);
  console.log('---------------------------------');
  console.log(`Requests totales: ${completed}`);
  console.log(`RPS:             ${(completed / elapsedSeconds).toFixed(1)}`);
  console.log(`p50:             ${percentiles(sorted, 50).toFixed(1)} ms`);
  console.log(`p95:             ${percentiles(sorted, 95).toFixed(1)} ms`);
  console.log(`p99:             ${percentiles(sorted, 99).toFixed(1)} ms`);
  console.log(`Errores red:     ${errors}`);
  console.log(`No-2xx:          ${non2xx}`);

  const healthy = errors === 0 && non2xx === 0 && percentiles(sorted, 95) < 250;
  console.log('---------------------------------');
  console.log(`Estado: ${healthy ? 'OK ✔' : 'REVISAR ✘ (criterio: p95 < 250ms, 0 errores)'}`);
}

const args = parseArgs(process.argv.slice(2));
runLoadTest(args).catch((err) => {
  console.error('Error ejecutando load test:', err);
  process.exit(1);
});
