const { chromium } = require('playwright');
const path = require('path');

async function main() {
    const artifactDir = 'C:\\Users\\Windows\\.gemini\\antigravity\\brain\\8c1b2dc6-a50e-4383-b634-7e7bed3ed663';
    console.log('🚀 Iniciando validación en navegador con Playwright...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // 1. Probar http://localhost:3000/login directo (debe mostrar 404)
    console.log('Test 1: http://localhost:3000/login directo...');
    await page.goto('http://localhost:3000/login');
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    const is404 = content.includes('404') || content.includes('Página no encontrada');
    console.log('¿Muestra 404?:', is404 ? 'SÍ (CORRECTO)' : 'NO (FALLA)');
    await page.screenshot({ path: path.join(artifactDir, 'verify_login_404.png') });

    // 2. Probar http://localhost:3000/ (Landing Page)
    console.log('Test 2: http://localhost:3000/ Landing Page...');
    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(3000);
    const title = await page.title();
    console.log('Título de la Landing Page:', title);
    await page.screenshot({ path: path.join(artifactDir, 'verify_landing_page.png') });

    // 3. Probar scroll hasta los dispositivos 3D
    const devSection = await page.$('#dispositivos');
    if (devSection) {
        await devSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(artifactDir, 'verify_landing_devices_3d.png') });
    }

    // 4. Probar http://localhost:3000/login?slug=instituto-testing
    console.log('Test 3: Login de instituto con slug...');
    await page.goto('http://localhost:3000/login?slug=instituto-testing');
    await page.waitForTimeout(3000);
    const instTitle = await page.title();
    console.log('Título en instituto-testing:', instTitle);
    await page.screenshot({ path: path.join(artifactDir, 'verify_instituto_login.png') });

    // 5. Volver a http://localhost:3000/ y comprobar que se limpia
    console.log('Test 4: Volver a Landing Page y verificar aislamiento...');
    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(2000);
    const cleanTitle = await page.title();
    console.log('Título al regresar a Landing:', cleanTitle);
    await page.screenshot({ path: path.join(artifactDir, 'verify_landing_clean_return.png') });

    await browser.close();
    console.log('🎉 Todas las verificaciones terminadas exitosamente.');
}

main().catch(err => {
    console.error('Error en verificación:', err);
    process.exit(1);
});
