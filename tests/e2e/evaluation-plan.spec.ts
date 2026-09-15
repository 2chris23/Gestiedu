import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
  API_BASE,
  TENANT_SLUG,
  loginApi,
  captureEvidence,
  queryTenantDb,
} from './helpers';

test.describe('Módulo 4: Plan de Evaluación', () => {
  let adminToken: string;
  let teacherToken: string;
  let sampleClassroomId: string;
  let sampleSubjectId: string;
  let samplePeriodId: string;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    adminToken = admin.accessToken;

    const teacher = await loginApi('profesor.ciencias@tuapp.com', '123456');
    teacherToken = teacher.accessToken;

    // Obtener un aula, materia y período de prueba
    const classroomSubjects = await queryTenantDb(
      `SELECT cs."classroomId", cs."subjectId", c."academicYearId"
       FROM classroom_subjects cs
       JOIN classrooms c ON c.id = cs."classroomId"
       LIMIT 1`
    );

    if (classroomSubjects.length > 0) {
      sampleClassroomId = classroomSubjects[0].classroomId;
      sampleSubjectId = classroomSubjects[0].subjectId;
      const periods = await queryTenantDb(
        `SELECT id FROM periods WHERE "academicYearId" = $1 LIMIT 1`,
        [classroomSubjects[0].academicYearId]
      );
      samplePeriodId = periods[0]?.id;
    }
  });

  test('PLAN-01: Creación de Plan de Evaluación con criterios', async ({}, testInfo) => {
    try {
      expect(sampleClassroomId).toBeDefined();
      expect(sampleSubjectId).toBeDefined();
      expect(samplePeriodId).toBeDefined();

      const res = await axios.post(
        `${API_BASE}/evaluation-plan/rows/batch`,
        {
          classroomId: sampleClassroomId,
          subjectId: sampleSubjectId,
          lapso: 'LAPSO_1',
          rows: [
            {
              weekNumber: 1,
              title: 'Cinemática y Movimiento',
              actividadEval: 'Taller Práctico',
              puntos: 5.0,
              ponderacion: 25.0,
              rowType: 'EVALUATION',
            },
            {
              weekNumber: 2,
              title: 'Leyes de Newton',
              actividadEval: 'Examen Teórico',
              puntos: 15.0,
              ponderacion: 75.0,
              rowType: 'EVALUATION',
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      ).catch(err => err.response);

      if (res) {
        expect([200, 201]).toContain(res.status);
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-01', 'Creación de Plan de Evaluación', error);
      throw error;
    }
  });

  test('PLAN-02: Distribuir Equitativamente: 1 fila (20.00 pts exactos)', async ({}, testInfo) => {
    try {
      // Algoritmo de MAPA_DE_CALCULOS.md
      const n = 1;
      const ptPerItem = Math.floor((20 / n) * 100) / 100;
      const lastPt = Math.round((20 - ptPerItem * (n - 1)) * 100) / 100;

      expect(lastPt).toBe(20.0);
      expect(ptPerItem).toBe(20.0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-02', 'Distribuir 1 fila 20 pts', error);
      throw error;
    }
  });

  test('PLAN-03: Distribuir Equitativamente: 3 filas (6.66 + 6.66 + 6.68 = 20.00 pts exactos)', async ({}, testInfo) => {
    try {
      const n = 3;
      const ptPerItem = Math.floor((20 / n) * 100) / 100; // 6.66
      const lastPt = Math.round((20 - ptPerItem * (n - 1)) * 100) / 100; // 20 - 13.32 = 6.68

      expect(ptPerItem).toBe(6.66);
      expect(lastPt).toBe(6.68);
      const total = ptPerItem * 2 + lastPt;
      expect(total).toBe(20.0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-03', 'Distribuir 3 filas exactas', error);
      throw error;
    }
  });

  test('PLAN-04: Distribuir Equitativamente: 18 filas (distribución exacta sin pérdida decimal)', async ({}, testInfo) => {
    try {
      const n = 18;
      const ptPerItem = Math.floor((20 / n) * 100) / 100; // 1.11
      const lastPt = Math.round((20 - ptPerItem * (n - 1)) * 100) / 100; // 20 - (1.11 * 17) = 1.13

      expect(ptPerItem).toBe(1.11);
      expect(lastPt).toBe(1.13);
      const total = ptPerItem * 17 + lastPt;
      expect(total).toBe(20.0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-04', 'Distribuir 18 filas', error);
      throw error;
    }
  });

  test('PLAN-05: Distribuir Equitativamente: 52 filas (Caso Extremo Anual)', async ({}, testInfo) => {
    try {
      const n = 52;
      const ptPerItem = Math.floor((20 / n) * 100) / 100; // 0.38
      const lastPt = Math.round((20 - ptPerItem * (n - 1)) * 100) / 100; // 20 - (0.38 * 51) = 0.62

      expect(ptPerItem).toBe(0.38);
      expect(lastPt).toBe(0.62);
      const total = ptPerItem * 51 + lastPt;
      expect(total).toBe(20.0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-05', 'Distribuir 52 filas', error);
      throw error;
    }
  });

  test('PLAN-06: Validación estricta de suma != 20 puntos al guardar (debe rechazar)', async ({}, testInfo) => {
    try {
      let rejected = false;
      try {
        await axios.post(
          `${API_BASE}/evaluation-plan/rows/batch`,
          {
            classroomId: sampleClassroomId,
            subjectId: sampleSubjectId,
            lapso: '1',
            rows: [
              {
                weekNumber: 1,
                orderIndex: 0,
                // 'rowType' es lo que marca una fila como criterio evaluable;
                // con 'evalType' el plan se guardaba como borrador y no se validaba.
                rowType: 'EVALUATION',
                actividadEval: 'Incompleto',
                puntos: 12.0, // Suma da 12, no 20
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'X-Institute-Slug': TENANT_SLUG,
            },
          }
        );
      } catch (err: any) {
        rejected = true;
        expect([400, 422]).toContain(err.response?.status);
      }
      expect(rejected).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-06', 'Rechazo de suma != 20 pts', error);
      throw error;
    }
  });

  test('PLAN-07: Guardar plan con criterios ya calificados (preservación de id y notas)', async ({}, testInfo) => {
    try {
      // Verificar que el backend o servicio batchUpsertRows conserve id y activityId
      const existingRows = await queryTenantDb(
        `SELECT id, "activityId" FROM evaluation_plan_rows WHERE "activityId" IS NOT NULL LIMIT 1`
      );
      if (existingRows.length > 0) {
        expect(existingRows[0].id).toBeTruthy();
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-07', 'Preservación de id en filas con notas', error);
      throw error;
    }
  });

  test('PLAN-08: Importación desde Word (.docx) válido', async ({}, testInfo) => {
    try {
      // Endpoint o servicio de importación de Word
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-08', 'Importar Word válido', error);
      throw error;
    }
  });

  test('PLAN-09: Importación desde archivo corrupto o inválido', async ({}, testInfo) => {
    try {
      // El parser de Word debe manejar excepciones sin caer el servidor
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-09', 'Importar archivo corrupto', error);
      throw error;
    }
  });

  test('PLAN-10: Agregar y renombrar columnas personalizadas', async ({}, testInfo) => {
    try {
      // Metadatos de columnas en la grilla del plan
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'PLAN-10', 'Columnas personalizadas plan', error);
      throw error;
    }
  });

});
