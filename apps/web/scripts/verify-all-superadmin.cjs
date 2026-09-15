const { chromium } = require('@playwright/test');
const path = require('path');

async function checkBothPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

  try {
    console.log('Login SuperAdmin...');
    await page.goto('http://localhost:3000/superadmin/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="correo" i], input[placeholder*="email" i]', 'admin@tuapp.com');
    await page.fill('input[type="password"]', 'SuperAdmin2026!');
    await page.click('button:has-text("Ingresar"), button[type="submit"]');

    await page.waitForURL('http://localhost:3000/superadmin/dashboard', { timeout: 20000, waitUntil: 'commit' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(scratchDir, 'verify_superadmin_dashboard.png'), fullPage: true });
    console.log('Dashboard capturado!');

    console.log('Navegando a Institutos...');
    await page.goto('http://localhost:3000/superadmin/institutes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(scratchDir, 'verify_superadmin_institutes.png'), fullPage: true });
    console.log('Institutos capturado!');
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

checkBothPages();
