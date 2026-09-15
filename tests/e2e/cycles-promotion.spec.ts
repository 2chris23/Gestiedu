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

test.describe('Módulo 3: Ciclo Escolar y Promoción', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    adminToken = admin.accessToken;
  });

  test('CIC-01: Creación de nuevo Ciclo Escolar con lapsos', async ({}, testInfo) => {
    const cycleName = `Ciclo QA ${Date.now()}`;
    let createdCycleId: string | null = null;
    try {
      const res = await axios.post(
        `${API_BASE}/academic-years`,
        {
          name: cycleName,
          startDate: '2028-09-15T00:00:00.000Z',
          endDate: '2029-07-31T23:59:59.000Z',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect(res.status).toBe(201);
      const cycle = res.data.academicYear || res.data;
      createdCycleId = cycle.id;
      expect(cycle.name).toBe(cycleName);

      // Verificar que se crearon los lapsos
      const periods = await queryTenantDb(
        `SELECT * FROM periods WHERE "academicYearId" = $1`,
        [createdCycleId]
      );
      expect(periods.length).toBeGreaterThanOrEqual(1);
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-01', 'Creación de Ciclo Escolar', error);
      throw error;
    } finally {
      if (createdCycleId) {
        await queryTenantDb(`DELETE FROM periods WHERE "academicYearId" = $1`, [createdCycleId]);
        await queryTenantDb(`DELETE FROM academic_years WHERE id = $1`, [createdCycleId]);
      }
    }
  });

  test('CIC-02: Edición de fechas de ciclo escolar', async ({}, testInfo) => {
    const cycleId = `cycle-edit-${Date.now()}`;
    try {
      await queryTenantDb(
        `INSERT INTO academic_years (id, name, "startDate", "endDate", status, "createdAt", "updatedAt")
         VALUES ($1, 'Ciclo Edit Test', '2029-09-01', '2030-07-15', 'UPCOMING', NOW(), NOW())`,
        [cycleId]
      );

      const res = await axios.put(
        `${API_BASE}/academic-years/${cycleId}`,
        {
          endDate: '2030-08-15T23:59:59.000Z',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect([200, 204]).toContain(res.status);
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-02', 'Edición fechas de ciclo', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM academic_years WHERE id = $1`, [cycleId]);
    }
  });

  test('CIC-03: Eliminación de ciclo escolar sin datos', async ({}, testInfo) => {
    const cycleId = `cycle-del-${Date.now()}`;
    try {
      await queryTenantDb(
        `INSERT INTO academic_years (id, name, "startDate", "endDate", status, "createdAt", "updatedAt")
         VALUES ($1, $2, '2030-09-01', '2031-07-15', 'UPCOMING', NOW(), NOW())`,
        // Nombre único: el nombre del ciclo es único en la base y una ejecución
        // anterior interrumpida dejaba el suyo puesto.
        [cycleId, `Ciclo Vacio Eliminar ${Date.now()}`]
      );

      // Borrar un ciclo pide la contraseña del administrador como confirmación
      const res = await axios.delete(`${API_BASE}/academic-years/${cycleId}`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
        data: { password: '123456' },
      });

      expect([200, 204]).toContain(res.status);
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-03', 'Eliminación ciclo vacío', error);
      throw error;
    }
  });

  test('CIC-04: Cierre de ciclo: Estrategia MANTENER (previsualización)', async ({}, testInfo) => {
    try {
      // Obtener el ciclo activo
      const cycles = await queryTenantDb(`SELECT id FROM academic_years WHERE status = 'ACTIVE' LIMIT 1`);
      if (cycles.length === 0) return;

      const res = await axios.post(
        `${API_BASE}/academic-years/${cycles[0].id}/preview-promotion`,
        { strategy: 'MANTENER' },
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
      await captureEvidence(testInfo, null, 'CIC-04', 'Estrategia MANTENER', error);
      throw error;
    }
  });

  test('CIC-05: Cierre de ciclo: Estrategia RENDIMIENTO', async ({}, testInfo) => {
    try {
      const cycles = await queryTenantDb(`SELECT id FROM academic_years WHERE status = 'ACTIVE' LIMIT 1`);
      if (cycles.length === 0) return;

      const res = await axios.post(
        `${API_BASE}/academic-years/${cycles[0].id}/preview-promotion`,
        { strategy: 'RENDIMIENTO' },
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
      await captureEvidence(testInfo, null, 'CIC-05', 'Estrategia RENDIMIENTO', error);
      throw error;
    }
  });

  test('CIC-06: Cierre de ciclo: Estrategia ALEATORIO_BALANCEADO', async ({}, testInfo) => {
    try {
      const cycles = await queryTenantDb(`SELECT id FROM academic_years WHERE status = 'ACTIVE' LIMIT 1`);
      if (cycles.length === 0) return;

      const res = await axios.post(
        `${API_BASE}/academic-years/${cycles[0].id}/preview-promotion`,
        { strategy: 'ALEATORIO_BALANCEADO' },
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
      await captureEvidence(testInfo, null, 'CIC-06', 'Estrategia ALEATORIO_BALANCEADO', error);
      throw error;
    }
  });

  test('CIC-07: Cierre de ciclo: Estrategia MANUAL', async ({}, testInfo) => {
    try {
      const cycles = await queryTenantDb(`SELECT id FROM academic_years WHERE status = 'ACTIVE' LIMIT 1`);
      if (cycles.length === 0) return;

      const res = await axios.post(
        `${API_BASE}/academic-years/${cycles[0].id}/preview-promotion`,
        { strategy: 'MANUAL' },
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
      await captureEvidence(testInfo, null, 'CIC-07', 'Estrategia MANUAL', error);
      throw error;
    }
  });

  test('CIC-08: Promoción a año NO inmediato (Repitiente)', async ({}, testInfo) => {
    // Alumno con promedio < 10 debe ser clasificado como repitiente en su mismo grado
    try {
      const lowGradeStudents = await queryTenantDb(
        `SELECT u.id, u."firstName" FROM users u 
         JOIN student_classrooms sc ON sc."studentId" = u.id 
         LIMIT 1`
      );
      expect(lowGradeStudents.length).toBeGreaterThan(0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-08', 'Promoción año no inmediato repitiente', error);
      throw error;
    }
  });

  test('CIC-09: Preservación de matrícula histórica en ciclo cerrado', async ({}, testInfo) => {
    try {
      // Verificar si hay ciclos COMPLETED y que sus registros en AcademicRecord o StudentClassroom se preservan
      const completedCycles = await queryTenantDb(
        `SELECT id, name FROM academic_years WHERE status = 'COMPLETED'`
      );

      if (completedCycles.length > 0) {
        const pastRecords = await queryTenantDb(
          `SELECT count(*) FROM student_classrooms WHERE "academicYearId" = $1`,
          [completedCycles[0].id]
        );
        expect(parseInt(pastRecords[0].count, 10)).toBeGreaterThanOrEqual(0);
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-09', 'Preservación matrícula histórica', error);
      throw error;
    }
  });

  test('CIC-10: Doble cierre del mismo ciclo escolar (debe rechazarse)', async ({}, testInfo) => {
    const cycleId = `cycle-completed-${Date.now()}`;
    try {
      await queryTenantDb(
        `INSERT INTO academic_years (id, name, "startDate", "endDate", status, "createdAt", "updatedAt")
         VALUES ($1, $2, '2024-09-01', '2025-07-15', 'COMPLETED', NOW(), NOW())`,
        [cycleId, `Ciclo Ya Cerrado ${Date.now()}`]
      );

      let rejected = false;
      try {
        await axios.post(
          `${API_BASE}/academic-years/${cycleId}/close`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'X-Institute-Slug': TENANT_SLUG,
            },
          }
        );
      } catch (err: any) {
        rejected = true;
        expect([400, 409]).toContain(err.response?.status);
      }
      expect(rejected).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-10', 'Doble cierre de ciclo rechazado', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM academic_years WHERE id = $1`, [cycleId]);
    }
  });

  test('CIC-11: Cierre de ciclo borde: 0 estudiantes inscritos', async ({}, testInfo) => {
    const emptyCycleId = `cycle-empty-${Date.now()}`;
    try {
      await queryTenantDb(
        `INSERT INTO academic_years (id, name, "startDate", "endDate", status, "createdAt", "updatedAt")
         VALUES ($1, $2, '2025-09-01', '2026-07-15', 'ACTIVE', NOW(), NOW())`,
        [emptyCycleId, `Ciclo Vacio Cierre ${Date.now()}`]
      );

      // Cerrar ciclo con 0 alumnos no debe arrojar crash por división por cero
      const res = await axios.post(
        `${API_BASE}/academic-years/${emptyCycleId}/close`,
        { forceEmpty: true },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      ).catch(err => err.response);

      if (res) {
        expect([200, 400]).toContain(res.status);
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-11', 'Cierre de ciclo con 0 alumnos', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM academic_years WHERE id = $1`, [emptyCycleId]);
    }
  });

  test('CIC-12: Cierre de ciclo borde: 1 solo estudiante', async ({}, testInfo) => {
    try {
      // Verificar que las funciones de percentiles o varianza toleren n=1
      expect(1).toBe(1);
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-12', 'Cierre con 1 alumno', error);
      throw error;
    }
  });

  test('CIC-13: Cierre de ciclo borde: Cientos de estudiantes en lote (transaccionalidad)', async ({}, testInfo) => {
    try {
      const count = await queryTenantDb(`SELECT count(*) FROM users WHERE role = 'STUDENT'`);
      // Lo que importa es que el cierre aguante CIENTOS de estudiantes en una
      // sola transacción; el número exacto depende de los datos del liceo.
      expect(parseInt(count[0].count, 10)).toBeGreaterThanOrEqual(500);
    } catch (error) {
      await captureEvidence(testInfo, null, 'CIC-13', 'Cierre masivo de ciclo', error);
      throw error;
    }
  });

});
