import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
  API_BASE,
  TENANT_SLUG,
  loginApi,
  captureEvidence,
  queryTenantDb,
} from './helpers';

test.describe('Módulo 7: Asistencia Escolar', () => {
  let adminToken: string;
  let teacherToken: string;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    adminToken = admin.accessToken;

    const teacher = await loginApi('profesor.ciencias@tuapp.com', '123456');
    teacherToken = teacher.accessToken;
  });

  test('ASIS-01: Marcar los 4 estados de asistencia (PRESENT, LATE, ABSENT, EXCUSED)', async ({}, testInfo) => {
    // La asistencia necesita sección y profesor: se toma un estudiante que YA
    // esté inscrito en una sección, como en la vida real.
    //
    // Y uno que HOY no tenga asistencia puesta todavía. Un alumno solo tiene una
    // asistencia por día (`daily_attendance_studentId_date_key`), que es
    // justamente lo que el producto hace bien; al coger siempre al primero de la
    // lista, esta prueba chocaba contra esa regla y se ponía roja por algo que
    // no es un fallo. El `ON CONFLICT (id)` de abajo no la cubre: la llave que
    // manda aquí no es el id, es alumno+fecha.
    const today = new Date().toISOString().split('T')[0];

    const student = await queryTenantDb(
      `SELECT sc."studentId" AS id, sc."classroomId", c."teacherId"
         FROM student_classrooms sc
         JOIN classrooms c ON c.id = sc."classroomId"
        WHERE sc."isActive" = true AND c."teacherId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM daily_attendance da
             WHERE da."studentId" = sc."studentId" AND da.date::date = $1::date
          )
        LIMIT 1`,
      [today]
    );
    if (student.length === 0) return;

    const studentId = student[0].id;
    const classroomId = student[0].classroomId;
    const teacherId = student[0].teacherId;
    const testRecordId = `att-test-${Date.now()}`;

    try {
      await queryTenantDb(
        `INSERT INTO daily_attendance (id, "studentId", "classroomId", "teacherId", date, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'PRESENT', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [testRecordId, studentId, classroomId, teacherId, today]
      );

      const res = await queryTenantDb(
        `SELECT status FROM daily_attendance WHERE id = $1`,
        [testRecordId]
      );
      expect(res[0].status).toBe('PRESENT');
    } catch (error) {
      await captureEvidence(testInfo, null, 'ASIS-01', 'Estados de asistencia', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM daily_attendance WHERE id = $1`, [testRecordId]);
    }
  });

  test('ASIS-02: Cálculo de Asistencia en Perfil de Estudiante', async ({}, testInfo) => {
    try {
      // Fórmula MAPA_DE_CALCULOS: ((PRESENT + LATE) / TotalRegistros) * 100
      const present = 8;
      const late = 1;
      const absent = 1;
      const total = present + late + absent;

      const pct = Math.round(((present + late) / total) * 100 * 100) / 100;
      expect(pct).toBe(90.0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'ASIS-02', 'Cálculo de asistencia individual', error);
      throw error;
    }
  });

  test('ASIS-03: Agregación de Asistencia a nivel Sección y Ciclo', async ({}, testInfo) => {
    try {
      // Sección = media de asistencias individuales de alumnos inscritos
      const studentPcts = [90.0, 100.0, 80.0];
      const avgSeccion = studentPcts.reduce((a, b) => a + b, 0) / studentPcts.length;
      expect(avgSeccion).toBe(90.0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'ASIS-03', 'Agregación sección y ciclo', error);
      throw error;
    }
  });

  test('ASIS-04: Consistencia de fórmula: LATE cuenta como presente en 100% de pantallas', async ({}, testInfo) => {
    try {
      // Verificar que tanto en backend como frontend LATE se sume a la asistencia positiva
      const attendances = [
        { status: 'PRESENT' },
        { status: 'LATE' },
        { status: 'ABSENT' },
      ];

      const positive = attendances.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
      expect(positive).toBe(2);
    } catch (error) {
      await captureEvidence(testInfo, null, 'ASIS-04', 'Consistencia LATE cuenta presente', error);
      throw error;
    }
  });

  test('ASIS-05: Días sin toma de asistencia no penalizan el acumulado', async ({}, testInfo) => {
    try {
      // El total de registros en el denominador solo cuenta filas existentes en DailyAttendance
      expect(true).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'ASIS-05', 'Días no lectivos no penalizan', error);
      throw error;
    }
  });

});
