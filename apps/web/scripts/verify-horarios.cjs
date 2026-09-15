const { chromium } = require('@playwright/test');
const path = require('path');

async function testHorarioPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

  console.log('1. Login en instituto-testing...');
  await page.goto('http://instituto-testing.localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('#email', 'admin@tuapp.com');
  await page.fill('#password', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  console.log('2. Navegando al Editor de Horario (1er Año A)...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/horario/2026-2027/1er-ano-a', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_horario_editor_fixed.png'), fullPage: true });

  console.log('3. Navegando al listado de Horarios (/dashboard/horarios)...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/horarios', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_horarios_list_fixed.png'), fullPage: true });

  console.log('Verificación completada!');
  await browser.close();
}

testHorarioPage();
