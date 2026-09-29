import { test, expect, Page } from '@playwright/test';
import { WEB_BASE, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * LOS DOCUMENTOS SALEN LIMPIOS
 *
 * Cristian (2026-09-27) imprimió la carga horaria y salió con la cabecera de
 * la app («PA ProfesorAdmin» y la campana), la barra de abajo en las otras
 * hojas y una hoja en blanco. El corte `lateral:` (1024 px) se mide contra el
 * ancho del PAPEL: en una carta (≈703 px útiles) la app se pintaba como en un
 * teléfono. Por eso aquí se mide a ese ancho, y no a 1280 px como antes (así
 * no se veía nunca).
 *
 * Por cada papel: con la vista de impresión, nada visible fuera del documento;
 * y el PDF que sale no trae hojas de más. Lo del pie del navegador (fecha,
 * dirección) no sale en `page.pdf()`: eso se mira en el diálogo de imprimir.
 */

let d: { alumno: string; profe: string; seccion: string; materia: string; ciclo: string };

test.beforeAll(async () => {
    const [a] = await queryTenantDb(
        `SELECT sc."studentId" AS alumno, sc."classroomId" AS seccion, ay.name AS ciclo
           FROM student_classrooms sc JOIN academic_years ay ON ay.id = sc."academicYearId" AND ay.status = 'ACTIVE'
           JOIN users u ON u.id = sc."studentId" AND u."isActive"
          WHERE sc."isActive" ORDER BY u."lastName" LIMIT 1`
    );
    const [p] = await queryTenantDb(
        `SELECT cs."teacherId" AS profe, cs."subjectId" AS materia FROM classroom_subjects cs WHERE cs."classroomId" = $1 AND cs."teacherId" IS NOT NULL LIMIT 1`,
        [a.seccion]
    );
    d = { ...a, ...p };
});

async function comoAdmin(page: Page) {
    await injectSessionCookies(page, await loginApi('admin@testing.edu.ve', '123456'));
}

/** Lo que se ve en la vista de impresión fuera del documento (debería ser nada). */
async function loQueSobra(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const main = document.querySelector('main');
        const fuera: string[] = [];
        document.body.querySelectorAll('*').forEach((el) => {
            if (!(el instanceof HTMLElement) || (main && (main.contains(el) || el.contains(main)))) return;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'NEXT-ROUTE-ANNOUNCER'].includes(el.tagName)) return;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return;
            if (el.closest('[aria-hidden="true"]') && !el.innerText.trim()) return;
            fuera.push(`${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}: ${el.innerText.trim().slice(0, 40)}`);
        });
        return fuera;
    });
}

const hojasDelPdf = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

const PAPELES: Array<{ id: string; nombre: string; ruta: () => string; listo: string; hojas?: number }> = [
    { id: 'DOC-LIMPIO-01', nombre: 'Carga horaria', ruta: () => `/dashboard/carga-horaria/${encodeURIComponent(d.profe)}`, listo: 'article[aria-label="Carga horaria"] table', hojas: 1 },
    { id: 'DOC-LIMPIO-02', nombre: 'Constancia de estudio', ruta: () => `/dashboard/constancia/${encodeURIComponent(d.alumno)}`, listo: 'article p', hojas: 1 },
    { id: 'DOC-LIMPIO-03', nombre: 'Constancia de trabajo', ruta: () => `/dashboard/constancia-de-trabajo/${encodeURIComponent(d.profe)}`, listo: 'article p', hojas: 1 },
    { id: 'DOC-LIMPIO-04', nombre: 'Boleta', ruta: () => `/dashboard/boleta/${encodeURIComponent(d.alumno)}`, listo: 'article[aria-label="Boleta de calificaciones"] table' },
    { id: 'DOC-LIMPIO-05', nombre: 'Planilla de inscripción', ruta: () => `/dashboard/planilla-de-inscripcion/${encodeURIComponent(d.alumno)}`, listo: 'article h1' },
    { id: 'DOC-LIMPIO-06', nombre: 'Plan de evaluación', ruta: () => `/dashboard/plan-de-evaluacion/${d.seccion}/${d.materia}?lapso=1`, listo: 'table[aria-label="Plan de evaluación"], table[aria-label="Plan del lapso"]' },
    { id: 'DOC-LIMPIO-07', nombre: 'Resumen final', ruta: () => `/dashboard/resumen-final/${d.seccion}`, listo: 'article' },
    { id: 'DOC-LIMPIO-08', nombre: 'Carnets', ruta: () => `/dashboard/carnets?seccion=${d.seccion}`, listo: 'ul[aria-label="Carnets"] li' },
];

test.describe('Los documentos salen limpios', () => {
    // El ancho útil de una hoja carta con sus márgenes.
    test.use({ viewport: { width: 703, height: 1000 } });

    for (const p of PAPELES) {
        test(`${p.id}: ${p.nombre} sin nada de la app al imprimir`, async ({ page }, testInfo) => {
            try {
                await comoAdmin(page);
                await page.goto(`${WEB_BASE}${p.ruta()}`);
                await expect(page.locator(p.listo).first()).toBeVisible({ timeout: 60000 });
                // En pantalla ya se ve sola: ni barra de abajo ni cabecera de la app.
                await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);

                await page.emulateMedia({ media: 'print' });
                expect(await loQueSobra(page)).toEqual([]);
                // Los botones («Volver», «Imprimir») tampoco salen en el papel.
                await expect(page.getByRole('button', { name: /Imprimir/ })).toBeHidden();
                await page.screenshot({ path: `test-results/evidencia/${p.id}-impreso.png`, fullPage: true });

                const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
                if (p.hojas) expect(hojasDelPdf(pdf)).toBe(p.hojas);
                else expect(hojasDelPdf(pdf)).toBeGreaterThan(0);
            } catch (error) {
                await captureEvidence(testInfo, page, p.id, `${p.nombre} limpio al imprimir`, error);
                throw error;
            }
        });
    }
});
