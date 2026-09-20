const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
    const outputDir = path.join(__dirname, '..', 'public', 'screenshots');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('🚀 Iniciando Chromium para captura de pantallas reales...');
    const browser = await chromium.launch({ headless: true });
    
    // 1. Captura Laptop (1440 x 900)
    console.log('📸 Capturando Laptop (Dashboard 1440x900)...');
    const laptopContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
    });
    const laptopPage = await laptopContext.newPage();
    
    // Login en instituto-testing
    await laptopPage.goto('http://localhost:3000/login?slug=instituto-testing');
    await laptopPage.waitForSelector('input[name="email"]');
    await laptopPage.fill('input[name="email"]', 'admin@testing.edu.ve');
    await laptopPage.fill('input[name="password"]', '123456');
    await laptopPage.click('button[type="submit"]');
    
    // Esperar a que entre al dashboard
    await laptopPage.waitForURL('**/dashboard**', { timeout: 15000 });
    await laptopPage.waitForTimeout(3000); // dejar que rendericen gráficos/tablas
    await laptopPage.screenshot({ path: path.join(outputDir, 'system-laptop.png') });
    console.log('✅ system-laptop.png guardado.');

    // Capturar también la vista de horarios (Doble Turno)
    try {
        await laptopPage.goto('http://localhost:3000/dashboard/horarios');
        await laptopPage.waitForTimeout(3000);
        await laptopPage.screenshot({ path: path.join(outputDir, 'system-horarios.png') });
        console.log('✅ system-horarios.png guardado.');
    } catch (e) {
        console.log('Horarios view note:', e.message);
    }

    // 2. Captura Tablet (820 x 1180 - iPad Air)
    console.log('📸 Capturando Tablet (iPad 820x1180)...');
    const tabletContext = await browser.newContext({
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
    });
    const tabletPage = await tabletContext.newPage();
    await tabletPage.goto('http://localhost:3000/login?slug=instituto-testing');
    await tabletPage.waitForSelector('input[name="email"]');
    await tabletPage.fill('input[name="email"]', 'admin@testing.edu.ve');
    await tabletPage.fill('input[name="password"]', '123456');
    await tabletPage.click('button[type="submit"]');
    await tabletPage.waitForURL('**/dashboard**', { timeout: 15000 });
    
    // Navegar a módulo académico o materias
    try {
        await tabletPage.goto('http://localhost:3000/dashboard/academico');
        await tabletPage.waitForTimeout(3000);
        await tabletPage.screenshot({ path: path.join(outputDir, 'system-tablet.png') });
        console.log('✅ system-tablet.png guardado.');
    } catch (e) {
        // Fallback al dashboard en tablet
        await tabletPage.goto('http://localhost:3000/dashboard');
        await tabletPage.waitForTimeout(3000);
        await tabletPage.screenshot({ path: path.join(outputDir, 'system-tablet.png') });
        console.log('✅ system-tablet.png (dashboard) guardado.');
    }

    // 3. Captura Teléfono (390 x 844 - iPhone 14 Pro)
    console.log('📸 Capturando Teléfono (iPhone 390x844)...');
    const phoneContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
    });
    const phonePage = await phoneContext.newPage();
    await phonePage.goto('http://localhost:3000/login?slug=instituto-testing');
    await phonePage.waitForSelector('input[name="email"]');
    await phonePage.fill('input[name="email"]', 'admin@testing.edu.ve');
    await phonePage.fill('input[name="password"]', '123456');
    await phonePage.click('button[type="submit"]');
    await phonePage.waitForURL('**/dashboard**', { timeout: 15000 });
    await phonePage.waitForTimeout(3000);
    await phonePage.screenshot({ path: path.join(outputDir, 'system-phone.png') });
    console.log('✅ system-phone.png guardado.');

    await browser.close();
    console.log('🎉 Todas las capturas de pantalla reales se han completado con éxito.');
}

main().catch(err => {
    console.error('Error capturando pantallas:', err);
    process.exit(1);
});
