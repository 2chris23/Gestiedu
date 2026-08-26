import { test, expect, APIResponse } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SUPERADMIN = {
  email: process.env.SUPERADMIN_EMAIL || 'admin@gestion.com',
  password: process.env.SUPERADMIN_PASSWORD || 'Admin123!',
};

const INSTITUTE = {
  slug: 'instituto-educativo-demo',
  email: 'admin@institutodemo.edu',
  password: '123456',
};

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function cookiesToAddCookies(res: APIResponse) {
  const allHeaders = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .join(',');
  if (!allHeaders) return [];
  return allHeaders
    .split(/,(?=\s*[a-zA-Z0-9_]+=)/)
    .map((part) => {
      const m = part.match(/([^=]+)=([^;]*)(.*)/);
      if (!m) return null;
      const name = m[1].trim();
      const value = m[2].trim();
      const attrs = m[3] || '';
      const path = attrs.match(/path=([^;]*)/i)?.[1] || '/';
      const expires = attrs.match(/expires=([^;]+)/i)?.[1];
      return {
        name,
        value,
        path,
        domain: 'localhost',
        expires: expires ? Math.floor(new Date(expires).getTime() / 1000) : undefined,
      };
    })
    .filter(Boolean) as { name: string; value: string; path: string; domain: string; expires?: number }[];
}

test.describe('Flujos autenticados (full-stack)', () => {
  test('SuperAdmin: login por UI -> dashboard + accesibilidad WCAG', async ({ page }) => {
    await page.goto('/superadmin/login');

    await page.fill('#email', SUPERADMIN.email);
    await page.fill('#password', SUPERADMIN.password);
    await Promise.all([
      page.waitForURL('**/superadmin/dashboard', { timeout: 20_000 }),
      page.click('button[type="submit"]'),
    ]);

    await expect(page).toHaveURL(/superadmin\/dashboard/);
    // El dashboard de la plataforma renderiza contenido
    await expect(page.locator('body')).not.toBeEmpty();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('Instituto: login via API real -> dashboard protegido + accesibilidad WCAG', async ({
    page,
    request,
  }) => {
    // Login usando la ruta real del web que proxy al backend y setea cookies de sesión
    const res = await request.post('/api/auth/login', {
      headers: { 'X-Institute-Slug': INSTITUTE.slug },
      data: { email: INSTITUTE.email, password: INSTITUTE.password },
    });
    expect(res.ok()).toBeTruthy();

    const cookies = cookiesToAddCookies(res);
    expect(cookies.some((c) => c.name === 'access_token')).toBeTruthy();
    await page.context().addCookies(cookies);

    // El dashboard está protegido por middleware: con token se renderiza
    await page.goto('/dashboard');
    await expect(page.locator('body')).not.toBeEmpty();

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
