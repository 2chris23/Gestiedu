import { test, expect, chromium, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import QRCode from 'qrcode';
import { API_BASE, TENANT_SLUG, WEB_BASE, loginApi, loginViaUI, captureEvidence, queryTenantDb } from './helpers';

/**
 * LA ASISTENCIA POR QR, EN UN NAVEGADOR DE VERDAD
 *
 * El servidor se prueba en `apps/backend/tests/integration/asistencia-por-qr.test.ts`
 * (cada trampa). Aquí, lo que solo se ve en la pantalla:
 *
 *   QRE-01  el alumno abre su clase, pulsa «Escanear asistencia», la CÁMARA lee
 *           el QR del profesor y queda presente. La cámara es de mentira pero
 *           el camino es el de verdad: Chrome le da a la página un vídeo con el
 *           QR dibujado (`--use-file-for-fake-video-capture`), y la página lo
 *           tiene que leer fotograma a fotograma, como con una cámara.
 *   QRE-02  el profesor abre el QR en su clase, el alumno escanea y su nombre
 *           aparece en la pantalla del profesor sin recargar. Se hace sobre
 *           AYER (una corrección): cerrar el pase de hoy dejaría ausente a
 *           toda la sección de la base de pruebas.
 */

const ADMIN = 'admin@testing.edu.ve';
const CLAVE = '123456';
const AULA = { latitude: 10.5, longitude: -66.9 };

/** Un vídeo Y4M (el formato que Chrome acepta como cámara) con el QR en el centro. */
function videoConElQr(texto: string, archivo: string) {
    const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const W = 640;
    const H = 480;
    const modulo = Math.floor(400 / (n + 8));
    const lado = modulo * (n + 8);
    const x0 = Math.floor((W - lado) / 2);
    const y0 = Math.floor((H - lado) / 2);
    const Y = Buffer.alloc(W * H, 235);
    for (let fila = 0; fila < n; fila++) {
        for (let col = 0; col < n; col++) {
            if (!qr.modules.get(fila, col)) continue;
            for (let dy = 0; dy < modulo; dy++) {
                const y = y0 + (fila + 4) * modulo + dy;
                Y.fill(16, y * W + x0 + (col + 4) * modulo, y * W + x0 + (col + 5) * modulo);
            }
        }
    }
    const UV = Buffer.alloc((W / 2) * (H / 2), 128);
    const trozos: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
    for (let f = 0; f < 10; f++) trozos.push(Buffer.from('FRAME\n'), Y, UV, UV);
    fs.writeFileSync(archivo, Buffer.concat(trozos));
}

const conSesion = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG, 'Content-Type': 'application/json' });

