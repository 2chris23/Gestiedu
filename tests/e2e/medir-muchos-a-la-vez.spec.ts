import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_BASE, TENANT_SLUG, loginApi, queryTenantDb } from './helpers';

/**
 * MUCHOS ALUMNOS ENTRAN POR PRIMERA VEZ A LA VEZ (fase 0 de la precarga)
 *
 * Mide, sin navegador, lo que el teléfono hace con el paquete: pide
 * `/precarga/paquete` y, mientras responde 202 («se está armando») o 404,
 * vuelve a preguntar cada 1,5 s, como `lib/precarga.ts`. Apunta cuánto tarda
 * cada uno en recibir su paquete. No se pone en rojo: mide.
 *
 *   MEDIR=1 N=40 npx playwright test medir-muchos-a-la-vez
 */

test.skip(!process.env.MEDIR, 'Solo mide con MEDIR=1');
test.setTimeout(30 * 60_000);

test('MEDIR: N alumnos en frío a la vez', async () => {
    const n = Number(process.env.N || 40);
    const alumnos = await queryTenantDb<{ id: string; email: string }>(
        `SELECT DISTINCT u.id, u.email FROM users u
           JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive" = true
           JOIN classrooms c ON c.id = sc."classroomId"
           JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
          WHERE u.role = 'STUDENT' AND u."isActive" ORDER BY u.email LIMIT $1`,
        [n]
    );
    const sesiones = [];
    for (const a of alumnos) sesiones.push({ a, s: await loginApi(a.email) });
    await queryTenantDb(`DELETE FROM paquetes_de_precarga WHERE "usuarioId" = ANY($1)`, [alumnos.map((a) => a.id)]);

    const t0 = Date.now();
    const tiempos = await Promise.all(
        sesiones.map(async ({ s }) => {
            let preguntas = 0;
            let vio404 = 0;
            for (;;) {
                preguntas++;
                const r = await fetch(`${API_BASE}/precarga/paquete`, {
                    headers: { Authorization: `Bearer ${s.accessToken}`, 'X-Institute-Slug': TENANT_SLUG },
                });
                if (r.status === 200) {
                    const bytes = (await r.arrayBuffer()).byteLength;
                    return { ms: Date.now() - t0, preguntas, vio404, bytes };
                }
                if (r.status === 404) vio404++;
                await r.arrayBuffer().catch(() => undefined);
                if (Date.now() - t0 > 25 * 60_000) return { ms: -1, preguntas, vio404, bytes: 0 };
                await new Promise((h) => setTimeout(h, 1500));
            }
        })
    );
    const ok = tiempos.filter((t) => t.ms >= 0).map((t) => t.ms).sort((a, b) => a - b);
    const p = (q: number) => ok[Math.min(ok.length - 1, Math.floor(q * ok.length))] / 1000;
    const resumen = {
        n: alumnos.length,
        listos: ok.length,
        p50: p(0.5),
        p95: p(0.95),
        ultimo: ok[ok.length - 1] / 1000,
        con404: tiempos.filter((t) => t.vio404 > 0).length,
        preguntasTotales: tiempos.reduce((x, t) => x + t.preguntas, 0),
        kbMedio: Math.round(tiempos.reduce((x, t) => x + t.bytes, 0) / Math.max(1, ok.length) / 1024),
    };
    console.log('MEDIR', JSON.stringify(resumen));
    const salida = path.resolve(__dirname, '../../docs/mediciones');
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(path.join(salida, `muchos-a-la-vez-${alumnos.length}.json`), JSON.stringify({ resumen, tiempos }, null, 1));
});
