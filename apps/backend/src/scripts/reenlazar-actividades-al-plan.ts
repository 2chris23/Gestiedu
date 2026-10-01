/**
 * LAS ACTIVIDADES QUE NO SUMABAN, A SU EVALUACIÓN DEL PLAN
 *
 * Antes de 2026-09-27 una actividad de la segunda semana de una evaluación
 * unida a varias semanas quedaba en una fila vacía y su nota no contaba
 * (`services/evaluacion-de-la-semana.service.ts`). Esto las engancha a la
 * evaluación que cubre su semana, cuando hay UNA sola.
 *
 *   npx tsx src/scripts/reenlazar-actividades-al-plan.ts [slug]            # en seco: solo enseña
 *   npx tsx src/scripts/reenlazar-actividades-al-plan.ts [slug] --aplicar  # lo hace
 *
 * Cambia promedios del lapso: avisar al liceo antes de aplicarlo.
 */
import { getTenantPrisma, platformPrisma, disconnectAll } from '../config/database';
import { reenlazarActividades } from '../services/evaluacion-de-la-semana.service';
import { instituteTimezone } from '../utils/school-time';

async function principal(): Promise<void> {
    const aplicar = process.argv.includes('--aplicar');
    const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
    const liceos = await platformPrisma.institute.findMany({
        where: slug ? { slug } : { status: 'ACTIVE' as any },
        orderBy: { slug: 'asc' },
    });
    for (const liceo of liceos) {
        const prisma = await getTenantPrisma(liceo.id);
        const cambios = await reenlazarActividades(prisma, await instituteTimezone(prisma), aplicar);
        console.log(`${liceo.slug}: ${cambios.length} actividades ${aplicar ? 'enganchadas' : 'por enganchar'}`);
        for (const c of cambios) console.log(`  · ${c.titulo}`);
    }
    if (!aplicar) console.log('\nEn seco: nada cambió. Con --aplicar se hace.');
}

principal()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectAll();
        await platformPrisma.$disconnect();
    });
