import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
    API_BASE,
    WEB_BASE,
    TENANT_SLUG,
    loginApi,
    injectSessionCookies,
    captureEvidence,
    queryTenantDb,
} from './helpers';

/**
 * LO QUE OTRO CAMBIA, SE VE SIN RECARGAR
 *
 * Dos personas con la pantalla abierta. Una guarda algo, la otra tiene que verlo
 * aparecer sola, sin tocar nada.
 *
 * Se prueba con dos navegadores de verdad (dos contextos distintos), no
 * simulando el aviso: si el camino completo —servidor avisa, navegador escucha,
 * pantalla vuelve a pedir— se rompe por cualquier tramo, esta prueba se cae.
 */

const ESPERA_MAXIMA = 15000;

/**
 * El día lo dice el SERVIDOR, no el reloj de esta máquina.
 *
 * `new Date().toISOString()` da la fecha en UTC. En Caracas (UTC-4), a partir de
 * las 20:00 eso ya es el día siguiente, y el servidor rechaza la fecha por futura
 * — con razón. Es la misma trampa de zona horaria que ya mordió en el sistema.
 */
async function diaDelLiceo(accessToken: string): Promise<string> {
    const r = await axios.get(`${API_BASE}/time`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Institute-Slug': TENANT_SLUG },
    });
    return r.data?.date ?? r.data?.data?.date;
}

