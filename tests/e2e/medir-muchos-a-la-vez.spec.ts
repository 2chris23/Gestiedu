import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API_BASE, TENANT_SLUG, loginApi, queryTenantDb } from './helpers';

/**
 * MUCHOS ALUMNOS ENTRAN POR PRIMERA VEZ A LA VEZ (la regla: nunca por culpa del sistema)
 *
 * Hace sin navegador lo que hace el teléfono, con N alumnos a la vez, y apunta
 * cuánto tarda cada uno en tener TODO lo suyo:
 *
 *   - con cubos (`/precarga/indice` + `/precarga/cubo/:clave`), lo de ahora;
 *   - VIEJO=1: con el paquete por persona (`/precarga/paquete`, 202/404 cada 1,5 s), lo de antes.
 *
 *   FRIO=1  borra antes el índice de esos alumnos (como una cuenta creada hace un
 *           minuto, que el servidor aún no preparó); sin él, es el caso de
 *           siempre: cuentas creadas antes, preparadas de noche.
 *
 *   MEDIR=1 N=300 npx playwright test medir-muchos-a-la-vez
 */

test.skip(!process.env.MEDIR, 'Solo mide con MEDIR=1');
test.setTimeout(30 * 60_000);

const esperar = (ms: number) => new Promise((h) => setTimeout(h, ms));

/** Como el teléfono: si la conexión falla, espera un poco y reintenta. Se cuentan. */
let fallosDeRed = 0;
const codigos: Record<string, number> = {};
async function pedir(url: string, init?: RequestInit): Promise<Response> {
    for (let i = 0; ; i++) {
        try {
            return await fetch(url, init);
        } catch (e) {
            fallosDeRed++;
            const causa = (e as any)?.cause; codigos[causa?.code ?? causa?.errors?.[0]?.code ?? String(causa?.message ?? e).slice(0, 40)] = (codigos[causa?.code ?? causa?.errors?.[0]?.code ?? String(causa?.message ?? e).slice(0, 40)] ?? 0) + 1;
            if (i >= 8) throw e;
            await esperar(200 + Math.random() * 800);
        }
    }
}

async function conCubos(token: string, t0: number) {
    const cab = { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG };
    let preguntas = 0;
    let en202 = 0;
    for (;;) {
        preguntas++;
        const r = await pedir(`${API_BASE}/precarga/indice`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: '{}' });
        if (r.status === 200) {
            const i = (await r.json()) as { cubos: Array<{ clave: string; bytes: number }> };
            let bytes = 0;
            let k = 0;
            const trabajador = async () => {
                while (k < i.cubos.length) {
                    const c = i.cubos[k++];
                    const b = await pedir(`${API_BASE}/precarga/cubo/${encodeURIComponent(c.clave)}`, { headers: cab });
                    bytes += (await b.arrayBuffer()).byteLength;
                }
            };
            await Promise.all([trabajador(), trabajador(), trabajador()]);
            return { ms: Date.now() - t0, preguntas, en202, bytes, cubos: i.cubos.length };
        }
        en202++;
        await r.arrayBuffer().catch(() => undefined);
        if (Date.now() - t0 > 25 * 60_000) return { ms: -1, preguntas, en202, bytes: 0, cubos: 0 };
        await esperar(1500);
    }
}

async function conPaquete(token: string, t0: number) {
    let preguntas = 0;
    let en202 = 0;
    for (;;) {
        preguntas++;
        const r = await pedir(`${API_BASE}/precarga/paquete`, { headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG } });
        if (r.status === 200) return { ms: Date.now() - t0, preguntas, en202, bytes: (await r.arrayBuffer()).byteLength, cubos: 1 };
        en202++;
        await r.arrayBuffer().catch(() => undefined);
        if (Date.now() - t0 > 25 * 60_000) return { ms: -1, preguntas, en202, bytes: 0, cubos: 0 };
        await esperar(1500);
    }
}

test('MEDIR: N alumnos entrando a la vez', async () => {
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
    for (const a of alumnos) sesiones.push(await loginApi(a.email));
    const ids = alumnos.map((a) => a.id);
    if (process.env.FRIO) {
        if (process.env.VIEJO) await queryTenantDb(`DELETE FROM paquetes_de_precarga WHERE "usuarioId" = ANY($1)`, [ids]);
        else await queryTenantDb(`DELETE FROM indices_de_precarga WHERE "usuarioId" = ANY($1)`, [ids]);
    }

    const t0 = Date.now();
    const tiempos = await Promise.all(sesiones.map((s) => (process.env.VIEJO ? conPaquete(s.accessToken, t0) : conCubos(s.accessToken, t0))));
    const ok = tiempos.filter((t) => t.ms >= 0).map((t) => t.ms).sort((a, b) => a - b);
    const p = (q: number) => ok[Math.min(ok.length - 1, Math.floor(q * ok.length))] / 1000;
    const resumen = {
        camino: process.env.VIEJO ? 'paquete' : 'cubos',
        frio: !!process.env.FRIO,
        n: alumnos.length,
        listos: ok.length,
        p50: p(0.5),
        p95: p(0.95),
        ultimo: ok[ok.length - 1] / 1000,
        esperaron: tiempos.filter((t) => t.en202 > 0).length,
        preguntasTotales: tiempos.reduce((x, t) => x + t.preguntas, 0),
        fallosDeRed,
        codigos,
        kbMedio: Math.round(tiempos.reduce((x, t) => x + t.bytes, 0) / Math.max(1, ok.length) / 1024),
    };
    console.log('MEDIR', JSON.stringify(resumen));
    const salida = path.resolve(__dirname, '../../docs/mediciones');
    fs.mkdirSync(salida, { recursive: true });
    fs.writeFileSync(path.join(salida, `muchos-a-la-vez-${resumen.camino}${resumen.frio ? '-frio' : ''}-${alumnos.length}.json`), JSON.stringify({ resumen, tiempos }, null, 1));
});
