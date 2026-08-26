import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:postgres@localhost:5432/tenant_san_miguel'
      }
    }
  });
  try {
    console.log('--- INTENTANDO CREAR PERÍODOS EN tenant_san_miguel ---');
    const academicYear = await db.academicYear.findFirst();
    if (!academicYear) {
      console.log('No se encontró año académico.');
      return;
    }

    console.log(`Año académico encontrado: ${academicYear.name} (ID: ${academicYear.id})`);
    
    const start = new Date(academicYear.startDate);
    const end = new Date(academicYear.endDate);
    const totalDuration = end.getTime() - start.getTime();
    const periodDuration = totalDuration / 3;

    const p1Start = new Date(start);
    const p1End = new Date(start.getTime() + periodDuration);
    
    const p2Start = new Date(p1End.getTime() + 24 * 60 * 60 * 1000);
    const p2End = new Date(start.getTime() + 2 * periodDuration);
    
    const p3Start = new Date(p2End.getTime() + 24 * 60 * 60 * 1000);
    const p3End = new Date(end);

    const periodNames = ['Primer Lapso', 'Segundo Lapso', 'Tercer Lapso'];
    const periodDates = [
      { start: p1Start, end: p1End },
      { start: p2Start, end: p2End },
      { start: p3Start, end: p3End },
    ];

    for (let i = 0; i < 3; i++) {
      console.log(`Creando período ${periodNames[i]}...`);
      const p = await db.period.create({
        data: {
          name: periodNames[i],
          startDate: periodDates[i].start,
          endDate: periodDates[i].end,
          isActive: i === 0,
          academicYearId: academicYear.id,
        }
      });
      console.log(`Creado con éxito:`, p);
    }

  } catch (error) {
    console.error('ERROR DETECTADO AL CREAR PERÍODOS:', error);
  } finally {
    await db.$disconnect();
  }
}

main();
