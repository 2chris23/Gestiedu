import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies, captureEvidence } from './helpers';

/**
 * «HOY» LO DICE EL LICEO, NO EL RELOJ DEL TELÉFONO
 *
 * Una queja clásica (Canvas, Infinite Campus): la asistencia o la entrega caen
 * en el día equivocado por la zona horaria del aparato. Aquí la regla está
 * escrita (`CLAUDE.md`: en la web, `useSchoolToday`, nunca `new Date()` a
 * secas), pero el horario del alumno elegía el día con el reloj del aparato:
 * un teléfono con la fecha adelantada, o con otra zona horaria, enseñaba como
 * «Hoy» las clases de otro día.
 *
 *   RELOJ-01  con el reloj del aparato un día y medio adelantado, el horario
 *             del alumno enseña como «Hoy» el día del liceo.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

test.describe('El reloj del aparato no manda', () => {
    test('RELOJ-01: el horario del alumno enseña como «Hoy» el día del liceo', async ({ browser }, testInfo) => {
        const alumno = await loginApi('est0575@testing.edu.ve', '123456');
        const r = await axios.get(`${API_BASE}/time`, {
            headers: { Authorization: `Bearer ${alumno.accessToken}`, 'X-Institute-Slug': TENANT_SLUG },
        });
        const hoy: string = r.data?.date ?? r.data?.data?.date;
        const ahora = Date.parse(r.data?.now ?? r.data?.data?.now);
        const diaDelLiceo = new Date(`${hoy}T12:00:00Z`).getUTCDay();
        const esperado =
            diaDelLiceo === 0 || diaDelLiceo === 6 ? /Próximo día: lunes/i : new RegExp(`Hoy, ${DIAS[diaDelLiceo]}`, 'i');

        const contexto = await browser.newContext();
        const page = await contexto.newPage();
        try {
            // El aparato va 36 horas adelantado: siempre es otro día de la semana.
            await page.clock.install({ time: ahora + 36 * 3600 * 1000 });
            await injectSessionCookies(page, alumno);
            await page.goto(`${WEB_BASE}/dashboard`);
            await expect(page.getByText('Horario en Vivo').first()).toBeVisible({ timeout: 30000 });
            await expect(page.getByText(esperado).first()).toBeVisible({ timeout: 15000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'RELOJ-01', 'Hoy es el día del liceo', error);
            throw error;
        } finally {
            await contexto.close();
        }
    });
});
