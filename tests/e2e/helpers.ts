import { Page, TestInfo } from '@playwright/test';
import axios from 'axios';
import { Client } from 'pg';

export const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
export const WEB_BASE = process.env.WEB_BASE || 'http://localhost:3000';
export const TENANT_SLUG = 'instituto-testing';
/**
 * DÓNDE VIVE EL LICEO DE PRUEBAS (2026-10-04)
 *
 * Antes: una dirección fija a su base propia, con la contraseña escrita aquí
 * (y el repositorio es público). Desde que los liceos pueden vivir en un
 * esquema de una base compartida, se le pregunta a la plataforma: su base,
 * sus credenciales y su esquema. `TEST_DB_URL` sigue mandando si está puesta.
 */
function platformUrl(): string {
  if (process.env.PLATFORM_DATABASE_URL) return process.env.PLATFORM_DATABASE_URL;
  const env = fs.readFileSync(path.join(__dirname, '..', '..', 'apps', 'backend', '.env'), 'utf8');
  const linea = env.split(/\r?\n/).find((l) => l.startsWith('PLATFORM_DATABASE_URL='));
  if (!linea) throw new Error('Falta PLATFORM_DATABASE_URL (apps/backend/.env)');
  return linea.slice('PLATFORM_DATABASE_URL='.length).trim().replace(/^"|"$/g, '').split('?')[0];
}

let dondeVive: Promise<{ url: string; schema: string | null }> | null = null;
function liceoDePrueba() {
  if (process.env.TEST_DB_URL) return Promise.resolve({ url: process.env.TEST_DB_URL, schema: null });
  dondeVive ??= (async () => {
    const plat = new Client({ connectionString: platformUrl() });
    await plat.connect();
    try {
      const { rows } = await plat.query(
        `SELECT "databaseName", "databaseSchema", "databaseHost", "databasePort", "databaseUser", "databasePassword"
           FROM institutes WHERE slug = $1`,
        [TENANT_SLUG]
      );
      const r = rows[0];
      if (!r) throw new Error(`El liceo de pruebas (${TENANT_SLUG}) no está en la plataforma`);
      const url = `postgresql://${encodeURIComponent(r.databaseUser)}:${encodeURIComponent(r.databasePassword)}@${r.databaseHost}:${r.databasePort ?? 5432}/${r.databaseName}`;
      return { url, schema: r.databaseSchema as string | null };
    } finally {
      await plat.end();
    }
  })();
  return dondeVive;
}

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

  /**
   * LA LLAVE GUARDADA SE CAMBIA ANTES DE PRESTARLA
   *
   * El sistema cambia la llave de volver a entrar cada vez que se usa
   * (rotación, ver `auth.service.refreshToken`). Guardar una en disco y
   * repartirla a cinco pruebas significa repartir CINCO veces la misma llave de
   * un solo uso: la primera la gasta y a las demás el servidor les dice, con
   * razón, que no vale. La pantalla entonces cierra la sesión y rebota a
   * entrar, y salían catorce pruebas en rojo por algo que el producto hace
   * bien.
   *
   * Así que la guardada se cambia AQUÍ, por una nueva, antes de prestarla: es
   * una petición barata que no cuenta para el límite de intentos de entrada
   * —que es justo para lo que existe esta memoria—. Si esa llave ya no sirve,
   * se entra de nuevo por la puerta.
   */
  if (!forceNew && diskCache[cacheKey]) {
    const entry = diskCache[cacheKey];
    // Válido por 20 minutos
    if (Date.now() - entry.timestamp < 20 * 60 * 1000) {
      try {
        const renovada = await axios.post(
          `${API_BASE}/auth/refresh-token`,
          { refreshToken: entry.refreshToken },
          { headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': slug } }
        );
        const recien: LoginResult = {
          user: entry.user,
          accessToken: renovada.data.accessToken,
          refreshToken: renovada.data.refreshToken || entry.refreshToken,
        };
        const cacheAlDia = readTokenCache();
        cacheAlDia[cacheKey] = { ...recien, timestamp: entry.timestamp };
        writeTokenCache(cacheAlDia);
        return recien;
      } catch {
        // La llave guardada ya no sirve: se entra de nuevo, más abajo.
      }
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
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });

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
      await page.waitForURL('**/dashboard**', { timeout: 30000 });
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
  const { url, schema } = await liceoDePrueba();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (schema) {
      if (!/^[a-z0-9_]{1,63}$/.test(schema)) throw new Error(`Esquema no válido: ${schema}`);
      await client.query(`SET search_path TO "${schema}"`);
    }
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

/**
 * El representante de prueba con un representado (est0575): el de la base
 * no tiene ninguno. Si hay que poner el vínculo, `quitar()` lo deja como estaba.
 */
export async function representanteConUnHijo(): Promise<{ correo: string; quitar: () => Promise<void> }> {
  const correo = 'tutor.prueba@testing.edu.ve';
  const [par] = await queryTenantDb<{ sid: string; tid: string; vinculado: boolean }>(
    `SELECT s.id AS sid, t.id AS tid,
            EXISTS (SELECT 1 FROM student_tutors st WHERE st."studentId" = s.id AND st."tutorId" = t.id) AS vinculado
       FROM users s, users t
      WHERE s.email = 'est0575@testing.edu.ve' AND t.email = $1`,
    [correo]
  );
  if (!par || par.vinculado) return { correo, quitar: async () => {} };
  await queryTenantDb(
    `INSERT INTO student_tutors (id, "studentId", "tutorId", relationship, "createdAt", "updatedAt") VALUES ($1, $2, $3, 'Madre', now(), now())`,
    [`c${Date.now()}vinculo`, par.sid, par.tid]
  );
  return {
    correo,
    quitar: async () => {
      await queryTenantDb(`DELETE FROM student_tutors WHERE "studentId" = $1 AND "tutorId" = $2`, [par.sid, par.tid]).catch(() => undefined);
    },
  };
}
