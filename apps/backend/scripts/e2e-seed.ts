/**
 * e2e-seed.ts
 *
 * Seed auxiliar para E2E: crea/actualiza el SuperAdmin en la BD de plataforma.
 * La BD tenant se siembra con `npm run db:seed` (seed.ts) antes de este script
 * en la cadena del webServer de Playwright.
 *
 * Uso (desde apps/backend):
 *   PLATFORM_DATABASE_URL=... npx tsx scripts/e2e-seed.ts
 */
import { platformPrisma } from '../src/config/database';
import * as bcrypt from 'bcrypt';

const EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@gestion.com';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Admin123!';
const NAME = process.env.SUPERADMIN_NAME || 'Super Admin';

async function main() {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    const existing = await platformPrisma.superAdmin.findUnique({
        where: { email: EMAIL },
    });

    if (existing) {
        await platformPrisma.superAdmin.update({
            where: { email: EMAIL },
            data: { password: passwordHash, name: NAME, isActive: true },
        });
        console.log(`[e2e-seed] SuperAdmin actualizado: ${EMAIL}`);
    } else {
        await platformPrisma.superAdmin.create({
            data: { email: EMAIL, password: passwordHash, name: NAME, isActive: true },
        });
        console.log(`[e2e-seed] SuperAdmin creado: ${EMAIL}`);
    }

    await platformPrisma.$disconnect();
    console.log('[e2e-seed] OK');
}

main().catch(async (error) => {
    console.error('[e2e-seed] Error:', error);
    process.exit(1);
});