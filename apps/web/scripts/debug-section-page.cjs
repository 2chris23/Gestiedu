const { chromium } = require('@playwright/test');
const path = require('path');

async function testSectionPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

  // Listen to console errors and network failures
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('response', resp => {
    if (resp.status() >= 400) {
      console.log('HTTP ERROR:', resp.status(), resp.url());
    }
  });

  console.log('1. Login en instituto-testing...');
  await page.goto('http://instituto-testing.localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('#email', 'admin@tuapp.com');
  await page.fill('#password', '123456');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard', { timeout: 15000 });
  console.log('2. Logueado! Navegando a la sección...');
  
  await page.goto('http://instituto-testing.localhost:3000/dashboard/academico/2026-2027/1er-ano-a', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(scratchDir, 'verify_section_page_debug.png'), fullPage: true });

  console.log('Captura tomada!');
  await browser.close();
}

testSectionPage();
