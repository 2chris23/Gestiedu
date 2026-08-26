import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const classroomId = "cmpltkidd000avv4wb31dnzwf";
  const lapso = '1';

  const c = await db.classroom.findUnique({
    where: { id: classroomId },
    include: {
      institute: true,
      academicYear: {
        include: { periods: { orderBy: { startDate: 'asc' } } }
      }
    }
  });

  if (!c) {
    console.log("NO CLASSROOM");
    return;
  }

  let activePeriods = c.academicYear?.periods || [];
  console.log("PERIODS IN DB:", activePeriods.length);

  const lapsoIndex = parseInt(lapso) - 1;
  const period = activePeriods[lapsoIndex];

  if (period) {
    console.log("PERIOD DATES:", period.startDate, period.endDate);
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
    console.log("WEEKS:", Math.max(1, diffWeeks));
  } else {
    console.log("NO PERIOD FOR INDEX", lapsoIndex);
  }
}

main().catch(console.error).finally(() => db.$disconnect());
