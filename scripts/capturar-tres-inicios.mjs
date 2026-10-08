import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const ARTIFACT_DIR = 'C:/Users/Windows/.gemini/antigravity/brain/8c1b2dc6-a50e-4383-b634-7e7bed3ed663';
const FOTOS_DIR = resolve('docs/antigravity/fotos');

mkdirSync(FOTOS_DIR, { recursive: true });

const USERS = [
    { email: 'profesor3@testing.edu.ve', pass: '123456', name: 'inicio-profesor3' },
    { email: 'est0575@testing.edu.ve', pass: '123456', name: 'inicio-est0575' },
    { email: 'tutor.prueba@testing.edu.ve', pass: '123456', name: 'inicio-tutor.prueba' },
];

async function main() {
    const browser = await chromium.launch({ headless: true });
    
    for (const u of USERS) {
        console.log(`Capturando inicio de ${u.email}...`);
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            hasTouch: true,
            isMobile: true,
        });
        const page = await context.newPage();

        // Login
        await page.goto('http://localhost:3000/login?slug=instituto-testing');
        await page.waitForLoadState('networkidle');

        await page.fill('input[type="email"], input[name="email"]', u.email);
        await page.fill('input[type="password"], input[name="password"]', u.pass);
        await page.click('button[type="submit"]');

        await page.waitForURL('**/dashboard**', { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // dejar que rendericen los widgets y peticiones

        const filePath = join(FOTOS_DIR, `${u.name}.png`);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`Guardada en ${filePath}`);

        const artifactPath = join(ARTIFACT_DIR, `${u.name}.png`);
        copyFileSync(filePath, artifactPath);
        console.log(`Copiada a artifact: ${artifactPath}`);

        await context.close();
    }

    await browser.close();
    console.log('Capturas completadas con éxito.');
}

main().catch((err) => {
    console.error('Error al capturar:', err);
    process.exit(1);
});
