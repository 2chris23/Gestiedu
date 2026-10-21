import { test, expect } from '@playwright/test';
import axios from 'axios';
import { API_BASE, TENANT_SLUG, loginApi, queryTenantDb } from './helpers';

/**
 * NOTAS: QUIÉN PUEDE PONERLAS, QUIÉN PUEDE VERLAS, Y QUÉ PASA AL BORRARLAS
 *
 * El camino normal de calificar —el profesor en su clase en vivo— ya está
 * probado en `live-class.spec.ts` (LIVE-06) y los cálculos en
 * `grades-averages.spec.ts`. Aquí se prueba lo otro, que es lo que duele si
 * falla:
 *
 *   - que un profesor NO pueda calificar en una sección que no es suya;
 *   - que un estudiante NO pueda ponerse nota, ni llamando a la API a mano;
 *   - que un estudiante NO vea las notas de otro;
 *   - que borrar una nota la deje recuperable.
 *
 * Se llama a la API directamente y no por la pantalla, a propósito: el guardián
 * del navegador es la puerta de la casa, y esto prueba la de la caja fuerte. Un
 * atacante no usa los botones.
 */

/**
 * `Content-Type: application/json` solo cuando hay cuerpo.
 *
 * Si se manda en un DELETE sin cuerpo, Fastify responde 400 ("Body cannot be
 * empty when content-type is set to 'application/json'") y parecería que el
 * borrado está roto cuando lo roto es la llamada.
 */
/**
 * Las credenciales se piden siempre nuevas (el último `true`).
 *
 * `loginApi` guarda las credenciales en disco durante 20 minutos, y esa caché no
 * distingue contra qué servidor se pidieron. Reutilizar una caducada da un 401
 * que parece un fallo de permisos y no lo es.
 */
const cabeceras = (token: string, conCuerpo: boolean) => ({
    Authorization: `Bearer ${token}`,
    'X-Institute-Slug': TENANT_SLUG,
    ...(conCuerpo ? { 'Content-Type': 'application/json' } : {}),
});

/** Llama a la API sin que axios lance: interesa el código, no la excepción. */
async function pedir(metodo: 'get' | 'post' | 'delete', ruta: string, token: string, cuerpo?: any) {
    try {
        const r = await axios.request({
            method: metodo,
            url: `${API_BASE}${ruta}`,
            headers: cabeceras(token, cuerpo !== undefined),
            data: cuerpo,
            timeout: 20000,
        });
        return { status: r.status, data: r.data };
    } catch (e: any) {
        return { status: e?.response?.status ?? 0, data: e?.response?.data };
    }
}

/**
 * Las notas se ponen en la clase en vivo: en una actividad de la clase
 * (`/sessions/activities/:id/grades`). Antes también por `/api/grades`, que
 * ninguna pantalla usaba y se quitó el 20-oct-2026.
 */
const ponerNota = (actividadId: string, studentId: string, nota: number, token: string) =>
    pedir('post', `/sessions/activities/${actividadId}/grades`, token, { scores: { [studentId]: nota }, maxScore: 20 });

