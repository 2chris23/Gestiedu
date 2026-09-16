import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { WEB_BASE, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * DESCARGAR EL HORARIO
 *
 * Antes había dos botones de "imprimir horario" que solo sacaban un aviso y no
 * hacían nada. Esta prueba pulsa el nuevo, recibe el archivo de verdad y mira
 * dentro: que la imagen sea una PNG del tamaño esperado y que el PDF tenga la
 * estructura que abre cualquier lector.
 */

const CARPETA = path.join(process.cwd(), 'test-results', 'horarios-descargados');

test.describe('Descargar el horario', () => {
    let ruta: string;

    test.beforeAll(async () => {
        const [fila] = await queryTenantDb(
            `SELECT ay.name AS ciclo, cl.slug AS seccion
             FROM classrooms cl
             JOIN academic_years ay ON ay.id = cl."academicYearId"
             WHERE ay.status = 'ACTIVE'
               AND EXISTS (SELECT 1 FROM schedule_blocks s WHERE s."classroomId" = cl.id)
             ORDER BY cl.grade, cl.section LIMIT 1`
        );
        ruta = `${WEB_BASE}/dashboard/academico/${fila?.ciclo}/${fila?.seccion}`;
        fs.mkdirSync(CARPETA, { recursive: true });
    });

    const bajar = async (page: any, opcion: RegExp) => {
        await page.getByRole('button', { name: 'Descargar horario' }).first().click();
        const [descarga] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.getByRole('menuitem', { name: opcion }).click(),
        ]);
        const destino = path.join(CARPETA, descarga.suggestedFilename());
        await descarga.saveAs(destino);
        return { nombre: descarga.suggestedFilename(), bytes: fs.readFileSync(destino) };
    };

    test('HORARIO-01: la imagen es una PNG de hoja carta con contenido', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(ruta);
            await expect(page.getByRole('button', { name: 'Descargar horario' }).first()).toBeVisible({ timeout: 30000 });

            const { nombre, bytes } = await bajar(page, /Imagen/);
            expect(nombre).toMatch(/^horario-[a-z0-9-]+\.png$/);
            // Firma PNG y dimensiones de la cabecera IHDR.
            expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
            expect(bytes.readUInt32BE(16)).toBe(1650);
            expect(bytes.readUInt32BE(20)).toBe(1275);
            // Liviana para mandarla por mensaje, pero no en blanco.
            expect(bytes.length).toBeGreaterThan(20_000);
            expect(bytes.length).toBeLessThan(1_500_000);
        } catch (error) {
            await captureEvidence(testInfo, page, 'HORARIO-01', 'Descargar PNG', error);
            throw error;
        }
    });

    test('HORARIO-02: el PDF tiene la estructura que abre cualquier lector', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, 'admin@testing.edu.ve', '123456');
            await page.goto(ruta);
            await expect(page.getByRole('button', { name: 'Descargar horario' }).first()).toBeVisible({ timeout: 30000 });

            const { nombre, bytes } = await bajar(page, /PDF/);
            expect(nombre).toMatch(/\.pdf$/);
            const texto = bytes.toString('latin1');
            expect(texto.startsWith('%PDF-1.4')).toBe(true);
            expect(texto.trimEnd().endsWith('%%EOF')).toBe(true);

            // Cada entrada de la tabla tiene que apuntar al inicio exacto de su
            // objeto. Si una posición está corrida, el lector dice "archivo dañado".
            const inicioTabla = Number(/startxref\n(\d+)/.exec(texto)?.[1]);
            expect(texto.slice(inicioTabla, inicioTabla + 4)).toBe('xref');
            const entradas = texto.slice(inicioTabla).split('\n').slice(3, 8);
            entradas.forEach((linea, i) => {
                const pos = Number(linea.slice(0, 10));
                expect(texto.slice(pos, pos + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
            });

            // La imagen dentro es JPEG y su largo declarado es el real.
            const largo = Number(/\/Length (\d+) >>\nstream\n/.exec(texto)?.[1]);
            const inicioImagen = texto.indexOf('stream\n') + 'stream\n'.length;
            expect(bytes.subarray(inicioImagen, inicioImagen + 2).toString('hex')).toBe('ffd8');
            expect(bytes.subarray(inicioImagen + largo - 2, inicioImagen + largo).toString('hex')).toBe('ffd9');
        } catch (error) {
            await captureEvidence(testInfo, page, 'HORARIO-02', 'Descargar PDF', error);
            throw error;
        }
    });
});
