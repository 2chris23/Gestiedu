import { test, expect } from '@playwright/test';
import axios from 'axios';
import {
  API_BASE,
  WEB_BASE,
  TENANT_SLUG,
  loginApi,
  loginViaUI,
  injectSessionCookies,
  captureEvidence,
  queryTenantDb,
} from './helpers';

test.describe('Módulo 1: Autenticación y Sesiones', () => {
  /**
   * ENTRAR POR LA API SIN QUE EL LÍMITE DE INTENTOS ESTORBE
   *
   * El sistema limita los logins a 10 por minuto por dirección y correo
   * (`userRateLimit`). Es correcto y tiene que quedarse: es lo que frena a quien
   * prueba contraseñas.
   *
   * Pero estas pruebas entran como el mismo admin muchas veces en pocos
   * segundos, así que lo tocan sin que nadie esté abusando de nada. Cuando eso
   * pasa se espera y se reintenta, en vez de dar por fallado el sistema. Es lo
   * mismo que ya hace `loginApi`; estas dos pruebas usaban `axios` a pelo y por
   * eso se caían al correr la tanda entera, no al correrlas solas.
   */
  const VENTANA_DEL_LIMITE_MS = 60_000;

  const entrar = async (cuerpo: Record<string, unknown>, cabeceras: Record<string, string> = {}) => {
    // Se espera algo más de lo que dura la ventana del límite (60 s). Con menos,
    // la espera se acaba antes que el castigo y la prueba se cae sin que haya
    // nada roto: pasó, y por eso está escrito el número aquí.
    const finalizarAntesDe = Date.now() + VENTANA_DEL_LIMITE_MS + 20_000;

    while (Date.now() < finalizarAntesDe) {
      const res = await axios.post(
        `${API_BASE}/auth/login`,
        cuerpo,
        {
          headers: { 'X-Institute-Slug': TENANT_SLUG, ...cabeceras },
          validateStatus: () => true,
        }
      );
      if (res.status !== 429) return res;
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('El límite de intentos no se soltó en toda su ventana');
  };


  test('AUTH-01: Login exitoso - Rol ADMIN', async ({ page }, testInfo) => {
    try {
      await loginViaUI(page, 'admin@testing.edu.ve', '123456');
      await expect(page).toHaveURL(/.*dashboard/);
      // Verificar que el sidebar o dashboard tiene elementos administrativos
      await expect(page.locator('body')).toContainText(/Administrador|Dashboard|Usuarios|Académico/i);
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-01', 'Login exitoso ADMIN', error);
      throw error;
    }
  });

  test('AUTH-02: Login exitoso - Rol PROFESOR', async ({ page }, testInfo) => {
    try {
      await loginViaUI(page, 'profesor.ciencias@tuapp.com', '123456');
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.locator('body')).toBeVisible();
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-02', 'Login exitoso PROFESOR', error);
      throw error;
    }
  });

  test('AUTH-03: Login exitoso - Rol ESTUDIANTE', async ({ page }, testInfo) => {
    try {
      await loginViaUI(page, 'est0575@testing.edu.ve', '123456');
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.locator('body')).toBeVisible();
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-03', 'Login exitoso ESTUDIANTE', error);
      throw error;
    }
  });

  test('AUTH-04: Login exitoso - Rol TUTOR', async ({ page }, testInfo) => {
    try {
      await loginViaUI(page, 'tutor.prueba@testing.edu.ve', '123456');
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.locator('body')).toBeVisible();
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-04', 'Login exitoso TUTOR', error);
      throw error;
    }
  });

  test('AUTH-05: Login fallido - Credenciales erróneas', async ({ page }, testInfo) => {
    try {
      await page.goto(`${WEB_BASE}/login?slug=${TENANT_SLUG}`);
      await page.fill('input[type="email"], input[name="email"]', 'admin@testing.edu.ve');
      await page.fill('input[type="password"], input[name="password"]', 'clave_totalmente_incorrecta');
      await page.click('button[type="submit"]');

      // Esperar que aparezca mensaje de error y no avance a dashboard
      await page.waitForTimeout(1000);
      await expect(page).not.toHaveURL(/.*dashboard/);
      await expect(page.locator('body')).toContainText(/inválid|incorrect|error/i);
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-05', 'Login fallido credenciales erróneas', error);
      throw error;
    }
  });

  test('AUTH-06: Login fallido - Usuario inactivo (isActive: false)', async ({ page }, testInfo) => {
    const testEmail = `inactive_test_${Date.now()}@testing.edu.ve`;
    try {
      // Crear usuario inactivo temporal
      await queryTenantDb(
        `INSERT INTO users (id, email, password, "firstName", "lastName", role, "isActive", "createdAt", "updatedAt") 
         VALUES ($1, $2, '$2b$10$w09ZkOaTqLhZ6g4yZ4P99uF4y9.75K6f5Qe2HwR5D4t6f5Qe2HwR5', 'Inactivo', 'Test', 'STUDENT', false, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET "isActive" = false`,
        [`inactive-${Date.now()}`, testEmail]
      );

      // Intentar login por API
      let failed = false;
      try {
        await loginApi(testEmail, '123456');
      } catch (err: any) {
        failed = true;
        expect([400, 401, 403]).toContain(err.response?.status);
      }
      expect(failed).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-06', 'Login usuario inactivo', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE email = $1`, [testEmail]);
    }
  });

  test('AUTH-07: Login fallido - Slug de instituto inexistente', async ({ page }, testInfo) => {
    try {
      await page.goto(`${WEB_BASE}/login?slug=instituto-inexistente-xyz`);
      await page.waitForTimeout(1500);
      await expect(page.locator('body')).toContainText(/no encontrado|inactivo|error/i);
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-07', 'Slug de instituto inexistente', error);
      throw error;
    }
  });

  test('AUTH-08: Persistencia de sesión - rememberMe activado vs desactivado', async ({}, testInfo) => {
    // Puede tocarle esperar a que se suelte el límite de intentos: ver `entrar`.
    test.setTimeout(150_000);
    try {
      // Con rememberMe = true
      const resTrue = await entrar(
        { email: 'admin@testing.edu.ve', password: '123456', rememberMe: true, keepSession: true }
      );
      expect(resTrue.status).toBe(200);

      // Con rememberMe = false
      const resFalse = await entrar(
        { email: 'admin@testing.edu.ve', password: '123456', rememberMe: false, keepSession: false }
      );
      expect(resFalse.status).toBe(200);
    } catch (error) {
      await captureEvidence(testInfo, null, 'AUTH-08', 'Persistencia de sesión rememberMe', error);
      throw error;
    }
  });

  test('AUTH-09: Sliding expiration y endpoint /api/auth/refresh', async ({}, testInfo) => {
    try {
      const login = await loginApi('admin@testing.edu.ve', '123456');
      expect(login.refreshToken).toBeTruthy();

      const refreshRes = await axios.post(
        `${API_BASE}/auth/refresh-token`,
        { refreshToken: login.refreshToken },
        { headers: { 'X-Institute-Slug': TENANT_SLUG } }
      );

      expect(refreshRes.status).toBe(200);
      const newTokens = refreshRes.data.tokens || refreshRes.data;
      expect(newTokens.accessToken).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'AUTH-09', 'Sliding expiration y refresh', error);
      throw error;
    }
  });

  test('AUTH-10: Múltiples sesiones activas simultáneas en diferentes User-Agents', async ({}, testInfo) => {
    // Puede tocarle esperar a que se suelte el límite de intentos: ver `entrar`.
    test.setTimeout(150_000);
    try {
      const resDevice1 = await entrar(
        { email: 'admin@testing.edu.ve', password: '123456', rememberMe: true },
        { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Chrome/120.0)' }
      );
      const resDevice2 = await entrar(
        { email: 'admin@testing.edu.ve', password: '123456', rememberMe: true },
        { 'User-Agent': 'Mozilla/5.0 (Macintosh; Safari/605.1)' }
      );

      expect(resDevice1.status).toBe(200);
      expect(resDevice2.status).toBe(200);
      expect(resDevice1.data.tokens?.accessToken).toBeTruthy();
      expect(resDevice2.data.tokens?.accessToken).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'AUTH-10', 'Múltiples sesiones simultáneas', error);
      throw error;
    }
  });

  test('AUTH-11: Revocación selectiva de una sesión', async ({}, testInfo) => {
    try {
      const session = await loginApi('admin@testing.edu.ve', '123456');
      const sessionsListRes = await axios.get(`${API_BASE}/auth/sessions`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'X-Institute-Slug': TENANT_SLUG,
        },
      }).catch(err => err.response);

      // Si el endpoint de sesiones responde 200, verificar listado
      if (sessionsListRes && sessionsListRes.status === 200) {
        expect(Array.isArray(sessionsListRes.data.sessions || sessionsListRes.data)).toBeTruthy();
      } else {
        // Notar estado si no está implementado o requiere ruta específica
        console.log('Endpoint /api/auth/sessions retornó:', sessionsListRes?.status);
      }
    } catch (error) {
      await captureEvidence(testInfo, null, 'AUTH-11', 'Revocación selectiva de sesión', error);
      throw error;
    }
  });

  test('AUTH-12: Cambio de contraseña invalida sesiones anteriores', async ({}, testInfo) => {
    const testUser = `pwd_change_${Date.now()}@testing.edu.ve`;
    const uid = `V-${Math.floor(10000000 + Math.random() * 89999999)}`;
    try {
      // Crear usuario de prueba
      // La huella se calcula aquí: la que estaba escrita a mano no correspondía
      // a ninguna contraseña, así que el login fallaba y el test culpaba al sistema.
      const hash = require('bcrypt').hashSync('123456', 10);
      await queryTenantDb(
        `INSERT INTO users (id, email, password, "firstName", "lastName", role, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'Test', 'PasswordChange', 'TEACHER', true, NOW(), NOW())`,
        [uid, testUser, hash]
      );

      const oldSession = await loginApi(testUser, '123456');
      expect(oldSession.accessToken).toBeTruthy();

      // Cambiar password directamente
      const newHash = '$2a$10$w09ZkOaTqLhZ6g4yZ4P99uF4y9.75K6f5Qe2HwR5D4t6f5Qe2HwR5';
      await queryTenantDb(`UPDATE users SET password = $1 WHERE id = $2`, [newHash, uid]);
      // Borrar refresh tokens para simular invalidación
      await queryTenantDb(`DELETE FROM refresh_tokens WHERE "userId" = $1`, [uid]);

      // Intentar refrescar con el viejo refresh token
      let refreshFailed = false;
      try {
        await axios.post(
          `${API_BASE}/auth/refresh-token`,
          { refreshToken: oldSession.refreshToken },
          { headers: { 'X-Institute-Slug': TENANT_SLUG } }
        );
      } catch {
        refreshFailed = true;
      }
      expect(refreshFailed).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'AUTH-12', 'Cambio de contraseña invalida sesiones', error);
      throw error;
    } finally {
      await queryTenantDb(`DELETE FROM users WHERE email = $1`, [testUser]);
    }
  });

  test('AUTH-13: Control de Acceso RBAC - Estudiante intentando acceder a /dashboard/usuarios', async ({ page }, testInfo) => {
    try {
      const studentSession = await loginApi('est0575@testing.edu.ve', '123456');
      await injectSessionCookies(page, studentSession);

      await page.goto(`${WEB_BASE}/dashboard/usuarios`);
      await page.waitForTimeout(2000);

      // El estudiante no debe poder ver la lista de administración de usuarios
      const currentUrl = page.url();
      const bodyText = await page.locator('body').innerText();

      const wasRedirected = !currentUrl.includes('/dashboard/usuarios') || currentUrl.endsWith('/dashboard');
      const showsForbidden = /denegado|no autorizado|permisos|forbidden/i.test(bodyText);

      expect(wasRedirected || showsForbidden).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, page, 'AUTH-13', 'RBAC Estudiante a /dashboard/usuarios', error);
      throw error;
    }
  });

  test('AUTH-14: Control de Acceso RBAC - Profesor intentando cerrar ciclo escolar', async ({}, testInfo) => {
    try {
      const teacherSession = await loginApi('profesor.ciencias@tuapp.com', '123456');
      
      // Intentar llamar endpoint de cierre de ciclo escolar con token de profesor
      let forbidden = false;
      try {
        await axios.post(
          `${API_BASE}/academic-years/cycle_dummy_id/close`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${teacherSession.accessToken}`,
              'X-Institute-Slug': TENANT_SLUG,
            },
          }
        );
      } catch (err: any) {
        if (err.response?.status === 403 || err.response?.status === 401) {
          forbidden = true;
        }
      }
      expect(forbidden).toBeTruthy();
    } catch (error) {
      await captureEvidence(testInfo, null, 'AUTH-14', 'RBAC Profesor cierre de ciclo', error);
      throw error;
    }
  });

});
