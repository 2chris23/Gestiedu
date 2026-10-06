import { test, expect } from '@playwright/test';
import { loginViaUI, queryTenantDb } from './helpers';

/**
 * UNA FICHA GUARDADA VALE PARA TODAS (`public/sw.js`, `laPlantilla`)
 *
 * Con la web compilada (el ayudante solo guarda en producción). Se abren con
 * conexión las fichas de dos alumnos —así sus DATOS quedan en el teléfono—,
 * se tira del ayudante la PÁGINA de la segunda y, sin conexión, se abre: el
 * ayudante sirve la de la primera con el trozo de la dirección cambiado, y
 * tiene que salir la segunda persona, no la primera.
 *
 *   PLANTILLA-01  sin su página guardada, la ficha sale con SU nombre.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('PLANTILLA-01: sin su página guardada, la ficha de otro alumno sale con su nombre', async ({ page, context }) => {
    const alumnos = await queryTenantDb<{ id: string; firstName: string; lastName: string }>(
        `SELECT id, "firstName", "lastName" FROM users WHERE role = 'STUDENT' AND "isActive" = true ORDER BY id LIMIT 2`
    );
    expect(alumnos.length).toBe(2);
    const [a, b] = alumnos;

    await loginViaUI(page, 'admin@testing.edu.ve');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 30_000 }).toBe(true);

    for (const alumno of [a, b]) {
        await page.goto(`/dashboard/usuarios/${alumno.id}`);
        await expect(page.getByText(alumno.lastName.split(' ')[0]).first()).toBeVisible({ timeout: 30_000 });
        // Que el ayudante la traiga entera (`guardarLaPagina`).
        await expect
            .poll(
                () =>
                    page.evaluate(async (id) => {
                        for (const n of await caches.keys()) if (await (await caches.open(n)).match(`/dashboard/usuarios/${id}`)) return true;
                        return false;
                    }, alumno.id),
                { timeout: 30_000 }
            )
            .toBe(true);
        await page.waitForTimeout(1500);
    }

    // Fuera la página de la segunda: solo queda la de la primera como plantilla.
    await page.evaluate(async (id) => {
        for (const n of await caches.keys()) await (await caches.open(n)).delete(`/dashboard/usuarios/${id}`, { ignoreSearch: true, ignoreVary: true });
    }, b.id);

    await page.goto('/dashboard');
    await context.setOffline(true);
    try {
        const respuesta = await page.goto(`/dashboard/usuarios/${b.id}`);
        expect(respuesta?.headers()['x-plantilla-de']).toBe(`/dashboard/usuarios/${a.id}`);
        expect(new URL(page.url()).pathname).toBe(`/dashboard/usuarios/${b.id}`);
        await expect(page.getByText(b.lastName.split(' ')[0]).first()).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(/no está guardad/i)).toHaveCount(0);
        // Y la primera persona no aparece por ningún lado.
        expect(await page.getByText(`${a.firstName.split(' ')[0]} ${a.lastName.split(' ')[0]}`).count()).toBe(0);
    } finally {
        await context.setOffline(false);
    }
});
