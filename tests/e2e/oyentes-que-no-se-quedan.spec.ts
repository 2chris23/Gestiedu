import { test, expect } from '@playwright/test';
import { loginApi, injectSessionCookies, queryTenantDb, WEB_BASE } from './helpers';

/**
 * LOS OYENTES SE VAN CON SU PANTALLA (OYENTES-01, 2026-10-05)
 *
 * El profesor deja la app abierta toda la mañana y va y viene entre
 * pantallas sin recargar. Cada pantalla se apunta a eventos (`resize`,
 * `scroll`, `online`, la visibilidad…); si al irse no se borra, el oyente se
 * queda vivo con la pantalla vieja en la memoria. Cada vuelta deja uno más,
 * el teléfono barato se arrastra a media mañana y nada da error.
 *
 * Se cuentan los oyentes de `window` y `document` vivos tras ir y volver
 * varias veces por las pantallas de cada día (navegando dentro de la app,
 * como el dedo): después de la primera vuelta, el número no puede crecer.
 */

test('OYENTES-01: ir y volver entre pantallas no deja oyentes vivos', async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(() => {
        const vivos = new Map<string, number>();
        const clave = (blanco: any, tipo: string, f: any, opciones: any) =>
            `${blanco === window ? 'w' : 'd'}|${tipo}|${typeof opciones === 'boolean' ? opciones : Boolean(opciones?.capture)}|${(f as any).__id ?? ((f as any).__id = Math.random())}`;
        for (const blanco of [window, document] as any[]) {
            const poner = blanco.addEventListener.bind(blanco);
            const quitar = blanco.removeEventListener.bind(blanco);
            blanco.addEventListener = (tipo: string, f: any, o: any) => {
                if (f && !(o && o.signal)) {
                    const k = clave(blanco, tipo, f, o);
                    vivos.set(k, (vivos.get(k) ?? 0) + 1);
                }
                return poner(tipo, f, o);
            };
            blanco.removeEventListener = (tipo: string, f: any, o: any) => {
                if (f) vivos.delete(clave(blanco, tipo, f, o));
                return quitar(tipo, f, o);
            };
        }
        (window as any).__oyentesVivos = () => [...vivos.keys()].length;
        (window as any).__oyentesPorTipo = () => {
            const t: Record<string, number> = {};
            for (const k of vivos.keys()) {
                const n = k.split('|').slice(0, 2).join(':');
                t[n] = (t[n] ?? 0) + 1;
            }
            return t;
        };
    });

    // Un profesor que tenga clases (para poder entrar a una clase en vivo).
    const [cs] = await queryTenantDb<{ classroomId: string; subjectId: string; email: string }>(
        `SELECT cs."classroomId", cs."subjectId", u.email FROM classroom_subjects cs
         JOIN users u ON u.id = cs."teacherId" AND u."isActive" = true AND u.role = 'TEACHER'
         ORDER BY u.email LIMIT 1`
    );
    const clase = cs ? `/dashboard/clase-en-vivo/${cs.classroomId}/${cs.subjectId}` : null;
    const sesion = await loginApi(cs?.email ?? 'profesor.ciencias@tuapp.com', '123456');
    await page.setViewportSize({ width: 1366, height: 768 });
    await injectSessionCookies(page, sesion);
    await page.goto(`${WEB_BASE}/dashboard`);
    await page.locator('main').first().waitFor();

    const rutas = ['/dashboard/academico', '/dashboard/horarios', '/dashboard/materias', '/dashboard'];
    let pasoPorLaClase = false;
    const vuelta = async () => {
        for (const ruta of rutas) {
            // Dentro de la app, como el dedo: el enlace del menú, sin recargar.
            await page.locator(`nav a[href="${ruta}"]`).first().click();
            await page.waitForURL(`**${ruta}`);
            await page.locator('main').first().waitFor();
            await page.waitForTimeout(1200);
            // La clase en vivo, que es la que pasa la mañana abierta: se entra
            // y se sale con el enrutador de la app (como al tocar el horario).
            if (clase) {
                await page.evaluate((u) => (window as any).next.router.push(u), clase);
                await page.waitForURL('**/dashboard/clase-en-vivo/**');
                await page.locator('main').first().waitFor();
                await page.waitForTimeout(2500);
                pasoPorLaClase = true;
                await page.locator(`nav a[href="${ruta}"]`).first().click();
                await page.waitForURL(`**${ruta}`);
            }
        }
    };

    await vuelta(); // la primera: se montan los que viven toda la sesión
    const tras1 = await page.evaluate(() => (window as any).__oyentesVivos());
    const tipos1 = await page.evaluate(() => (window as any).__oyentesPorTipo());
    for (let i = 0; i < 4; i++) await vuelta();
    const tras5 = await page.evaluate(() => (window as any).__oyentesVivos());
    const tipos5 = await page.evaluate(() => (window as any).__oyentesPorTipo());

    const crecieron = Object.fromEntries(
        Object.entries(tipos5 as Record<string, number>).filter(([k, n]) => n > ((tipos1 as Record<string, number>)[k] ?? 0))
    );
    console.log(`  oyentes vivos: tras 1 vuelta ${tras1}, tras 5 vueltas ${tras5}; pasó por la clase en vivo: ${pasoPorLaClase}`, crecieron);
    // Un margen de 2 por lo que tarde en desmontarse lo último abierto.
    expect({ tras5, crecieron }).toEqual({ tras5: expect.any(Number), crecieron: expect.anything() });
    expect(tras5 - tras1).toBeLessThanOrEqual(2);
});
