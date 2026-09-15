const { chromium } = require('@playwright/test');
const path = require('path');

async function runVisualAudit() {
    console.log('🚀 Iniciando Auditoría Visual E2E con @playwright/test...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const scratchDir = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663/scratch';

    try {
        console.log('1. Navegando al login general...');
        await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

        console.log('2. Ingresando credenciales de Administrador...');
        const slugInput = await page.$('input[placeholder*="slug" i], input[placeholder*="san-miguel" i], input[name="slug"]');
        if (slugInput) {
            await slugInput.fill('instituto-testing');
        }

        await page.fill('input[placeholder*="correo" i], input[type="email"], input[name="email"]', 'admin@tuapp.com');
        await page.fill('input[type="password"]', '123456');
        
        await page.click('button:has-text("Ingresar"), button[type="submit"]');

        console.log('   Esperando carga del dashboard...');
        await page.waitForURL('http://localhost:3000/dashboard', { timeout: 20000, waitUntil: 'commit' });
        await page.waitForTimeout(3000);
        console.log('   Logueado exitosamente en:', page.url());
        await page.screenshot({ path: path.join(scratchDir, 'audit_step1_dashboard.png'), fullPage: true });

        console.log('3. Navegando al Ciclo Académico 2026-2027...');
        await page.goto('http://localhost:3000/dashboard/academico/2026-2027', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(scratchDir, 'audit_step2_academic_cycle.png'), fullPage: true });

        console.log('4. Navegando al Panel de Promoción y Materias Pendientes...');
        await page.goto('http://localhost:3000/dashboard/academico/2026-2027/promocion', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3500);
        await page.screenshot({ path: path.join(scratchDir, 'audit_step3_promotion_screen.png'), fullPage: true });

        console.log('5. Filtrando por Materias Pendientes...');
        const pendingFilterBtn = await page.$('button:has-text("Con Pendientes")');
        if (pendingFilterBtn) {
            await pendingFilterBtn.click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: path.join(scratchDir, 'audit_step4_filtered_pendientes.png'), fullPage: true });
        }

        console.log('6. Abriendo Modal de Acta de Compromiso de Arrastre...');
        const actaBtn = await page.$('button:has-text("Acta de Arrastre")');
        if (actaBtn) {
            console.log('   Encontrado botón de Acta de Arrastre, abriendo modal...');
            await actaBtn.click();
            await page.waitForTimeout(1500);
            await page.screenshot({ path: path.join(scratchDir, 'audit_step5_acta_arrastre_modal.png') });
        }

        console.log('🎉 Auditoría visual completada con éxito!');
    } catch (e) {
        console.error('Error durante la auditoría visual:', e);
        await page.screenshot({ path: path.join(scratchDir, 'audit_error.png'), fullPage: true });
    } finally {
        await browser.close();
    }
}

runVisualAudit();