test.describe('Notas: permisos y borrado', () => {
    test.describe.configure({ mode: 'serial' });

    test('GR-01: un estudiante no puede ponerse una nota, ni llamando a la API', async () => {
        const alumno = await loginApi('est0575@testing.edu.ve', '123456', true, TENANT_SLUG, true);
        const [yo] = await queryTenantDb<{ id: string }>(`SELECT id FROM users WHERE email = 'est0575@testing.edu.ve'`);

        const [fila] = await queryTenantDb<any>(
            `SELECT a.id AS "activityId", a.scores -> $1 AS "suNota"
             FROM class_activities a
             JOIN student_classrooms sc ON sc."classroomId" = a."classroomId" AND sc."isActive" = true
             WHERE sc."studentId" = $1
             LIMIT 1`,
            [yo.id]
        );
        expect(fila, 'hace falta al menos una actividad en la sección del alumno').toBeTruthy();

        const r = await ponerNota(fila.activityId, yo.id, 20, alumno.accessToken);

        // Da igual si responde 400, 401 o 403: lo que no puede es guardar.
        expect(r.status, `la API dejó calificar a un estudiante (${r.status})`).toBeGreaterThanOrEqual(400);

        const [despues] = await queryTenantDb<any>(
            `SELECT scores -> $2 AS "suNota" FROM class_activities WHERE id = $1`,
            [fila.activityId, yo.id]
        );
        expect(despues.suNota, 'se guardó una nota puesta por un estudiante').toEqual(fila.suNota);
    });

    test('GR-02: un profesor no puede calificar en una materia que no imparte', async () => {
        const profesor = await loginApi('profesor.ciencias@tuapp.com', '123456', true, TENANT_SLUG, true);
        const [yo] = await queryTenantDb<{ id: string }>(
            `SELECT id FROM users WHERE email = 'profesor.ciencias@tuapp.com'`
        );
        expect(yo).toBeTruthy();

        // Una actividad de una materia que NO es suya
        const [ajena] = await queryTenantDb<any>(
            `SELECT a.id AS "activityId", sc."studentId"
             FROM class_activities a
             JOIN classroom_subjects cs
               ON cs."classroomId" = a."classroomId" AND cs."subjectId" = a."subjectId"
             JOIN student_classrooms sc
               ON sc."classroomId" = a."classroomId" AND sc."isActive" = true
             WHERE cs."teacherId" IS DISTINCT FROM $1
             LIMIT 1`,
            [yo.id]
        );

        test.skip(!ajena, 'el liceo de pruebas no tiene una materia ajena a este profesor');

        const r = await ponerNota(ajena.activityId, ajena.studentId, 19, profesor.accessToken);
        expect(r.status, `dejó calificar en una materia ajena (${r.status})`).toBeGreaterThanOrEqual(400);
    });

    test('GR-03: un estudiante no ve las notas de otro', async () => {
        const alumno = await loginApi('est0575@testing.edu.ve', '123456', true, TENANT_SLUG, true);
        const [otro] = await queryTenantDb<{ id: string }>(
            `SELECT u.id FROM users u
             WHERE u.role = 'STUDENT'
               AND u.email <> 'est0575@testing.edu.ve'
             LIMIT 1`
        );
        expect(otro).toBeTruthy();

        // Su boleta: donde se ven las notas de un alumno.
        const r = await pedir('get', `/students/${otro.id}/boleta`, alumno.accessToken);
        expect(r.status, 'un estudiante recibió la boleta de otro estudiante').toBeGreaterThanOrEqual(400);
    });

    test('GR-04: una actividad con notas borrada queda recuperable en la papelera', async () => {
        const admin = await loginApi('admin@testing.edu.ve', '123456', true, TENANT_SLUG, true);

        // Una actividad nueva con una nota, para no tocar las del liceo
        const [cs] = await queryTenantDb<any>(
            `SELECT sc."classroomId", cs."subjectId", sc."studentId"
             FROM classroom_subjects cs
             JOIN student_classrooms sc ON sc."classroomId" = cs."classroomId" AND sc."isActive" = true
             LIMIT 1`
        );
        expect(cs, 'hace falta una materia con alumnos en el liceo de pruebas').toBeTruthy();
        const id = `cgr04${Date.now().toString(36)}`;
        await queryTenantDb(
            `INSERT INTO class_activities (id, title, type, target, "maxScore", scores, "classroomId", "subjectId", "createdAt", "updatedAt")
             VALUES ($1, 'GR-04 prueba de la papelera', 'TAREA', 'CURRENT', 20, $2::jsonb, $3, $4, now(), now())`,
            [id, JSON.stringify({ [cs.studentId]: 17 }), cs.classroomId, cs.subjectId]
        );

        const r = await pedir('delete', `/sessions/activities/${id}?decision=borrar`, admin.accessToken);
        expect([200, 204], `el borrado respondió ${r.status}: ${JSON.stringify(r.data)}`).toContain(r.status);

        // Ya no está
        expect((await queryTenantDb<any>(`SELECT id FROM class_activities WHERE id = $1`, [id])).length).toBe(0);

        // Pero se puede recuperar, con su nota
        const [copia] = await queryTenantDb<any>(
            `SELECT contenido, operacion FROM registros_borrados WHERE tabla = 'classActivity' AND "registroId" = $1`,
            [id]
        );
        expect(copia, 'la actividad se borró sin dejar copia').toBeTruthy();
        expect(copia.contenido.scores[cs.studentId]).toBe(17);

        const devuelta = await pedir('post', `/papelera/${encodeURIComponent(copia.operacion)}/restaurar`, admin.accessToken, {});
        expect(devuelta.status, `restaurar respondió ${devuelta.status}: ${JSON.stringify(devuelta.data)}`).toBe(200);
        const [otraVez] = await queryTenantDb<any>(`SELECT scores FROM class_activities WHERE id = $1`, [id]);
        expect(otraVez?.scores?.[cs.studentId], 'no se pudo devolver la actividad desde la papelera').toBe(17);

        // Se limpia el rastro de la prueba
        await queryTenantDb(`DELETE FROM class_activities WHERE id = $1`, [id]);
        await queryTenantDb(`DELETE FROM registros_borrados WHERE "registroId" = $1`, [id]);
    });
});
