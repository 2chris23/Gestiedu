import { test } from '@playwright/test';
import { API_BASE, TENANT_SLUG, loginApi, queryTenantDb } from './helpers';

/**
 * DÓNDE SE VA EL TIEMPO DE ARMAR LA DESCARGA DE ALGUIEN (fase 0 de la precarga)
 *
 * Mide, para un alumno, un profesor y un representante: cuánto tarda el plan
 * (qué leer) y cada lectura por separado, y si la lectura de dos personas del
 * mismo rol (y de la misma sección, para los alumnos) sale IDÉNTICA: lo
 * idéntico se puede armar una vez para todos (los cubos del árbol). No se pone
 * en rojo: mide.
 *
 *   MEDIR=1 npx playwright test medir-armado
 */

test.skip(!process.env.MEDIR, 'Solo mide con MEDIR=1');
test.setTimeout(10 * 60_000);

async function plan(token: string) {
    const t = Date.now();
    const r = await fetch(`${API_BASE}/precarga/plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG, 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu: null }),
    });
    const j = (await r.json()) as { lecturas: string[] };
    return { ms: Date.now() - t, lecturas: j.lecturas ?? [] };
}

async function leer(token: string, l: string) {
    const t = performance.now();
    const r = await fetch(`${API_BASE}${l}`, { headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG } });
    const texto = await r.text();
    return { ms: performance.now() - t, estado: r.status, texto };
}

const molde = (l: string, ids: Record<string, string>) => {
    let m = l;
    for (const [k, v] of Object.entries(ids)) m = m.split(v).join(`{${k}}`);
    return m.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|c[a-z0-9]{24}/g, '{id}');
};

test('MEDIR: dónde se va el tiempo de armar, y qué se puede compartir', async () => {
    const [a1, a2] = await queryTenantDb<{ id: string; email: string; sid: string }>(
        `SELECT u.id, u.email, sc."classroomId" sid FROM users u JOIN student_classrooms sc ON sc."studentId" = u.id AND sc."isActive"
           WHERE u.role = 'STUDENT' AND u."isActive" AND sc."classroomId" = (
             SELECT sc2."classroomId" FROM student_classrooms sc2 WHERE sc2."isActive" GROUP BY 1 ORDER BY count(*) DESC LIMIT 1)
           ORDER BY u.email LIMIT 2`
    );
    const [p1, p2] = await queryTenantDb<{ id: string; email: string }>(
        `SELECT u.id, u.email FROM classroom_subjects cs JOIN users u ON u.id = cs."teacherId" WHERE u."isActive" GROUP BY u.id, u.email ORDER BY count(*) DESC LIMIT 2`
    );
    for (const [rol, x, y, extra] of [
        ['ALUMNO', a1, a2, { seccion: a1.sid }],
        ['PROFESOR', p1, p2, {}],
    ] as const) {
        const sx = await loginApi(x.email);
        const sy = await loginApi(y.email);
        const px = await plan(sx.accessToken);
        const py = await plan(sy.accessToken);
        const porMolde = new Map<string, { ms: number; bytes: number; igual: boolean | null }>();
        let total = 0;
        for (const l of px.lecturas) {
            const r = await leer(sx.accessToken, l);
            total += r.ms;
            const m = molde(l, { yo: x.id, ...(extra as Record<string, string>) });
            // La misma lectura de la otra persona (con SU id en vez del mío).
            const otra = py.lecturas.find((k) => molde(k, { yo: y.id, ...(extra as Record<string, string>) }) === m);
            let igual: boolean | null = null;
            if (otra) igual = (await leer(sy.accessToken, otra)).texto === r.texto;
            const antes = porMolde.get(m);
            porMolde.set(m, { ms: (antes?.ms ?? 0) + r.ms, bytes: (antes?.bytes ?? 0) + r.texto.length, igual: antes ? antes.igual && igual : igual });
        }
        const filas = [...porMolde.entries()].sort((a, b) => b[1].ms - a[1].ms);
        const compartible = filas.filter(([, v]) => v.igual);
        console.log(
            `\n${rol}: plan ${px.ms} ms · ${px.lecturas.length} lecturas · ${Math.round(total)} ms leyendo de una en una · ` +
                `compartible ${compartible.length}/${filas.length} moldes (${Math.round(compartible.reduce((a, [, v]) => a + v.ms, 0))} ms, ${Math.round(compartible.reduce((a, [, v]) => a + v.bytes, 0) / 1024)} KB)`
        );
        for (const [m, v] of filas.slice(0, 25)) console.log(`  ${v.igual === null ? '  ?' : v.igual ? ' = ' : ' ≠ '} ${Math.round(v.ms).toString().padStart(5)} ms ${Math.round(v.bytes / 1024).toString().padStart(4)} KB  ${m}`);
    }
});
