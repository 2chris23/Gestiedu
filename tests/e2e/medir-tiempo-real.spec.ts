import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies } from './helpers';

/**
 * CUÁNTO TARDA EN VERSE LO QUE OTRO GUARDA
 *
 * No se deduce: se mide. Se cronometra el camino completo, el mismo que vive un
 * usuario: alguien guarda algo desde otro dispositivo y esta pantalla, que no se
 * toca, tiene que enseñarlo sola.
 *
 * El reloj arranca cuando el servidor confirma el guardado y para cuando el texto
 * aparece en pantalla. Lo que hay en medio es lo que se quiere conocer: el aviso
 * por socket, la ventana de agrupación, la petición de vuelta y el pintado.
 *
 * Ojo: medir contra el servidor de desarrollo miente (compila las pantallas al
 * entrar). Estas cifras solo valen en compilación de producción.
 */

const VECES = 6;

/** Nombre que ordena al principio de la lista, para que la paginación no lo esconda. */
function nombreDePrueba(sufijo: string): string {
    return `AAA Medicion ${sufijo}`;
}

/** Deja el catálogo como estaba: si una prueba se cayó antes, aquí se limpia. */
async function limpiarRestos(cabeceras: Record<string, string>): Promise<void> {
    const r = await axios
        .get(`${API_BASE}/subjects?limit=100`, { headers: cabeceras })
        .catch(() => null);
    const lista = r?.data?.data?.items ?? r?.data?.subjects ?? r?.data?.items ?? [];
    for (const materia of lista) {
        if (typeof materia?.name === 'string' && materia.name.startsWith('AAA Medicion')) {
            await axios
                .delete(`${API_BASE}/subjects/${materia.id}`, { headers: cabeceras })
                .catch(() => undefined);
        }
    }
}

test('MEDIR: cuánto tarda en aparecer lo que otro guarda', async ({ browser }) => {
    test.setTimeout(180000);

    const sesion = await loginApi('admin@testing.edu.ve', '123456');
    const cabeceras = {
        Authorization: `Bearer ${sesion.accessToken}`,
        'X-Institute-Slug': TENANT_SLUG,
    };

    await limpiarRestos(cabeceras);

    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await injectSessionCookies(page, sesion);
    await page.goto(`${WEB_BASE}/dashboard/materias`);
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000); // que el socket termine de conectarse

    const tiempos: number[] = [];

    try {
        for (let i = 0; i < VECES; i++) {
            const nombre = nombreDePrueba(`${Date.now()}-${i}`);

            await axios.post(
                `${API_BASE}/subjects`,
                { name: nombre, code: `MD${String(Date.now()).slice(-6)}`, description: 'medicion' },
                { headers: cabeceras }
            );
            const t0 = Date.now();

            await page.waitForFunction(
                (texto) => document.body.innerText.includes(texto),
                nombre,
                { timeout: 30000, polling: 25 }
            );
            const ms = Date.now() - t0;
            tiempos.push(ms);
            console.log(`  intento ${i + 1}: ${ms} ms`);

            await page.waitForTimeout(1500); // que no se agrupen entre sí
        }
    } finally {
        await limpiarRestos(cabeceras);
        await contexto.close();
    }

    const ordenados = [...tiempos].sort((a, b) => a - b);
    const promedio = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
    console.log('');
    console.log('  ───────────────────────────────────────────');
    console.log(`  APARECER SIN RECARGAR: promedio ${promedio} ms`);
    console.log(`  mejor ${ordenados[0]} ms · peor ${ordenados[ordenados.length - 1]} ms`);
    console.log('  ───────────────────────────────────────────');

    expect(promedio).toBeLessThan(300);
});

/**
 * UNA TANDA NO PUEDE CONVERTIRSE EN UNA ESTAMPIDA
 *
 * Atender el primer aviso al instante sirve de poco si al guardar treinta notas
 * seguidas la pantalla pide datos treinta veces.
 *
 * Se comprueban las dos mitades del trato:
 *
 *   1. **Se agrupa**: ocho cambios seguidos no pueden costar ocho peticiones.
 *   2. **No se pierde el final**: la última petición tiene que ocurrir *después*
 *      del último cambio. Si no, la pantalla se quedaría con el dato viejo — que
 *      es justo lo que no se puede permitir.
 *
 * Se mira el tráfico y no el texto en pantalla a propósito: la lista está
 * paginada, y lo recién creado puede caer en la página 2 sin que eso signifique
 * que algo falló.
 */
test('MEDIR: una tanda de cambios no dispara una petición por cada uno', async ({ browser }) => {
    test.setTimeout(180000);

    const DE_GOLPE = 8;

    const sesion = await loginApi('admin@testing.edu.ve', '123456');
    const cabeceras = {
        Authorization: `Bearer ${sesion.accessToken}`,
        'X-Institute-Slug': TENANT_SLUG,
    };

    await limpiarRestos(cabeceras);

    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await injectSessionCookies(page, sesion);
    await page.goto(`${WEB_BASE}/dashboard/materias`);
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000);

    const peticiones: number[] = [];
    page.on('request', (r) => {
        if (r.url().includes('/api/subjects')) peticiones.push(Date.now());
    });

    let ultimoGuardado = 0;
    // Se congelan las cifras antes de limpiar: los borrados de la limpieza también
    // provocan avisos, y contarlos estropearía la medición.
    let cuantasPeticiones = 0;
    let ultimaPeticion = 0;
    try {
        const marca = Date.now();
        for (let i = 0; i < DE_GOLPE; i++) {
            await axios.post(
                `${API_BASE}/subjects`,
                {
                    name: nombreDePrueba(`${marca}-${i}`),
                    code: `TN${String(marca).slice(-5)}${i}`,
                    description: 'tanda',
                },
                { headers: cabeceras }
            );
            ultimoGuardado = Date.now();
        }

        // Tiempo de sobra para que caiga la pasada final de la tanda.
        await page.waitForTimeout(4000);

        cuantasPeticiones = peticiones.length;
        ultimaPeticion = peticiones[peticiones.length - 1] ?? 0;
    } finally {
        await limpiarRestos(cabeceras);
    }

    console.log('');
    console.log('  ───────────────────────────────────────────');
    console.log(`  ${DE_GOLPE} cambios seguidos -> ${cuantasPeticiones} peticiones`);
    console.log(`  última petición ${ultimaPeticion - ultimoGuardado} ms después del último cambio`);
    console.log('  ───────────────────────────────────────────');

    await contexto.close();

    // Se agrupa: mucho menos de una petición por cambio.
    expect(cuantasPeticiones).toBeLessThan(DE_GOLPE);
    // Y no se pierde el final: la última petición ve el último cambio.
    expect(ultimaPeticion).toBeGreaterThan(ultimoGuardado);
});