test.describe('Asistencia por QR', () => {
    let clase: { classroom_id: string; subject_id: string; alumno_email: string; alumno_id: string; alumno_nombre: string };
    let tokenAdmin: string;

    test.beforeAll(async () => {
        [clase] = await queryTenantDb(
            `SELECT cs."classroomId" AS classroom_id, cs."subjectId" AS subject_id,
                    u.email AS alumno_email, u.id AS alumno_id, u."firstName" || ' ' || u."lastName" AS alumno_nombre
               FROM classroom_subjects cs
               JOIN classrooms c ON c.id = cs."classroomId"
               JOIN academic_years ay ON ay.id = c."academicYearId" AND ay.status = 'ACTIVE'
               JOIN student_classrooms sc ON sc."classroomId" = cs."classroomId" AND sc."isActive" = true
               JOIN users u ON u.id = sc."studentId" AND u."isActive" = true
               JOIN schedule_blocks b ON b."classroomId" = c.id AND b."blockType" = 'CLASS'
              LIMIT 1`
        );
        expect(clase, 'hace falta un alumno con horario').toBeTruthy();
        tokenAdmin = (await loginApi(ADMIN, CLAVE)).accessToken;
        // Que el alumno pueda estrenar teléfono y que no quede nada abierto de otra tanda.
        await queryTenantDb(`DELETE FROM aparatos_de_alumnos WHERE "studentId" = $1`, [clase.alumno_id]);
        await queryTenantDb(`UPDATE pases_de_lista SET "cerradoEn" = now() WHERE "cerradoEn" IS NULL`);
    });

    const abrirPase = async () => {
        const res = await fetch(`${API_BASE}/asistencia-qr/pases`, {
            method: 'POST',
            headers: conSesion(tokenAdmin),
            body: JSON.stringify({ classroomId: clase.classroom_id, subjectId: clase.subject_id, ubicacion: { lat: AULA.latitude, lng: AULA.longitude, precision: 10 } }),
        });
        expect(res.status).toBe(201);
        return (await res.json()).data;
    };
    const verPase = async (id: string) =>
        (await (await fetch(`${API_BASE}/asistencia-qr/pases/${id}`, { headers: conSesion(tokenAdmin) })).json()).data;

    test('QRE-01: el alumno escanea el QR del profesor con la cámara y queda presente', async ({}, testInfo) => {
        const video = path.join(os.tmpdir(), `qr-de-prueba-${Date.now()}.y4m`);
        videoConElQr('esperando', video);
        let navegador: Browser | null = null;
        const page = await (async () => {
            navegador = await chromium.launch({
                args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
            });
            const contexto = await navegador.newContext({
                viewport: { width: 412, height: 860 },
                isMobile: true,
                hasTouch: true,
                permissions: ['camera', 'geolocation'],
                geolocation: { latitude: AULA.latitude + 0.0002, longitude: AULA.longitude, accuracy: 15 },
            });
            return contexto.newPage();
        })();
        try {
            await loginViaUI(page, clase.alumno_email, CLAVE);
            await page.goto(`${WEB_BASE}/dashboard`);
            const bloque = page.locator('h4', { hasText: /\S/ }).first();
            await expect(bloque).toBeVisible({ timeout: 30000 });
            await bloque.click();
            const boton = page.getByRole('button', { name: 'Escanear asistencia' });
            await expect(boton).toBeVisible({ timeout: 15000 });

            // Ahora sí: el profesor abre el QR, y ese QR es lo que ve la cámara.
            const pase = await abrirPase();
            videoConElQr(pase.codigo, video);
            await boton.click();

            await expect(page.getByText(/¡Listo, estás presente!|Registrado, como tarde|Ya estabas registrado/)).toBeVisible({ timeout: 20000 });
            await page.screenshot({ path: 'test-results/evidencia/qr-alumno-presente.png' });

            const vista = await verPase(pase.pase.id);
            expect(vista.registros.some((r: any) => r.studentId === clase.alumno_id && r.estado === 'ACEPTADO')).toBe(true);
        } catch (error) {
            await captureEvidence(testInfo, page, 'QRE-01', 'El alumno escanea con la cámara', error);
            throw error;
        } finally {
            await (navegador as Browser | null)?.close();
            fs.rmSync(video, { force: true });
            await queryTenantDb(`UPDATE pases_de_lista SET "cerradoEn" = now() WHERE "cerradoEn" IS NULL`);
        }
    });

    test('QRE-02: el profesor ve entrar al alumno en vivo, y antes de cerrar, quién falta', async ({ page, context }, testInfo) => {
        try {
            await context.grantPermissions(['geolocation']);
            await context.setGeolocation(AULA);
            await queryTenantDb(`DELETE FROM aparatos_de_alumnos WHERE "studentId" = $1`, [clase.alumno_id]);
            await queryTenantDb(
                `DELETE FROM registros_asistencia_qr WHERE "paseId" IN (SELECT id FROM pases_de_lista WHERE "classroomId" = $1 AND "subjectId" = $2)`,
                [clase.classroom_id, clase.subject_id]
            );
            await queryTenantDb(`DELETE FROM pases_de_lista WHERE "classroomId" = $1 AND "subjectId" = $2`, [clase.classroom_id, clase.subject_id]);

            const hoy = (await (await fetch(`${API_BASE}/time`, { headers: conSesion(tokenAdmin) })).json()).date as string;
            const d = new Date(`${hoy}T12:00:00Z`);
            d.setUTCDate(d.getUTCDate() - 1);
            const ayer = d.toISOString().slice(0, 10);

            await loginViaUI(page, ADMIN, CLAVE);
            await page.goto(`${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroom_id}/${clase.subject_id}?date=${ayer}`);
            await page.getByRole('button', { name: /Corregir con QR/ }).click();

            const pantalla = page.getByRole('dialog', { name: 'Pase de lista por QR' });
            await expect(pantalla.getByRole('img', { name: /Código del pase de lista/ })).toBeVisible({ timeout: 20000 });
            await expect(pantalla.getByText(/^0 de \d+$/)).toBeVisible();

            // El alumno escanea (desde su teléfono: aquí, por la API).
            const pase = (
                await queryTenantDb(`SELECT id FROM pases_de_lista WHERE "classroomId" = $1 AND "cerradoEn" IS NULL ORDER BY "abiertoEn" DESC LIMIT 1`, [clase.classroom_id])
            )[0];
            const vista = await verPase(pase.id);
            const alumno = await loginApi(clase.alumno_email, CLAVE);
            const res = await fetch(`${API_BASE}/asistencia-qr/escanear`, {
                method: 'POST',
                headers: conSesion(alumno.accessToken),
                body: JSON.stringify({
                    codigo: vista.codigo,
                    aparato: { id: `web:prueba-qre-02-${Date.now()}`, descripcion: 'Prueba' },
                    ubicacion: { lat: AULA.latitude + 0.0001, lng: AULA.longitude, precision: 10 },
                }),
            });
            expect(res.status).toBe(200);

            // Sin recargar: el aviso llega por el tiempo real.
            await expect(pantalla.getByText(clase.alumno_nombre).first()).toBeVisible({ timeout: 10000 });
            await expect(pantalla.getByText(/^1 de \d+$/)).toBeVisible();
            await page.screenshot({ path: 'test-results/evidencia/qr-profesor-en-vivo.png' });

            await expect(pantalla.getByText(/Corrección del/)).toBeVisible();

            // Terminar: antes de cerrar se dice qué pasa con los demás.
            await pantalla.getByRole('button', { name: 'Terminar', exact: true }).click();
            await expect(pantalla.getByText(/Es una corrección/)).toBeVisible();
            await pantalla.getByRole('button', { name: 'Cerrar el pase' }).click();
            await expect(pantalla).toBeHidden({ timeout: 15000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'QRE-02', 'El profesor ve la lista en vivo', error);
            throw error;
        } finally {
            await queryTenantDb(`UPDATE pases_de_lista SET "cerradoEn" = now() WHERE "cerradoEn" IS NULL`);
        }
    });
});
