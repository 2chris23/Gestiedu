import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('No hay violaciones de accesibilidad en el login SuperAdmin', async ({ page }) => {
    await page.goto('/superadmin/login');
    const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();

    expect(results.violations).toEqual([]);
});

test('No hay violaciones de accesibilidad en el login de instituto', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();

    expect(results.violations).toEqual([]);
});