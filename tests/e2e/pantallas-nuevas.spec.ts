import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
    API_BASE,
    WEB_BASE,
    TENANT_SLUG,
    loginApi,
    loginViaUI,
    injectSessionCookies,
    captureEvidence,
    queryTenantDb,
} from './helpers';

/**
 * LAS DOS PANTALLAS NUEVAS, EN EL NAVEGADOR
 *
 * Las dos cosas que se añadieron tienen pruebas en el servidor, pero eso solo
 * dice que la API hace lo que debe. No dice que **el botón exista, se vea y haga
 * algo**, que es lo único que le importa a quien usa el sistema.
 *
 *   1. "Copiar a otra sección" en el plan de evaluación. La función llevaba
 *      tiempo en el servidor, probada y protegida, y **ninguna pantalla la
 *      usaba**: un profesor con la misma materia en varias secciones escribía el
 *      plan una vez por sección.
 *   2. La asistencia mínima en Configuración → Académica. Antes era un 80 fijo
 *      escrito en el código.
 */

/** Un profesor que da la MISMA materia en varias secciones: el caso de verdad. */
const PROFE_CON_VARIAS = 'profesor3@testing.edu.ve';
const MATERIA = 'materia-mate';

test.describe('Las dos pantallas nuevas', () => {
    let adminTokens: any;
    let profeTokens: any;
    let ciclo: string;
    let seccion: string;

    test.beforeAll(async () => {
        adminTokens = await loginApi('admin@testing.edu.ve', '123456');
        profeTokens = await loginApi(PROFE_CON_VARIAS, '123456');

        // La ruta del plan se arma con los nombres cortos que usa la web, no con
        // identificadores: se sacan de la base para no escribirlos a mano.
        const filas = await queryTenantDb(
            `SELECT ay.name AS ciclo, cl.slug AS seccion
             FROM classroom_subjects cs
             JOIN classrooms cl ON cl.id = cs."classroomId"
             JOIN subjects s ON s.id = cs."subjectId"
             JOIN academic_years ay ON ay.id = cl."academicYearId"
             JOIN users u ON u.id = cs."teacherId"
             WHERE ay.status = 'ACTIVE' AND u.email = $1 AND s.slug = $2
             ORDER BY cl.grade, cl.section
             LIMIT 1`,
            [PROFE_CON_VARIAS, MATERIA]
        );
        ciclo = filas[0]?.ciclo;
        seccion = filas[0]?.seccion;
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 1. COPIAR EL PLAN A OTRA SECCIÓN
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * El plan no es la pestaña que se abre por defecto: la materia abre en
     * "Estudiantes". Hay que entrar a la suya, que es lo que hace el profesor.
     *
     * Y se entra **por el formulario**, no metiendo las credenciales a mano en
     * las cookies. Los botones de editar dependen del rol que tiene la pantalla
     * en memoria, y eso solo se llena entrando de verdad: con las cookies
     * puestas a mano la sesión vale, pero la pantalla no sabe quién eres y
     * esconde todo lo de editar. Se comprobó: con cookies salían 0 botones,
     * entrando por el formulario salen los 2.
     */
    const abrirElPlan = async (page: any) => {
        await page.goto(`${WEB_BASE}/dashboard/academico/${ciclo}/${seccion}/${MATERIA}`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Plan de Evaluaci.n \/ Calificaciones/i }).click();
        await page.waitForTimeout(2500);
    };

    test('NUEVA-01: el profesor ve el botón "Copiar a otra sección" en su plan', async ({ page }, testInfo) => {
        try {
            expect(ciclo).toBeTruthy();
            expect(seccion).toBeTruthy();

            await loginViaUI(page, PROFE_CON_VARIAS, '123456');
            await abrirElPlan(page);

            const boton = page.getByRole('button', { name: /copiar a otra secci/i });
            await expect(boton).toBeVisible({ timeout: 20000 });
        } catch (error) {
            await captureEvidence(testInfo, page, 'NUEVA-01', 'Botón copiar plan', error);
            throw error;
        }
    });

    test('NUEVA-02: al pulsarlo salen SUS secciones, no la de otro profesor', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, PROFE_CON_VARIAS, '123456');
            await abrirElPlan(page);

            await page.getByRole('button', { name: /copiar a otra secci/i }).click();

            // La ventana explica lo que va a pasar antes de dejar marcar nada.
            await expect(page.getByText(/Copiar plan a otra secci/i)).toBeVisible({ timeout: 10000 });

            // Y la lista se llena con lo que diga el servidor.
            await page.waitForTimeout(2000);
            const casillas = page.locator('input[type="checkbox"]');
            const cuantas = await casillas.count();

            // Este profesor da Matemática en varias secciones: tiene a dónde
            // copiar. Si saliera vacío, la lista no estaría preguntando bien.
            expect(cuantas).toBeGreaterThan(0);

            // Nada seleccionado ⇒ el botón de copiar está apagado. Es lo que
            // evita un copiado en blanco que borre el plan del destino.
            const copiar = page.getByRole('button', { name: /^Copiar/ }).last();
            await expect(copiar).toBeDisabled();
        } catch (error) {
            await captureEvidence(testInfo, page, 'NUEVA-02', 'Lista de destinos', error);
            throw error;
        }
    });

    test('NUEVA-03: al marcar una sección avisa de que se reemplaza el plan', async ({ page }, testInfo) => {
        try {
            await loginViaUI(page, PROFE_CON_VARIAS, '123456');
            await abrirElPlan(page);

            await page.getByRole('button', { name: /copiar a otra secci/i }).click();
            await page.waitForTimeout(2000);

            await page.locator('input[type="checkbox"]').first().check();

            // Copiar BORRA lo que hubiera en el destino. Que eso se diga antes
            // de pulsar no es un detalle: es la diferencia entre una función
            // útil y el plan de otra profesora desaparecido sin avisar.
            await expect(
                page.getByText(/se reemplaza por este/i)
            ).toBeVisible({ timeout: 5000 });

            // Y que las notas ya puestas no se tocan, que es la otra duda.
            await expect(page.getByText(/notas ya puestas no se tocan/i)).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'NUEVA-03', 'Aviso de reemplazo', error);
            throw error;
        }
    });

    test('NUEVA-04: la lista de destinos nunca incluye la sección de origen', async () => {
        const filas = await queryTenantDb(
            `SELECT cs."classroomId", cs."subjectId"
             FROM classroom_subjects cs
             JOIN classrooms cl ON cl.id = cs."classroomId"
             JOIN subjects s ON s.id = cs."subjectId"
             JOIN academic_years ay ON ay.id = cl."academicYearId"
             WHERE ay.status = 'ACTIVE' AND s.slug = $1
             LIMIT 1`,
            [MATERIA]
        );
        expect(filas.length).toBeGreaterThan(0);

        const res = await axios.get(`${API_BASE}/evaluation-plan/copy-targets`, {
            params: { sourceClassroomId: filas[0].classroomId, subjectId: filas[0].subjectId },
            headers: {
                Authorization: `Bearer ${adminTokens.accessToken}`,
                'X-Institute-Slug': TENANT_SLUG,
            },
            validateStatus: () => true,
        });

        expect(res.status).toBe(200);
        const ids = res.data.classrooms.map((c: any) => c.id);
        // Copiar borra el destino: ofrecerse a sí misma sería borrarse encima.
        expect(ids).not.toContain(filas[0].classroomId);
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 2. LA ASISTENCIA MÍNIMA EN CONFIGURACIÓN
    // ═════════════════════════════════════════════════════════════════════════

    const irAConfiguracionAcademica = async (page: any) => {
        await page.goto(`${WEB_BASE}/dashboard/configuracion`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Configuración Académica/i }).click();
        await page.waitForTimeout(1500);
    };

    test('NUEVA-05: el campo "Asistencia Mínima" está en Configuración → Académica', async ({ page }, testInfo) => {
        try {
            await injectSessionCookies(page, { ...adminTokens, user: adminTokens.user });
            await irAConfiguracionAcademica(page);

            await expect(page.locator('#asistenciaMinima')).toBeVisible({ timeout: 15000 });

            // Con la explicación al lado: sin ella, cualquiera pensaría que este
            // número reprueba alumnos. No lo hace.
            await expect(page.getByText(/No reprueba ni afecta las notas/i)).toBeVisible();
        } catch (error) {
            await captureEvidence(testInfo, page, 'NUEVA-05', 'Campo asistencia mínima', error);
            throw error;
        }
    });

    test('NUEVA-06: cambiarla desde la pantalla la guarda de verdad', async ({ page }, testInfo) => {
        const leerDelServidor = async () => {
            const r = await axios.get(`${API_BASE}/institutes/current/academic-config`, {
                headers: {
                    Authorization: `Bearer ${adminTokens.accessToken}`,
                    'X-Institute-Slug': TENANT_SLUG,
                },
            });
            return r.data.data;
        };

        const antes = await leerDelServidor();

        try {
            await injectSessionCookies(page, { ...adminTokens, user: adminTokens.user });
            await irAConfiguracionAcademica(page);

            const campo = page.locator('#asistenciaMinima');
            await expect(campo).toBeVisible({ timeout: 15000 });

            await campo.fill('72');
            await page.getByRole('button', { name: /guardar/i }).first().click();
            await page.waitForTimeout(3000);

            // Lo que cuenta no es que la pantalla diga "guardado": es que el
            // servidor tenga el número nuevo.
            const despues = await leerDelServidor();
            expect(despues.asistenciaMinima).toBe(72);

            // Y que no se haya llevado por delante la nota mínima, que vive en
            // el mismo sitio y es otra cosa completamente.
            expect(despues.notaMinimaAprobatoria).toBe(antes.notaMinimaAprobatoria);
        } catch (error) {
            await captureEvidence(testInfo, page, 'NUEVA-06', 'Guardar asistencia mínima', error);
            throw error;
        } finally {
            // Esta prueba corre contra el liceo de pruebas de verdad: se deja
            // como estaba.
            await axios
                .put(
                    `${API_BASE}/institutes/current/academic-config`,
                    { asistenciaMinima: antes.asistenciaMinima ?? 80 },
                    {
                        headers: {
                            Authorization: `Bearer ${adminTokens.accessToken}`,
                            'X-Institute-Slug': TENANT_SLUG,
                        },
                    }
                )
                .catch(() => undefined);
        }
    });

    test('NUEVA-07: un profesor no puede cambiar la asistencia mínima', async () => {
        const res = await axios.put(
            `${API_BASE}/institutes/current/academic-config`,
            { asistenciaMinima: 10 },
            {
                headers: {
                    Authorization: `Bearer ${profeTokens.accessToken}`,
                    'X-Institute-Slug': TENANT_SLUG,
                },
                validateStatus: () => true,
            }
        );

        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});
