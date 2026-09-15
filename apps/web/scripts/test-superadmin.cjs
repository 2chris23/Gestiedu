const { chromium } = require('@playwright/test');
const path = require('path');

async function testSuperAdminDashboard() {
    console.log('🚀 Iniciando test visual de SuperAdmin Dashboard...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

    try {
        console.log('1. Navegando al login de SuperAdmin...');
        await page.goto('http://localhost:3000/superadmin/login', { waitUntil: 'networkidle' });
        await page.fill('input[type="email"], input[name="email"], input[placeholder*="correo" i], input[placeholder*="email" i]', 'admin@tuapp.com');
        await page.fill('input[type="password"]', 'SuperAdmin2026!');
        await page.click('button:has-text("Ingresar"), button[type="submit"]');

        console.log('2. Esperando carga del Dashboard de SuperAdmin...');
        await page.waitForURL('http://localhost:3000/superadmin/dashboard', { timeout: 20000, waitUntil: 'commit' });
        await page.waitForTimeout(3000);

        console.log('3. Tomando captura del Dashboard...');
        await page.screenshot({ path: path.join(scratchDir, 'superadmin_dashboard_metrics_fixed.png'), fullPage: true });
        console.log('🎉 Captura tomada con éxito!');
    } catch (e) {
        console.error('Error durante el test:', e);
        await page.screenshot({ path: path.join(scratchDir, 'superadmin_error.png'), fullPage: true });
    } finally {
        await browser.close();
    }
}

testSuperAdminDashboard();
