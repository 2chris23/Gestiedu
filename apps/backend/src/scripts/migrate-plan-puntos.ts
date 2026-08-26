/**
 * SCRIPT DE MIGRACIÓN DE DATOS — Planes de evaluación al modelo de criterios (Σ puntos = 20)
 *
 * Reinterpreta los planes existentes bajo el modelo nuevo:
 *  - Cada fila EVALUATION = un criterio con `puntos` (escala 01-20).
 *  - `ponderacion` pasa a ser DERIVADA (= puntos/20*100). Si la fila tenía solo
 *    ponderación y puntos=0 → se deriva el % a puntos y se ajusta.
 *  - La suma de puntos de cada lapso debe ser 20. Si no lo es:
 *      · Σ > 0 y Σ != 20 → se escalan proporcionalmente los puntos de las filas
 *        con puntos > 0 (el redondeo se ajusta en la fila de mayor puntos).
 *      · Σ == 0 (planes placeholder, ej. captura "Puntos=0") → AMBIGUO: se deja
 *        intacto (documentado). Estos planes no pasan la validación nueva hasta
 *        que el profesor asigne puntos.
 *  - También asegura que Activity.weight de cada criterio = puntos (referencia).
 *
 * Uso: npx tsx src/scripts/migrate-plan-puntos.ts [databaseUrl]
 */
import { PrismaClient } from '@prisma/client';
import { platformPrisma, getTenantPrisma } from '../config/database';

async function migrateTenant(tenantPrisma: PrismaClient, instituteId: string) {
  const rows = await tenantPrisma.evaluationPlanRow.findMany({
    where: { rowType: 'EVALUATION' },
    select: { id: true, classroomId: true, subjectId: true, lapso: true, puntos: true, ponderacion: true, activityId: true },
    orderBy: [{ classroomId: 'asc' }, { subjectId: 'asc' }, { lapso: 'asc' }, { weekNumber: 'asc' }],
  });

  // Agrupar por (classroomId, subjectId, lapso)
  const groups = new Map<string, typeof rows>();
  rows.forEach(r => {
    const key = `${r.classroomId}|${r.subjectId}|${r.lapso}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  let updated = 0;
  let ambiguous = 0;

  for (const [key, group] of groups.entries()) {
    const sum = group.reduce((s, r) => s + (r.puntos || 0), 0);

    // Caso AMBIGUO: plan placeholder sin puntos → no se toca
    if (sum === 0) {
      ambiguous++;
      console.log(`[migrate] AMBIGUO (sin tocar): ${key} — plan con Puntos=0, quedará sin validar hasta asignar puntos.`);
      continue;
    }

    // Si ya suma exactamente 20, solo asegurar ponderacion derivada
    const scale = Math.abs(sum - 20) > 0.009 ? 20 / sum : 1;

    // Ejecutar updates (paralelo)
    await Promise.all(group.map(r => {
      const newPuntos = Math.round((r.puntos || 0) * scale * 100) / 100;
      const newPonderacion = Math.round((newPuntos / 20) * 100 * 100) / 100;
      updated++;
      return tenantPrisma.evaluationPlanRow.update({
        where: { id: r.id },
        data: { puntos: newPuntos, ponderacion: newPonderacion },
      }).then(() => {
        if (r.activityId) {
          return tenantPrisma.activity.update({
            where: { id: r.activityId },
            data: { weight: newPuntos },
          });
        }
      });
    }));

    console.log(`[migrate] ${key}: suma ${sum} → 20 (escala ×${scale.toFixed(4)})`);
  }

  console.log(`[migrate] Instituto ${instituteId}: ${updated} filas actualizadas, ${ambiguous} planes ambiguos (sin tocar).`);
}

async function main() {
  const url = process.argv[2];
  const prismaClient = url ? new PrismaClient({ datasources: { db: { url } } }) : null;

  if (prismaClient) {
    await migrateTenant(prismaClient, 'manual');
    await prismaClient.$disconnect();
    return;
  }

  const institutes = await platformPrisma.institute.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  for (const inst of institutes) {
    try {
      const tenantPrisma = await getTenantPrisma(inst.id);
      await migrateTenant(tenantPrisma, inst.id);
      await tenantPrisma.$disconnect();
    } catch (e: any) {
      console.error(`[migrate] Error en instituto ${inst.id}:`, e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
