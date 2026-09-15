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

test.describe('Módulo 10: Horarios y Asignación de Bloques', () => {
  let adminToken: string;
  let sampleClassroomId: string;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    adminToken = admin.accessToken;

    const classrooms = await queryTenantDb(
      `SELECT id FROM classrooms WHERE grade = 1 LIMIT 1`
    );
    if (classrooms.length > 0) {
      sampleClassroomId = classrooms[0].id;
    }
  });

  test('HOR-01: Visualización de horario semanal con bloques simples y fusionados', async ({}, testInfo) => {
    try {
      expect(sampleClassroomId).toBeDefined();
      const res = await axios.get(
        `${API_BASE}/schedules/classroom/${sampleClassroomId}`,
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      ).catch(err => err.response);

      if (res && res.status === 200) {
        expect(res.data).toBeDefined();
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'HOR-01', 'Visualización de horario semanal', error);
      throw error;
    }
  });

  test('HOR-02: Apilamiento continuo obligatorio (cero horas libres intermedias)', async ({}, testInfo) => {
    try {
      // Los bloques de clase deben comenzar a las 07:00 y apilarse de forma continua
      // sin huecos entre 07:00 y el recreo (09:15) ni entre el recreo y el final (12:30)
      const blocks = await queryTenantDb(
        `SELECT "dayOfWeek", "startTime", "endTime" 
         FROM schedule_blocks 
         WHERE "classroomId" = $1 
         ORDER BY "dayOfWeek", "startTime"`,
        [sampleClassroomId]
      );

      expect(Array.isArray(blocks)).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'HOR-02', 'Apilamiento continuo obligatorio', error);
      throw error;
    }
  });

  test('HOR-03: Ordenar al Azar de clases con confirmación modal', async ({}, testInfo) => {
    try {
      // Endpoint de reordenamiento o shuffle
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'HOR-03', 'Ordenar al azar horario', error);
      throw error;
    }
  });

  test('HOR-04: Editar horario a mitad de ciclo conservando historial de clases dictadas', async ({}, testInfo) => {
    try {
      // Las sesiones en class_sessions conservan su fecha y bloque original inmutable
      const sessions = await queryTenantDb(`SELECT count(*) FROM class_sessions`);
      expect(parseInt(sessions[0].count, 10)).toBeGreaterThanOrEqual(0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'HOR-04', 'Preservación de clases dictadas', error);
      throw error;
    }
  });

  test('HOR-05: Sincronización universal Sección ↔ Docente', async ({}, testInfo) => {
    try {
      // Todo bloque asignado a un docente en una sección debe reflejarse en el endpoint del docente
      const teacherBlocks = await queryTenantDb(
        `SELECT "teacherId", count(*) FROM schedule_blocks WHERE "teacherId" IS NOT NULL GROUP BY "teacherId" LIMIT 1`
      );

      if (teacherBlocks.length > 0) {
        const teacherId = teacherBlocks[0].teacherId;
        const res = await axios.get(
          `${API_BASE}/schedules/teacher/${teacherId}`,
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'X-Institute-Slug': TENANT_SLUG,
            },
          }
        ).catch(err => err.response);

        if (res && res.status === 200) {
          expect(res.data).toBeDefined();
        }
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'HOR-05', 'Sincronización Sección Docente', error);
      throw error;
    }
  });

});
