const { chromium } = require('@playwright/test');
const path = require('path');

async function testAllFixedViews() {
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

  // 1. Catálogo de Materias
  console.log('2. Catálogo de Materias...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/materias', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_materias_catalog_fixed.png'), fullPage: true });

  // 2. Detalle de una Materia (Arte y Patrimonio)
  console.log('3. Detalle de Materia (Arte y Patrimonio)...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/materias/2026-2027/materia-arte', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_materia_detail_fixed.png'), fullPage: true });

  // 3. Ciclo Escolar con Métricas y 600 alumnos
  console.log('4. Ciclo Escolar 2026-2027...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/academico/2026-2027', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_cycle_stats_fixed.png'), fullPage: true });

  // 4. Perfil de Profesor con acordeón por años, horas y promedios
  console.log('5. Perfil de Profesor (profesor1@testing.edu.ve)...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/usuarios/ch1h15jlsb2hsby4dbew5ci17', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_teacher_profile_grouped_fixed.png'), fullPage: true });

  // 5. Tabla de Estudiantes 1er Año A
  console.log('6. Estudiantes 1er Año A...');
  await page.goto('http://instituto-testing.localhost:3000/dashboard/academico/2026-2027/2026-2027-1-a', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_section_students_fixed.png'), fullPage: true });

  console.log('Todas las capturas verificadas exitosamente!');
  await browser.close();
}

testAllFixedViews();
