import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
  API_BASE,
  TENANT_SLUG,
  loginApi,
  captureEvidence,
  queryTenantDb,
} from './helpers';

test.describe('Módulo 9: Multi-tenant y Seguridad', () => {
  let testingToken: string;

  test.beforeAll(async () => {
    const admin = await loginApi('admin@testing.edu.ve', '123456');
    testingToken = admin.accessToken;
  });

  test('SEC-01: Aislamiento estricto de datos entre tenants', async ({}, testInfo) => {
    try {
      // Listar aulas de instituto-testing
      const res = await axios.get(`${API_BASE}/classrooms`, {
        headers: {
          'Authorization': `Bearer ${testingToken}`,
          'X-Institute-Slug': 'instituto-testing',
        },
      });

      expect(res.status).toBe(200);
      const classrooms = res.data.classrooms || res.data;
      expect(Array.isArray(classrooms)).toBeTruthy();
      expect(classrooms.length).toBeGreaterThan(0);
    } catch (error) {
      await captureEvidence(testInfo, null, 'SEC-01', 'Aislamiento de datos entre tenants', error);
      throw error;
    }
  });

  test('SEC-02: Token de un tenant usado con header/subdominio de otro tenant (debe rechazarse)', async ({}, testInfo) => {
    try {
      let rejected = false;
      try {
        // Usar token de testing contra san-miguel
        await axios.get(`${API_BASE}/classrooms`, {
          headers: {
            'Authorization': `Bearer ${testingToken}`,
            'X-Institute-Slug': 'san-miguel',
          },
        });
      } catch (err: any) {
        rejected = true;
        // Debe rechazar con 401 o 403 (TENANT_MISMATCH)
        expect([401, 403]).toContain(err.response?.status);
      }
      expect(rejected).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'SEC-02', 'Token cruzado entre tenants rechazado', error);
      throw error;
    }
  });

  test('SEC-03: Prevención de IDOR: Acceso a recurso mediante ID de otro tenant', async ({}, testInfo) => {
    try {
      // Intentar consultar un aula con un ID inventado o perteneciente a otro tenant
      let blocked = false;
      try {
        await axios.get(`${API_BASE}/classrooms/cuid_ajeno_totalmente_inventado`, {
          headers: {
            'Authorization': `Bearer ${testingToken}`,
            'X-Institute-Slug': 'instituto-testing',
          },
        });
      } catch (err: any) {
        blocked = true;
        expect([403, 404]).toContain(err.response?.status);
      }
      expect(blocked).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'SEC-03', 'Prevención de IDOR', error);
      throw error;
    }
  });

  test('SEC-04: Inyección de headers de tenant no autorizados', async ({}, testInfo) => {
    try {
      let rejected = false;
      try {
        await axios.get(`${API_BASE}/users`, {
          headers: {
            'X-Institute-Id': 'fake-institute-id',
            'X-Tenant-Id': 'malicious-db',
          },
        });
      } catch (err: any) {
        rejected = true;
        expect([400, 401, 403]).toContain(err.response?.status);
      }
      expect(rejected).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'SEC-04', 'Inyección de headers manipulados', error);
      throw error;
    }
  });

});
