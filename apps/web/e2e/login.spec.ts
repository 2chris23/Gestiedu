import { test, expect } from '@playwright/test';

test.describe('Páginas públicas de login', () => {
    test('SuperAdmin: la página de login se renderiza', async ({ page }) => {
        await page.goto('/superadmin/login');
        await expect(page.getByRole('heading', { name: 'SuperAdmin' })).toBeVisible();
        await expect(page.getByPlaceholder('admin@tuapp.com')).toBeVisible();
        await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    });

    test('Instituto: la página de login se renderiza', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByPlaceholder('ej: san-miguel')).toBeVisible();
        await expect(page.getByPlaceholder('tu@correo.com')).toBeVisible();
    });
});