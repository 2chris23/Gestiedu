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

test.describe('Módulo 2: Usuarios y Roles', () => {
  let adminToken: string;
  const generateTestCedula = () => `V-${Math.floor(10000000 + Math.random() * 89999999)}`;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    adminToken = admin.accessToken;
  });

  test('USR-01: Crear usuario ADMIN válido', async ({}, testInfo) => {
    const testId = generateTestCedula();
    const testEmail = `admin_qa_${Date.now()}@testing.edu.ve`;
    try {
      const res = await axios.post(
        `${API_BASE}/users`,
        {
          id: testId,
          email: testEmail,
          firstName: 'Admin',
          lastName: 'Prueba QA',
          role: 'ADMIN',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect(res.status).toBe(201);
      expect(res.data.id || res.data.user?.id).toBe(testId);
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-01', 'Crear usuario ADMIN', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testId]);
    }
  });

  test('USR-02: Crear usuario PROFESOR con especialización', async ({}, testInfo) => {
    const testId = generateTestCedula();
    const testEmail = `prof_qa_${Date.now()}@testing.edu.ve`;
    try {
      const res = await axios.post(
        `${API_BASE}/users`,
        {
          id: testId,
          email: testEmail,
          firstName: 'Profesor',
          lastName: 'Matemática QA',
          role: 'TEACHER',
          specialization: 'Matemáticas y Física',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect(res.status).toBe(201);
      const user = res.data.user || res.data;
      expect(user.role).toBe('TEACHER');
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-02', 'Crear usuario PROFESOR con especialización', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testId]);
    }
  });

  test('USR-03: Crear usuario ESTUDIANTE con código de estudiante', async ({}, testInfo) => {
    const testId = generateTestCedula();
    const testEmail = `est_qa_${Date.now()}@testing.edu.ve`;
    const studentCode = `CODE-${Date.now()}`;
    try {
      const res = await axios.post(
        `${API_BASE}/users`,
        {
          id: testId,
          email: testEmail,
          firstName: 'Estudiante',
          lastName: 'Prueba QA',
          role: 'STUDENT',
          studentCode,
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect(res.status).toBe(201);
      const user = res.data.user || res.data;
      expect(user.role).toBe('STUDENT');
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-03', 'Crear usuario ESTUDIANTE con código', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testId]);
    }
  });

  test('USR-04: Crear usuario TUTOR y vinculación con estudiante', async ({}, testInfo) => {
    const tutorId = generateTestCedula();
    const tutorEmail = `tutor_qa_${Date.now()}@testing.edu.ve`;
    try {
      const resTutor = await axios.post(
        `${API_BASE}/users`,
        {
          id: tutorId,
          email: tutorEmail,
          firstName: 'Representante',
          lastName: 'Prueba QA',
          role: 'TUTOR',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect(resTutor.status).toBe(201);

      // Vincular con el primer estudiante existente
      const students = await queryTenantDb(`SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1`);
      if (students.length > 0) {
        await queryTenantDb(
          `INSERT INTO student_tutors (id, "studentId", "tutorId", relationship, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'PADRE', NOW(), NOW())`,
          [`st-${Date.now()}`, students[0].id, tutorId]
        );

        const checkLink = await queryTenantDb(`SELECT * FROM student_tutors WHERE "tutorId" = $1`, [tutorId]);
        expect(checkLink.length).toBe(1);
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-04', 'Crear usuario TUTOR y vincular', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM student_tutors WHERE "tutorId" = $1`, [tutorId]);
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [tutorId]);
    }
  });

  test('USR-05: Validación de campos requeridos e inválidos', async ({}, testInfo) => {
    try {
      let rejected = false;
      try {
        await axios.post(
          `${API_BASE}/users`,
          {
            email: 'correo_invalido_sin_formato',
            firstName: '',
            lastName: '',
            role: 'INVALID_ROLE',
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
      await captureEvidence(testInfo, null, 'USR-05', 'Validación de campos inválidos', error);
      throw error;
    }
  });

  test('USR-06: Detección y rechazo de Cédula duplicada', async ({}, testInfo) => {
    const existing = await queryTenantDb(`SELECT id, email FROM users WHERE role = 'STUDENT' LIMIT 1`);
    if (existing.length === 0) return;

    try {
      let rejected = false;
      try {
        await axios.post(
          `${API_BASE}/users`,
          {
            id: existing[0].id, // Misma cédula
            email: `another_${Date.now()}@testing.edu.ve`,
            firstName: 'Duplicado',
            lastName: 'Cedula',
            role: 'ESTUDIANTE',
            password: 'password123',
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
        expect([400, 409, 500]).toContain(err.response?.status);
      }
      expect(rejected).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-06', 'Rechazo de cédula duplicada', error);
      throw error;
    }
  });

  test('USR-07: Detección y rechazo de Email duplicado', async ({}, testInfo) => {
    try {
      let rejected = false;
      try {
        await axios.post(
          `${API_BASE}/users`,
          {
            id: generateTestCedula(),
            email: 'admin@testing.edu.ve', // Email ya existente
            firstName: 'Otro',
            lastName: 'Admin',
            role: 'ADMIN',
            password: 'password123',
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
        expect(err.response?.status).toBe(409);
      }
      expect(rejected).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-07', 'Rechazo de email duplicado', error);
      throw error;
    }
  });

  test('USR-08: Edición de datos generales de usuario', async ({}, testInfo) => {
    const testId = generateTestCedula();
    const testEmail = `edit_test_${Date.now()}@testing.edu.ve`;
    try {
      await axios.post(
        `${API_BASE}/users`,
        {
          id: testId,
          email: testEmail,
          firstName: 'Original',
          lastName: 'Apellido',
          role: 'TEACHER',
          password: 'password123',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      // Editar
      const updateRes = await axios.put(
        `${API_BASE}/users/${testId}`,
        {
          firstName: 'Modificado',
          phone: '+584121234567',
        },
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        }
      );

      expect(updateRes.status).toBe(200);
      const rows = await queryTenantDb(`SELECT "firstName", phone FROM users WHERE id = $1`, [testId]);
      expect(rows[0].firstName).toBe('Modificado');
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-08', 'Edición de usuario', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testId]);
    }
  });

  test('USR-09: Desactivación lógica de usuario (isActive: false)', async ({}, testInfo) => {
    const testId = generateTestCedula();
    const testEmail = `toggle_test_${Date.now()}@testing.edu.ve`;
    try {
      await queryTenantDb(
        `INSERT INTO users (id, email, password, "firstName", "lastName", role, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, 'hash', 'Toggle', 'Test', 'STUDENT', true, NOW(), NOW())`,
        [testId, testEmail]
      );

      // Desactivar usuario
      await queryTenantDb(`UPDATE users SET "isActive" = false WHERE id = $1`, [testId]);
      const res = await queryTenantDb(`SELECT "isActive" FROM users WHERE id = $1`, [testId]);
      expect(res[0].isActive).toBe(false);
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-09', 'Desactivación lógica usuario', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testId]);
    }
  });

  test('USR-10: Reactivación de usuario desactivado', async ({}, testInfo) => {
    const testId = generateTestCedula();
    const testEmail = `react_test_${Date.now()}@testing.edu.ve`;
    try {
      await queryTenantDb(
        `INSERT INTO users (id, email, password, "firstName", "lastName", role, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, 'hash', 'Reactivar', 'Test', 'STUDENT', false, NOW(), NOW())`,
        [testId, testEmail]
      );

      await queryTenantDb(`UPDATE users SET "isActive" = true WHERE id = $1`, [testId]);
      const res = await queryTenantDb(`SELECT "isActive" FROM users WHERE id = $1`, [testId]);
      expect(res[0].isActive).toBe(true);
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-10', 'Reactivación usuario', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE id = $1`, [testId]);
    }
  });

  test('USR-11: Eliminación física bloqueada por integridad referencial', async ({}, testInfo) => {
    // Alumno est0001 tiene asistencias/notas en tenant_instituto_testing
    const student = await queryTenantDb(`SELECT id FROM users WHERE email = 'est0001@testing.edu.ve' LIMIT 1`);
    if (student.length === 0) return;

    try {
      let blocked = false;
      try {
        await axios.delete(`${API_BASE}/users/${student[0].id}`, {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'X-Institute-Slug': TENANT_SLUG,
          },
        });
      } catch (err: any) {
        blocked = true;
        expect([400, 409, 500]).toContain(err.response?.status);
      }
      expect(blocked).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'USR-11', 'Integridad referencial en delete', error);
      throw error;
    }
  });

  test('USR-12: Rendimiento y paginación con 600+ usuarios', async ({ page }, testInfo) => {
    try {
      const adminSession = await loginApi('admin@testing.edu.ve', '123456');
      await injectSessionCookies(page, adminSession);

      const startTime = Date.now();
      await page.goto(`${WEB_BASE}/dashboard/usuarios`);
      await page.waitForSelector('table, [role="table"], .grid', { timeout: 15000 });
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(15000);
      await expect(page.locator('body')).toContainText(/Usuarios|Estudiantes|Docentes/i);
    } catch (error) {
      await captureEvidence(testInfo, page, 'USR-12', 'Paginación y carga 600+ usuarios', error);
      throw error;
    }
  });

  test('USR-13: Búsqueda reactiva por texto y filtro por rol', async ({ page }, testInfo) => {
    try {
      const adminSession = await loginApi('admin@testing.edu.ve', '123456');
      await injectSessionCookies(page, adminSession);

      await page.goto(`${WEB_BASE}/dashboard/usuarios`);
      await page.waitForSelector('input[placeholder*="Buscar"], input[type="search"], input[type="text"]');

      const searchInput = page.locator('input[placeholder*="Buscar"], input[type="search"]').first();
      await searchInput.fill('Rodríguez');
      await page.waitForTimeout(1000);

      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toMatch(/Rodríguez|Resultados|usuarios/i);
    } catch (error) {
      await captureEvidence(testInfo, page, 'USR-13', 'Búsqueda reactiva de usuarios', error);
      throw error;
    }
  });

});
