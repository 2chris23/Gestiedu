const { chromium } = require('@playwright/test');
const path = require('path');

async function checkEndToEnd() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

  console.log('1. Navegando al login de SuperAdmin...');
  await page.goto('http://localhost:3000/superadmin/login', { waitUntil: 'networkidle' });
  await page.fill('#email', 'admin@tuapp.com');
  await page.fill('#password', 'SuperAdmin2026!');
  await page.click('button[type="submit"]');

  console.log('2. Esperando navegación automática al Dashboard...');
  await page.waitForURL('**/superadmin/dashboard', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(scratchDir, 'e2e_dashboard_real_user_flow.png'), fullPage: true });
  console.log('Captura Dashboard tomada exitosamente!');

  console.log('3. Navegando a Institutos...');
  await page.click('a[href="/superadmin/institutes"]');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(scratchDir, 'e2e_institutes_real_user_flow.png'), fullPage: true });
  console.log('Captura Institutos tomada exitosamente!');

  await browser.close();
}

checkEndToEnd();
