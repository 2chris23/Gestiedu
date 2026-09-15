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

test.describe('Notas: permisos y borrado', () => {
    test.describe.configure({ mode: 'serial' });

    test('GR-01: un estudiante no puede ponerse una nota, ni llamando a la API', async () => {
        const alumno = await loginApi('est0575@testing.edu.ve', '123456', true, TENANT_SLUG, true);

        const [fila] = await queryTenantDb<any>(
            `SELECT a.id AS "activityId", a."periodId", a."subjectId", sc."studentId"
             FROM activities a
             JOIN student_classrooms sc ON sc."classroomId" = a."classroomId" AND sc."isActive" = true
             LIMIT 1`
        );
        expect(fila, 'hace falta al menos una actividad con alumnos').toBeTruthy();

        const r = await pedir('post', '/grades', alumno.accessToken, {
            score: 20,
            studentId: fila.studentId,
            activityId: fila.activityId,
            periodId: fila.periodId,
            subjectId: fila.subjectId,
        });

        // Da igual si responde 400, 401 o 403: lo que no puede es guardar.
        expect(r.status, `la API dejó calificar a un estudiante (${r.status})`).toBeGreaterThanOrEqual(400);

        const [nota] = await queryTenantDb<any>(
            `SELECT id FROM grades WHERE "studentId" = $1 AND "activityId" = $2 AND score = 20`,
            [fila.studentId, fila.activityId]
        );
        expect(nota, 'se guardó una nota puesta por un estudiante').toBeFalsy();
    });

    test('GR-02: un profesor no puede calificar en una materia que no imparte', async () => {
        const profesor = await loginApi('profesor.ciencias@tuapp.com', '123456', true, TENANT_SLUG, true);
        const [yo] = await queryTenantDb<{ id: string }>(
            `SELECT id FROM users WHERE email = 'profesor.ciencias@tuapp.com'`
        );
        expect(yo).toBeTruthy();

        // Una actividad de una materia que NO es suya
        const [ajena] = await queryTenantDb<any>(
            `SELECT a.id AS "activityId", a."periodId", a."subjectId", sc."studentId"
             FROM activities a
             JOIN classroom_subjects cs
               ON cs."classroomId" = a."classroomId" AND cs."subjectId" = a."subjectId"
             JOIN student_classrooms sc
               ON sc."classroomId" = a."classroomId" AND sc."isActive" = true
             WHERE cs."teacherId" IS DISTINCT FROM $1
             LIMIT 1`,
            [yo.id]
        );

        test.skip(!ajena, 'el liceo de pruebas no tiene una materia ajena a este profesor');

        const r = await pedir('post', '/grades', profesor.accessToken, {
            score: 19,
            studentId: ajena.studentId,
            activityId: ajena.activityId,
            periodId: ajena.periodId,
            subjectId: ajena.subjectId,
        });

        expect(r.status, `dejó calificar en una materia ajena (${r.status})`).toBeGreaterThanOrEqual(400);
    });

    test('GR-03: un estudiante no ve las notas de otro', async () => {
        const alumno = await loginApi('est0575@testing.edu.ve', '123456', true, TENANT_SLUG, true);

        const [otro] = await queryTenantDb<{ id: string }>(
            `SELECT u.id FROM users u
             WHERE u.role = 'STUDENT' AND u."isActive" = true
               AND u.email <> 'est0575@testing.edu.ve'
             LIMIT 1`
        );
        expect(otro).toBeTruthy();

        const r = await pedir('get', `/grades/student/${otro.id}`, alumno.accessToken);

        // O lo niega, o no le devuelve notas. Lo que no puede es entregárselas.
        if (r.status === 200) {
            const notas = r.data?.grades ?? r.data?.data?.grades ?? [];
            expect(
                notas.length,
                'un estudiante recibió las notas de otro estudiante'
            ).toBe(0);
        } else {
            expect(r.status).toBeGreaterThanOrEqual(400);
        }
    });

    test('GR-04: una nota borrada queda recuperable en la papelera', async () => {
        const admin = await loginApi('admin@testing.edu.ve', '123456', true, TENANT_SLUG, true);

        // Una nota que exista de verdad
        const [nota] = await queryTenantDb<any>(
            `SELECT id, score, "studentId", "activityId" FROM grades WHERE score IS NOT NULL LIMIT 1`
        );
        expect(nota, 'hace falta al menos una nota en el liceo de pruebas').toBeTruthy();

        const antes = await queryTenantDb<any>(
            `SELECT id FROM registros_borrados WHERE tabla = 'grade' AND "registroId" = $1`,
            [nota.id]
        );
        expect(antes.length, 'esta nota ya estaba en la papelera').toBe(0);

        const r = await pedir('delete', `/grades/${nota.id}`, admin.accessToken);
        expect(
            [200, 204],
            `el borrado respondió ${r.status}: ${JSON.stringify(r.data)}`
        ).toContain(r.status);

        // Ya no está
        const quedan = await queryTenantDb<any>(`SELECT id FROM grades WHERE id = $1`, [nota.id]);
        expect(quedan.length).toBe(0);

        // Pero se puede recuperar
        const [copia] = await queryTenantDb<any>(
            `SELECT contenido, "borradoPor", motivo FROM registros_borrados
             WHERE tabla = 'grade' AND "registroId" = $1`,
            [nota.id]
        );
        expect(copia, 'la nota se borró sin dejar copia').toBeTruthy();
        expect(Number(copia.contenido.score)).toBe(Number(nota.score));
        expect(copia.contenido.studentId).toBe(nota.studentId);
        expect(copia.motivo).toContain('/api/grades/');

        // Se devuelve a su sitio desde la copia, que es de lo que sirve la papelera
        await queryTenantDb(
            `INSERT INTO grades (id, score, comments, "studentId", "activityId", "periodId",
                                 "subjectId", "teacherId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
            [
                copia.contenido.id,
                copia.contenido.score,
                copia.contenido.comments,
                copia.contenido.studentId,
                copia.contenido.activityId,
                copia.contenido.periodId,
                copia.contenido.subjectId,
                copia.contenido.teacherId,
            ]
        );

        const devuelta = await queryTenantDb<any>(`SELECT id, score FROM grades WHERE id = $1`, [nota.id]);
        expect(devuelta.length, 'no se pudo devolver la nota desde la papelera').toBe(1);
        expect(Number(devuelta[0].score)).toBe(Number(nota.score));

        // Se limpia el rastro de la prueba
        await queryTenantDb(`DELETE FROM registros_borrados WHERE tabla = 'grade' AND "registroId" = $1`, [
            nota.id,
        ]);
    });
});
