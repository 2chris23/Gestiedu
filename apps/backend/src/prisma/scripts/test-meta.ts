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
    const classroomId = 'cmpltkidd000avv4wb31dnzwf'; // 1er Año A
    const lapso = '1';

    const classroomSubject = await db.classroomSubject.findFirst({
      where: { classroomId },
      include: {
        teacher: true,
        subject: true,
        classroom: {
          include: {
            institute: true,
            academicYear: {
              include: { periods: { orderBy: { startDate: 'asc' } } }
            }
          }
        }
      }
    });

    if (!classroomSubject) {
        console.log('No classroomSubject found for classroom:', classroomId);
        return;
    }

    const c = classroomSubject.classroom;
    const academicYear = c.academicYear;
    
    let activePeriods = academicYear?.periods || [];
    console.log('Active Periods length:', activePeriods.length);
    
    if (activePeriods.length > 0) {
      const lapsoIndex = parseInt(lapso) - 1;
      const period = activePeriods[lapsoIndex];
      if (period) {
        const start = new Date(period.startDate);
        const end = new Date(period.endDate);
        const diffMs = end.getTime() - start.getTime();
        const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
        console.log('Period:', period.name);
        console.log('Start:', start);
        console.log('End:', end);
        console.log('DiffMs:', diffMs);
        console.log('DiffWeeks:', diffWeeks);
      }
    }
    
  } finally {
    await db.$disconnect();
  }
}

main().catch(console.error);
