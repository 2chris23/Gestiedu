import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/tenant_san_miguel' } } });

async function main() {
  const classrooms = await db.classroom.findMany({
    include: {
      academicYear: true
    }
  });
  
  for (const c of classrooms) {
    console.log(`Classroom: ${c.name} - AcademicYearId: ${c.academicYearId}`);
    if (c.academicYear) {
      const periods = await db.period.findMany({ where: { academicYearId: c.academicYearId! } });
      console.log(`   -> Periods: ${periods.length}`);
    } else {
      console.log(`   -> NO ACADEMIC YEAR`);
    }
  }
}

main().catch(console.error).finally(() => db.$disconnect());
