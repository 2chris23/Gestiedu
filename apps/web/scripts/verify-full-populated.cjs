const { chromium } = require('@playwright/test');
const path = require('path');

async function testFullExperience() {
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

  console.log('2. Vista de Ciclo Académico (Secciones A, B, C, D por cada Año)...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/academico/2026-2027', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_full_cycle_sections.png'), fullPage: true });

  console.log('3. Vista de 1er Año A (30 Estudiantes)...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/academico/2026-2027/1er-ano-a', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_full_1a_students.png'), fullPage: true });

  console.log('4. Pestaña Materias...');
  await page.click('button:has-text("Materias")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_full_1a_materias.png'), fullPage: true });

  console.log('5. Pestaña Calificaciones...');
  await page.click('button:has-text("Calificaciones")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_full_1a_calificaciones.png'), fullPage: true });

  console.log('Todas las capturas verificadas exitosamente!');
  await browser.close();
}

testFullExperience();
