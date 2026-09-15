const { chromium } = require('@playwright/test');
const path = require('path');

async function testSectionA() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

    try {
        await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
        const slugInput = await page.$('input[placeholder*="slug" i], input[placeholder*="san-miguel" i], input[name="slug"]');
        if (slugInput) await slugInput.fill('instituto-testing');
        await page.fill('input[placeholder*="correo" i], input[type="email"], input[name="email"]', 'admin@tuapp.com');
        await page.fill('input[type="password"]', '123456');
        await page.click('button:has-text("Ingresar"), button[type="submit"]');

        await page.waitForURL('http://localhost:3000/dashboard', { timeout: 20000, waitUntil: 'commit' });
        await page.waitForTimeout(2000);

        await page.goto('http://localhost:3000/dashboard/academico/2026-2027/promocion', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        // Click en Sección A
        console.log('Haciendo clic en Sección A...');
        const secABtn = await page.$('button:has-text("Sección A")');
        if (secABtn) {
            await secABtn.click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: path.join(scratchDir, 'audit_section_a_students.png'), fullPage: true });

            // Verificar si hay botón de Acta de Arrastre
            const actaBtn = await page.$('button:has-text("Acta de Arrastre")');
            if (actaBtn) {
                console.log('Abriendo modal Acta de Arrastre en Sección A...');
                await actaBtn.click();
                await page.waitForTimeout(1000);
                await page.screenshot({ path: path.join(scratchDir, 'audit_acta_arrastre_modal_view.png') });
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testSectionA();
