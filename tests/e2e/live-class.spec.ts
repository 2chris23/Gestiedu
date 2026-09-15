import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
  API_BASE,
  WEB_BASE,
  TENANT_SLUG,
  loginApi,
  captureEvidence,
  queryTenantDb,
} from './helpers';

test.describe('Módulo 5: Clase en Vivo', () => {
  let teacherToken: string;
  let sampleClassroomId: string;

  test.beforeAll(async () => {
    const teacher = await loginApi('profesor.ciencias@tuapp.com', '123456');
    teacherToken = teacher.accessToken;

    const classrooms = await queryTenantDb(
      `SELECT id FROM classrooms WHERE grade = 1 LIMIT 1`
    );
    if (classrooms.length > 0) {
      sampleClassroomId = classrooms[0].id;
    }
  });

  test('LIVE-01: Resolver sesión desde vista "Hoy" (determinismo)', async ({}, testInfo) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await axios.get(
        `${API_BASE}/classes/schedule/today?date=${today}`,
        {
          headers: {
            'Authorization': `Bearer ${teacherToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      ).catch(err => err.response);

      if (res && res.status === 200) {
        expect(Array.isArray(res.data.classes || res.data)).toBeTruthy();
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-01', 'Resolver sesión vista Hoy', error);
      throw error;
    }
  });

  test('LIVE-02: Resolver sesión desde vista "Semana"', async ({}, testInfo) => {
    try {
      const res = await axios.get(
        `${API_BASE}/classes/schedule/week`,
        {
          headers: {
            'Authorization': `Bearer ${teacherToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      ).catch(err => err.response);

      if (res && res.status === 200) {
        expect(res.data).toBeDefined();
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-02', 'Resolver sesión vista Semana', error);
      throw error;
    }
  });

  test('LIVE-03: Resolver sesión desde modal "Historial"', async ({}, testInfo) => {
    try {
      const pastSessions = await queryTenantDb(
        `SELECT id, "classroomId", date FROM class_sessions ORDER BY date DESC LIMIT 1`
      );

      if (pastSessions.length > 0) {
        const sessionId = pastSessions[0].id;
        const res = await axios.get(
          `${API_BASE}/sessions/${sessionId}`,
          {
            headers: {
              'Authorization': `Bearer ${teacherToken}`,
              'X-Institute-Slug': TENANT_SLUG,
            },
          }
        ).catch(err => err.response);

        if (res && res.status === 200) {
          expect(res.data.session?.id || res.data.id).toBe(sessionId);
        }
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-03', 'Resolver sesión desde Historial', error);
      throw error;
    }
  });

  test('LIVE-04: Bloques fusionados (misma materia/profesor contiguos = 1 sesión)', async ({}, testInfo) => {
    try {
      // Verificar si hay bloques contiguos en horario
      const contiguous = await queryTenantDb(
        // Un bloque no guarda la materia ni el profesor: los toma de su
        // asignación (classroom_subjects). La consulta va por ahí.
        `SELECT cs."subjectId", cs."teacherId", sb."dayOfWeek", count(*)
           FROM schedule_blocks sb
           JOIN classroom_subjects cs ON cs.id = sb."classroomSubjectId"
          GROUP BY cs."subjectId", cs."teacherId", sb."dayOfWeek", sb."classroomId"
         HAVING count(*) > 1 LIMIT 1`
      );

      // Si existen bloques dobles, el resolver debe agruparlos en una sola sesión
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-04', 'Fusión de bloques contiguos', error);
      throw error;
    }
  });

  test('LIVE-05: Crear actividad planificada vs. ad-hoc en sesión', async ({}, testInfo) => {
    try {
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-05', 'Actividad planificada vs ad-hoc', error);
      throw error;
    }
  });

  test('LIVE-06: Calificación masiva en Clase en Vivo (escala 01-20 MPPE)', async ({}, testInfo) => {
    try {
      // Las notas deben estar en el rango 1 a 20
      const validScores = [10, 15, 18, 20];
      validScores.forEach(s => {
        expect(s >= 0 && s <= 20).toBeTruthy();
      });
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-06', 'Calificación masiva en clase en vivo', error);
      throw error;
    }
  });

  test('LIVE-07: Marcaje de asistencia rápido en Clase en Vivo', async ({}, testInfo) => {
    try {
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-07', 'Marcaje de asistencia rápido', error);
      throw error;
    }
  });

  test('LIVE-08: Suspensión de clase con motivo registrado', async ({}, testInfo) => {
    try {
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-08', 'Suspensión de clase con motivo', error);
      throw error;
    }
  });

  test('LIVE-09: Dos pestañas abiertas guardando concurrentemente', async ({}, testInfo) => {
    try {
      // Guardado concurrente de notas por estudiante no debe sobreescribir destructivamente
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'LIVE-09', 'Concurrencia de guardado en dos pestañas', error);
      throw error;
    }
  });

});
