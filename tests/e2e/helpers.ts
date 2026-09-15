import { Page, TestInfo } from '@playwright/test';
import axios from 'axios';
import { Client } from 'pg';

export const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
export const WEB_BASE = process.env.WEB_BASE || 'http://localhost:3000';
export const TENANT_SLUG = 'instituto-testing';
export const DB_CONNECTION_STRING =
  process.env.TEST_DB_URL ||
  'postgresql://postgres:82nQKb95S7wNDmuxyvIG6dOYkZUo@localhost:5432/tenant_instituto_testing';

export interface LoginResult {
  user: any;
  accessToken: string;
  refreshToken: string;
}

import * as fs from 'fs';
import * as path from 'path';

const CACHE_FILE = path.join(__dirname, '.auth-tokens.json');

function readTokenCache(): Record<string, LoginResult & { timestamp: number }> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeTokenCache(cache: Record<string, LoginResult & { timestamp: number }>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {}
}

/**
 * Autentica un usuario vía API directa para setups rápidos de tests.
 * Utiliza caché persistente en disco compartido entre todos los workers de Playwright.
 */
export async function loginApi(
  email: string,
  password = 'password123',
  rememberMe = true,
  slug = TENANT_SLUG,
  forceNew = false
): Promise<LoginResult> {
  const cacheKey = `${email}:${slug}`;
  const diskCache = readTokenCache();

  if (!forceNew && diskCache[cacheKey]) {
    const entry = diskCache[cacheKey];
    // Válido por 20 minutos
    if (Date.now() - entry.timestamp < 20 * 60 * 1000) {
      return {
        user: entry.user,
        accessToken: entry.accessToken,
        refreshToken: entry.refreshToken,
      };
    }
  }

  // En testing-institute las contraseñas son 123456 por default
  const pwd = password === 'password123' ? '123456' : password;
  
  let res;
  let retries = 5;
  while (retries > 0) {
    try {
      res = await axios.post(
        `${API_BASE}/auth/login`,
        {
          email,
          password: pwd,
          rememberMe,
          keepSession: rememberMe,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Institute-Slug': slug,
          },
        }
      );
      break;
    } catch (err: any) {
      if (err.response?.status === 429 && retries > 1) {
        // Si hay rate limit, esperar 3 segundos
        await new Promise((r) => setTimeout(r, 3000));
        retries--;
      } else {
        throw err;
      }
    }
  }

  const tokens = res!.data.tokens || res!.data;
  const result: LoginResult = {
    user: res!.data.user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };

  const updatedCache = readTokenCache();
  updatedCache[cacheKey] = { ...result, timestamp: Date.now() };
  writeTokenCache(updatedCache);

  return result;
}

/**
 * Inyecta las cookies de sesión en el contexto del navegador para acceder directamente a rutas protegidas.
 */
export async function injectSessionCookies(
  page: Page,
  tokens: { accessToken: string; refreshToken: string; user?: any },
  slug = TENANT_SLUG
) {
  const domain = 'localhost';
  await page.context().addCookies([
    {
      name: 'access_token',
      value: tokens.accessToken,
      domain,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'refresh_token',
      value: tokens.refreshToken,
      domain,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'institute_slug',
      value: slug,
      domain,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'user_data',
      value: JSON.stringify(tokens.user || { role: 'ADMIN' }),
      domain,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Login completo a través de la UI del navegador.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password = 'password123',
  slug = TENANT_SLUG
) {
  const pwd = password === 'password123' ? '123456' : password;

  /**
   * ENTRAR SIN QUE EL LÍMITE DE INTENTOS ESTORBE
   *
   * El sistema limita los logins a 10 por minuto por cuenta y dirección. Está
   * bien y tiene que quedarse: es lo que frena a quien prueba contraseñas.
   *
   * Pero varias tandas seguidas entran como el mismo admin muchas más veces que
   * eso en un minuto, sin que nadie esté abusando de nada. Cuando el sistema
   * responde "Too Many Requests" no es un fallo que haya que dar por bueno: es
   * el sistema haciendo su trabajo, y aquí se espera a que se suelte.
   *
   * `loginApi` ya lo hacía; esto es lo mismo para quien entra por el formulario.
   * Sin ello, las pruebas de sesión fallan de forma intermitente según cuántos
   * archivos se corran juntos, que es el peor tipo de fallo: el que parece del
   * producto y no lo es.
   */
  const VENTANA_DEL_LIMITE_MS = 60_000;
  const finalizarAntesDe = Date.now() + VENTANA_DEL_LIMITE_MS + 20_000;

  for (;;) {
    await page.goto(`${WEB_BASE}/login?slug=${slug}`);
    await page.waitForSelector('input[type="email"], input[name="email"]');

    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', pwd);

    /**
     * EL 429 SE MIRA EN LA RESPUESTA, NO EN LA PANTALLA.
     *
     * Antes se buscaba el texto "Too Many Requests" en la página. Si el
     * formulario enseña su propio aviso —"no se pudo entrar"— el texto no
     * aparece, la espera no se activa y la prueba muere por tiempo... pareciendo
     * un fallo del producto. Es justo el peor tipo de fallo intermitente: el que
     * acusa a quien no fue.
     *
     * La respuesta del servidor no deja lugar a dudas.
     */
    const respuestaDelLogin = page
      .waitForResponse(
        (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
        { timeout: 20000 }
      )
      .catch(() => null);

    await page.click('button[type="submit"]');
    const respuesta = await respuestaDelLogin;
    const frenadoPorElLimite = respuesta?.status() === 429;

    if (!frenadoPorElLimite) {
      await page.waitForURL('**/dashboard**', { timeout: 15000 });
      return;
    }

    if (Date.now() > finalizarAntesDe) {
      throw new Error(
        `El sistema sigue frenando los intentos de entrar de ${email} después de ` +
        `esperar la ventana entera. No es un fallo del producto: son demasiadas ` +
        `entradas seguidas con la misma cuenta en esta tanda.`
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/**
 * Ejecuta una consulta SQL directa contra la base de datos del tenant de prueba.
 */
export async function queryTenantDb<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const client = new Client({ connectionString: DB_CONNECTION_STRING });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    await client.end();
  }
}

/**
 * Captura evidencia personalizada para reportes de QA en caso de fallo.
 */
export async function captureEvidence(
  testInfo: TestInfo,
  page: Page | null,
  caseId: string,
  description: string,
  error: any
) {
  console.error(`[FALLO QA] Caso: ${caseId} — ${description}`);
  console.error(`Detalle del error:`, error?.message || error);

  if (page) {
    try {
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${caseId}_fallo.png`, {
        body: screenshot,
        contentType: 'image/png',
      });
    } catch (sErr) {
      console.error(`No se pudo capturar screenshot para ${caseId}:`, sErr);
    }
  }

  await testInfo.attach(`${caseId}_error.json`, {
    body: JSON.stringify(
      {
        caseId,
        description,
        timestamp: new Date().toISOString(),
        error: error?.message || String(error),
        stack: error?.stack,
      },
      null,
      2
    ),
    contentType: 'application/json',
  });
}