test.describe('Tiempo real', () => {
    test('TR-01: una materia creada por otro aparece sin recargar', async ({ browser }, testInfo) => {
        const sesion = await loginApi('admin@testing.edu.ve', '123456');

        // Persona 1: mirando la pantalla de materias
        const contexto = await browser.newContext();
        const page = await contexto.newPage();

        const nombre = `Materia Tiempo Real ${Date.now()}`;
        let creadaId: string | null = null;

        try {
            await injectSessionCookies(page, sesion);
            await page.goto(`${WEB_BASE}/dashboard/materias`);
            await page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });

            // Todavía no existe
            await expect(page.getByText(nombre)).toHaveCount(0);

            // Persona 2 (otro dispositivo) la crea por la API, sin tocar esta pantalla
            const creada = await axios.post(
                `${API_BASE}/subjects`,
                {
                    name: nombre,
                    code: `TR${String(Date.now()).slice(-6)}`,
                    description: 'Creada desde otro dispositivo',
                },
                {
                    headers: {
                        Authorization: `Bearer ${sesion.accessToken}`,
                        'X-Institute-Slug': TENANT_SLUG,
                    },
                }
            );
            creadaId = creada.data?.subject?.id ?? creada.data?.data?.id ?? creada.data?.id ?? null;

            // Y aparece sola: ni un clic, ni una recarga
            await expect(page.getByText(nombre).first()).toBeVisible({ timeout: ESPERA_MAXIMA });
        } catch (error) {
            await captureEvidence(testInfo, page, 'TR-01', 'La materia nueva aparece sola', error);
            throw error;
        } finally {
            if (creadaId) {
                await axios
                    .delete(`${API_BASE}/subjects/${creadaId}`, {
                        headers: {
                            Authorization: `Bearer ${sesion.accessToken}`,
                            'X-Institute-Slug': TENANT_SLUG,
                        },
                    })
                    .catch(() => undefined);
            }
            await contexto.close();
        }
    });

    test('TR-03: los medidores de la sección se mueven solos', async ({ browser }, testInfo) => {
        // Este es el caso que se reportó: se guarda algo y los medidores de la
        // pantalla (promedio, observaciones, asistencia…) se quedaban con el
        // número viejo hasta recargar.
        const sesion = await loginApi('admin@testing.edu.ve', '123456');

        const [fila] = await queryTenantDb<{
            classroom_id: string;
            slug: string;
            year_id: string;
            subject_id: string;
            teacher_email: string;
        }>(`
            SELECT cl.id AS classroom_id, cl.slug, cl."academicYearId" AS year_id,
                   s.id AS subject_id, u.email AS teacher_email
            FROM classrooms cl
            JOIN classroom_subjects cs ON cs."classroomId" = cl.id
            JOIN subjects s ON s.id = cs."subjectId"
            JOIN users u ON u.id = cs."teacherId"
            JOIN student_classrooms sc ON sc."classroomId" = cl.id AND sc."isActive" = true
            LIMIT 1`);
        expect(fila, 'hace falta una sección con materia, profesor y alumnos').toBeTruthy();

        const [alumno] = await queryTenantDb<{ studentId: string }>(
            `SELECT "studentId" FROM student_classrooms WHERE "classroomId" = $1 AND "isActive" = true LIMIT 1`,
            [fila.classroom_id]
        );

        const contexto = await browser.newContext();
        const page = await contexto.newPage();

        try {
            await injectSessionCookies(page, sesion);
            await page.goto(
                `${WEB_BASE}/dashboard/academico/${fila.year_id}/secciones/${fila.slug}/${fila.subject_id}`
            );
            await page.getByText('OBSERVACIONES').first().waitFor({ state: 'visible', timeout: 30000 });

            const leerObservaciones = async () => {
                const texto = await page.locator('main').first().innerText();
                const m = texto.match(/OBSERVACIONES\s*\n?\s*(\d+)/);
                return m ? Number(m[1]) : NaN;
            };

            const antes = await leerObservaciones();
            expect(Number.isNaN(antes)).toBe(false);

            // El profesor de esa materia deja una observación desde otro sitio
            const profe = await loginApi(fila.teacher_email, '123456');
            const hoy = await diaDelLiceo(profe.accessToken);
            await axios.post(
                `${API_BASE}/observations`,
                {
                    title: `Medidor en vivo ${Date.now()}`,
                    description: 'Debe subir el contador sin recargar',
                    type: 'OBSERVACION',
                    date: hoy,
                    studentIds: [alumno.studentId],
                    classroomId: fila.classroom_id,
                    subjectId: fila.subject_id,
                },
                {
                    headers: {
                        Authorization: `Bearer ${profe.accessToken}`,
                        'X-Institute-Slug': TENANT_SLUG,
                    },
                }
            );

            // Sin tocar nada: el número sube solo
            await expect
                .poll(leerObservaciones, { timeout: ESPERA_MAXIMA, intervals: [500, 500, 1000] })
                .toBeGreaterThan(antes);
        } catch (error) {
            await captureEvidence(testInfo, page, 'TR-03', 'Los medidores se mueven solos', error);
            throw error;
        } finally {
            await contexto.close();
        }
    });

    test('TR-04: el profesor pone la nota y el estudiante la ve sin recargar', async ({ browser }, testInfo) => {
        // El caso tal cual se pidió: el estudiante NO tiene que recargar nada.
        // Todo de una vez: sección + materia + profesor + actividad + un alumno que
        // TODAVÍA no tenga nota en esa actividad. Buscarlo por partes falla cuando
        // la actividad que sale primero ya está calificada entera.
        const [clase] = await queryTenantDb<{
            classroom_id: string;
            subject_id: string;
            teacher_email: string;
            activity_id: string;
            period_id: string;
            max_grade: string;
            student_id: string;
            student_email: string;
        }>(`
            SELECT cl.id AS classroom_id, s.id AS subject_id, u.email AS teacher_email,
                   a.id AS activity_id, a."periodId" AS period_id, a."maxGrade" AS max_grade,
                   al.id AS student_id, al.email AS student_email
            FROM classrooms cl
            JOIN classroom_subjects cs ON cs."classroomId" = cl.id
            JOIN subjects s ON s.id = cs."subjectId"
            JOIN users u ON u.id = cs."teacherId"
            JOIN activities a ON a."classroomId" = cl.id AND a."subjectId" = s.id
            JOIN student_classrooms sc ON sc."classroomId" = cl.id AND sc."isActive" = true
            JOIN users al ON al.id = sc."studentId"
            WHERE a.id LIKE 'c%'
              AND a."periodId" IS NOT NULL
              AND NOT EXISTS (
                    SELECT 1 FROM grades g
                     WHERE g."studentId" = al.id AND g."activityId" = a.id
              )
            LIMIT 1`);
        expect(clase, 'hace falta una actividad con algún alumno sin calificar').toBeTruthy();

        const alumno = { id: clase.student_id, email: clase.student_email };
        const contexto = await browser.newContext();
        const page = await contexto.newPage();
        let notaId: string | null = null;

        try {
            // El estudiante, con SU pantalla de notas abierta
            const sesionAlumno = await loginApi(alumno.email, '123456');
            await injectSessionCookies(page, sesionAlumno);
            await page.goto(`${WEB_BASE}/dashboard`);
            await page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });

            const contarNotas = async () => {
                const r = await axios.get(`${API_BASE}/students/my-grades`, {
                    headers: {
                        Authorization: `Bearer ${sesionAlumno.accessToken}`,
                        'X-Institute-Slug': TENANT_SLUG,
                    },
                });
                const d: any = r.data;
                const lista = Array.isArray(d) ? d : d?.data ?? d?.grades ?? [];
                return Array.isArray(lista) ? lista.length : 0;
            };
            const antes = await contarNotas();

            // Cuántas peticiones lleva hechas la pantalla del estudiante
            const llamadasHechas = () =>
                page.evaluate(() =>
                    performance
                        .getEntriesByType('resource')
                        .filter((r) => r.name.includes('/api/')).length
                );
            const llamadasAntes = await llamadasHechas();

            // El PROFESOR pone la nota, desde otro sitio
            const profe = await loginApi(clase.teacher_email, '123456');
            const nota = await axios.post(
                `${API_BASE}/grades`,
                {
                    score: Math.min(Number(clase.max_grade) || 20, 18),
                    studentId: alumno.id,
                    activityId: clase.activity_id,
                    periodId: clase.period_id,
                    subjectId: clase.subject_id,
                },
                {
                    headers: {
                        Authorization: `Bearer ${profe.accessToken}`,
                        'X-Institute-Slug': TENANT_SLUG,
                    },
                }
            );
            notaId = nota.data?.grade?.id ?? nota.data?.data?.id ?? nota.data?.id ?? null;

            // La pantalla del estudiante vuelve a pedir sus datos SOLA
            await expect
                .poll(llamadasHechas, { timeout: ESPERA_MAXIMA, intervals: [400, 400, 800] })
                .toBeGreaterThan(llamadasAntes);

            // Y la nota nueva está en lo suyo
            expect(await contarNotas()).toBeGreaterThan(antes);
        } catch (error) {
            await captureEvidence(testInfo, page, 'TR-04', 'El estudiante ve la nota sin recargar', error);
            throw error;
        } finally {
            if (notaId) {
                const admin = await loginApi('admin@testing.edu.ve', '123456');
                await axios
                    .delete(`${API_BASE}/grades/${notaId}`, {
                        headers: {
                            Authorization: `Bearer ${admin.accessToken}`,
                            'X-Institute-Slug': TENANT_SLUG,
                        },
                    })
                    .catch(() => undefined);
            }
            await contexto.close();
        }
    });

    test('TR-02: el aviso no trae datos, solo dice qué cambió', async ({ browser }, testInfo) => {
        const sesion = await loginApi('admin@testing.edu.ve', '123456');
        const contexto = await browser.newContext();
        const page = await contexto.newPage();

        try {
            await injectSessionCookies(page, sesion);

            const avisos: any[] = [];
            const conectado: string[] = [];
            await page.exposeFunction('anotarAviso', (a: any) => avisos.push(a));
            await page.exposeFunction('anotarConexion', (a: any) => conectado.push(a));
            /**
             * SE ESCUCHAN LOS DOS CAMINOS, NO SOLO UNO
             *
             * Socket.io usa WebSocket cuando puede, y cuando no —red ocupada, un
             * intermediario que lo estorba— se pasa solo a pedir por HTTP cada
             * poco (*polling*). Es la misma conversación por otro camino.
             *
             * Esta prueba escuchaba únicamente las tramas de WebSocket. Corriendo
             * sola pasaba; en la tanda completa, con el equipo cargado, la
             * conexión se iba a *polling* y la prueba no oía nada: fallaba
             * diciendo que el aviso no había llegado cuando sí llegaba, solo que
             * por el otro camino.
             *
             * Ahora se escuchan los dos.
             */
            await page.addInitScript(() => {
                const anotarSiEsAviso = (texto: unknown) => {
                    if (typeof texto !== 'string') return;
                    if (texto.includes('datos:cambiaron')) (window as any).anotarAviso?.(texto);
                    // `sid` = socket.io ya terminó de conectar.
                    if (texto.includes('"sid"')) (window as any).anotarConexion?.(texto);
                };

                const original = (window as any).WebSocket;
                (window as any).WebSocket = class extends original {
                    constructor(...args: any[]) {
                        super(...args);
                        this.addEventListener('message', (ev: MessageEvent) => anotarSiEsAviso(ev.data));
                    }
                };

                // El mismo aviso, cuando viaja por HTTP.
                const fetchOriginal = window.fetch;
                window.fetch = async (...args: any[]) => {
                    const respuesta = await (fetchOriginal as any).apply(window, args);
                    const url = String(args[0] instanceof Request ? args[0].url : args[0] ?? '');
                    if (url.includes('socket.io')) {
                        respuesta.clone().text().then(anotarSiEsAviso).catch(() => undefined);
                    }
                    return respuesta;
                };

                const abrirOriginal = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, metodo: string, url: string, ...resto: any[]) {
                    if (String(url).includes('socket.io')) {
                        this.addEventListener('load', () => anotarSiEsAviso(this.responseText));
                    }
                    return (abrirOriginal as any).call(this, metodo, url, ...resto);
                };
            });

            await page.goto(`${WEB_BASE}/dashboard/materias`);
            await page.locator('main').first().waitFor({ state: 'visible', timeout: 30000 });

            /**
             * SE ESPERA A QUE LA PANTALLA ESTÉ ESCUCHANDO
             *
             * Esta prueba crea la materia desde fuera y comprueba que el aviso
             * llega. Si se crea **antes** de que el socket termine de conectar,
             * el aviso se manda cuando todavía no hay nadie al otro lado: no se
             * pierde por un fallo, es que aún no había conexión.
             *
             * Corriendo sola pasaba —la pantalla carga rápido y conecta antes—
             * y en la tanda completa fallaba, con el equipo cargado. Se midió
             * con una sonda: el socket conecta y el aviso llega, solo que más
             * tarde que la creación.
             *
             * Al conectar, socket.io manda un mensaje con su identificador de
             * sesión (`sid`). Esperar a verlo es esperar a que haya alguien
             * escuchando, que es la condición que esta prueba necesita.
             */
            await expect
                .poll(() => conectado.length, { timeout: 30000 })
                .toBeGreaterThan(0);

            const nombre = `Materia Aviso ${Date.now()}`;
            const creada = await axios.post(
                `${API_BASE}/subjects`,
                { name: nombre, code: `AV${String(Date.now()).slice(-6)}`, description: 'x' },
                {
                    headers: {
                        Authorization: `Bearer ${sesion.accessToken}`,
                        'X-Institute-Slug': TENANT_SLUG,
                    },
                }
            );
            const id = creada.data?.subject?.id ?? creada.data?.data?.id ?? creada.data?.id;

            await expect(page.getByText(nombre).first()).toBeVisible({ timeout: ESPERA_MAXIMA });

            /**
             * SE ESPERA AL AVISO; NO SE DA POR HECHO QUE YA LLEGÓ
             *
             * Antes bastaba con que la materia apareciera: la única forma de que
             * apareciera era el aviso, así que si se veía, el aviso ya estaba.
             *
             * Ya no. Ahora la pantalla también pide los datos **al conectar el
             * socket**, para no perderse lo que otro guarde en el hueco entre
             * abrir la pantalla y quedar conectado. Así que la materia puede
             * aparecer por esa vía, antes de que llegue el aviso — y la
             * comprobación de abajo se hacía con la lista de avisos todavía
             * vacía.
             *
             * Lo que esta prueba quiere comprobar sigue siendo lo mismo: que el
             * aviso **no lleva dentro lo que cambió**. Para eso hay que esperar
             * a que llegue.
             */
            await expect
                .poll(() => avisos.length, { timeout: ESPERA_MAXIMA })
                .toBeGreaterThan(0);

            // El aviso viajó, pero sin el contenido de lo que cambió
            const texto = avisos.join(' ');
            expect(texto).toContain('datos:cambiaron');
            expect(texto).not.toContain(nombre);

            if (id) {
                await axios
                    .delete(`${API_BASE}/subjects/${id}`, {
                        headers: {
                            Authorization: `Bearer ${sesion.accessToken}`,
                            'X-Institute-Slug': TENANT_SLUG,
                        },
                    })
                    .catch(() => undefined);
            }
        } catch (error) {
            await captureEvidence(testInfo, page, 'TR-02', 'El aviso no lleva datos', error);
            throw error;
        } finally {
            await contexto.close();
        }
    });
});
