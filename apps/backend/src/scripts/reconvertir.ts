/**
 * EL BOLÍVAR PIERDE CEROS: PASAR UN LICEO AL CONO NUEVO
 *
 *   npm run reconvertir -- --liceo=<slug> --factor=1000000            (solo mira)
 *   npm run reconvertir -- --liceo=<slug> --factor=1000000 --aplicar  (lo hace)
 *
 * Antes de `--aplicar`, un respaldo de ese liceo: es la única vuelta atrás.
 * Qué toca y por qué: `services/reconversion.service.ts` y `MAPA` §8b.
 */
import 'dotenv/config';
import { platformPrisma, getTenantPrisma, disconnectAll } from '../config/database';
import { conLiceo } from '../config/ambito-del-liceo';
import { reconvertirBolivares } from '../services/reconversion.service';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];

async function main(): Promise<number> {
    const slug = arg('liceo');
    const factor = Number(arg('factor'));
    const aplicar = process.argv.includes('--aplicar');
    if (!slug || !factor) {
        console.error('Uso: npm run reconvertir -- --liceo=<slug> --factor=1000000 [--aplicar]');
        return 1;
    }
    const liceo = await platformPrisma.institute.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!liceo) {
        console.error(`No existe el liceo ${slug}`);
        return 1;
    }
    const informe = await conLiceo(liceo.id, async () => reconvertirBolivares(await getTenantPrisma(liceo.id), factor, { aplicar }));
    console.log(`${liceo.name}: ÷ ${factor} — ${aplicar ? 'APLICADO' : 'solo se miró (añade --aplicar)'}`);
    for (const [tabla, n] of Object.entries(informe.filas)) if (n > 0) console.log(`  ${tabla.padEnd(28)} ${n} filas`);
    if (informe.tasasDiminutas > 0) console.log(`  Ojo: ${informe.tasasDiminutas} tasas viejas quedan en 0,0001 (eran menores que el factor).`);
    return 0;
}

main()
    .then(async (c) => {
        await disconnectAll();
        process.exit(c);
    })
    .catch(async (e) => {
        console.error(e instanceof Error ? e.message : e);
        await disconnectAll();
        process.exit(1);
    });
