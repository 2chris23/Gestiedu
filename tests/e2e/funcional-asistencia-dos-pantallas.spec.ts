import { test, expect, Page } from '@playwright/test';
import axios from 'axios';
import { API_BASE, WEB_BASE, TENANT_SLUG, loginApi, injectSessionCookies, captureEvidence, queryTenantDb } from './helpers';

/**
 * DOS PANTALLAS PASANDO LISTA EN LA MISMA CLASE
 *
 * Una de las quejas más repetidas de los sistemas escolares: dos personas
 * editan lo mismo y lo de una borra lo de la otra sin avisar. Aquí: el
 * profesor pasa lista desde el teléfono y la coordinadora corrige desde el
 * ordenador; o el mismo profesor tiene la clase abierta en el teléfono y en el
 * portátil.
 *
 * La clase en vivo se guarda sola, y cada guardado mandaba la asistencia de
 * TODOS los alumnos con lo que tenía esa pantalla. Si la otra pantalla no se
 * había enterado todavía del cambio (el tiempo real tarda, o no llega con mala
 * señal), el primer ausente volvía a «presente» sin que nadie lo tocara.
 *
 *   ASIS-DOS-01  lo que marca una pantalla no lo deshace la otra al guardar lo suyo.
 */

async function diaDelLiceo(token: string): Promise<string> {
    const r = await axios.get(`${API_BASE}/time`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Institute-Slug': TENANT_SLUG },
    });
    return r.data?.date ?? r.data?.data?.date;
}

async function abrirClase(page: Page, url: string) {
    await page.goto(url);
    await page.getByRole('button', { name: /Pasar asistencia/i }).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /Pasar asistencia/i }).first().click();
}

async function marcar(page: Page, nombre: string, estado: 'Ausente' | 'Tardanza' | 'Presente') {
    const grupo = page.getByRole('group', { name: `Asistencia de ${nombre}` });
    await grupo.getByRole('button', { name: estado }).click();
    await expect(grupo.getByRole('button', { name: estado })).toHaveAttribute('aria-pressed', 'true');
}

async function esperarGuardado(page: Page) {
    await expect(page.getByText(/Guardado \d/).first()).toBeVisible({ timeout: 15000 });
}

test.describe('Asistencia desde dos pantallas', () => {
    test('ASIS-DOS-01: lo que marca una pantalla no lo deshace la otra', async ({ browser }, testInfo) => {
        const profe = await loginApi('profesor.ciencias@tuapp.com', '123456');
        const admin = await loginApi('admin@testing.edu.ve', '123456');
        const hoy = await diaDelLiceo(profe.accessToken);

        // Una clase del profesor en 1er Año A, con dos alumnos.
        const [clase] = await queryTenantDb(
            `SELECT cs."classroomId", cs."subjectId"
               FROM classroom_subjects cs
               JOIN users u ON u.id = cs."teacherId"
               JOIN classrooms c ON c.id = cs."classroomId"
              WHERE u.email = 'profesor.ciencias@tuapp.com' AND c.grade = 1 AND c.section = 'A'
              LIMIT 1`
        );
        expect(clase, 'el profesor de ciencias no da clase en 1er Año A').toBeTruthy();
        const alumnos = await queryTenantDb(
            `SELECT u.id, u."firstName", u."lastName"
               FROM student_classrooms sc JOIN users u ON u.id = sc."studentId"
              WHERE sc."classroomId" = $1 AND sc."isActive" AND u."isActive"
              ORDER BY u."lastName", u."firstName" LIMIT 2`,
            [clase.classroomId]
        );
        const [x, y] = alumnos;
        // Sin asistencia de hoy para ellos: los dos salen «Presente» por defecto.
        await queryTenantDb(`DELETE FROM daily_attendance WHERE "studentId" = ANY($1) AND date = $2::date`, [[x.id, y.id], hoy]);

        const url = `${WEB_BASE}/dashboard/clase-en-vivo/${clase.classroomId}/${clase.subjectId}?date=${hoy}`;
        const ctxA = await browser.newContext();
        const ctxB = await browser.newContext();
        const a = await ctxA.newPage();
        const b = await ctxB.newPage();
        try {
            await injectSessionCookies(a, profe);
            await injectSessionCookies(b, admin);
            // La pantalla B no recibe el tiempo real (mala señal, un proxy…):
            // es cuando se ve el fallo sin depender de quién llega antes.
            await b.route('**/socket.io/**', (r) => r.abort());

            await abrirClase(a, url);
            await abrirClase(b, url);

            // A marca a X ausente y se guarda.
            await marcar(a, `${x.firstName} ${x.lastName}`, 'Ausente');
            await esperarGuardado(a);
            const [trasA] = await queryTenantDb(`SELECT status FROM daily_attendance WHERE "studentId" = $1 AND date = $2::date`, [x.id, hoy]);
            expect(trasA?.status).toBe('ABSENT');

            // B, que no se ha enterado, marca a Y con tardanza y se guarda.
            await marcar(b, `${y.firstName} ${y.lastName}`, 'Tardanza');
            await esperarGuardado(b);

            const filas = await queryTenantDb(
                `SELECT "studentId", status FROM daily_attendance WHERE "studentId" = ANY($1) AND date = $2::date`,
                [[x.id, y.id], hoy]
            );
            const de = (id: string) => filas.find((f: any) => f.studentId === id)?.status;
            expect(de(y.id)).toBe('LATE');
            // Lo de A sigue ahí.
            expect(de(x.id)).toBe('ABSENT');
        } catch (error) {
            await captureEvidence(testInfo, b, 'ASIS-DOS-01', 'Dos pantallas pasando lista', error);
            throw error;
        } finally {
            await ctxA.close();
            await ctxB.close();
        }
    });
});
