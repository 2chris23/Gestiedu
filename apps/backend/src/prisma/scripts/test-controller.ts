import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/tenant_san_miguel' } } });

async function main() {
  const classroomId = "cmpltkidd000avv4wb31dnzwf";
  const subjectId = "cmpnb3ixr0000vv6oo0azgfw2";
  const lapso = '1';

  const autoPopulated: any = {};

  try {
    const classroomSubject = await db.classroomSubject.findUnique({
      where: { classroomId_subjectId: { classroomId, subjectId } },
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        subject: { select: { name: true, color: true } },
        classroom: {
          select: {
            name: true, grade: true, section: true,
            academicYearId: true,
            institute: {
              select: { name: true, logo: true, ministryLogo: true, ministryText: true }
            }
          }
        }
      }
    });

    if (classroomSubject) {
      const c = classroomSubject.classroom;
      if (c?.academicYearId) {
        const academicYear = await db.academicYear.findUnique({
          where: { id: c.academicYearId },
          include: { periods: { orderBy: { startDate: 'asc' } } }
        });

        if (academicYear) {
          autoPopulated.academicYearName = academicYear.name;
          let activePeriods = academicYear.periods || [];
          const lapsoIndex = parseInt(lapso) - 1;
          const period = activePeriods[lapsoIndex];
          if (period) {
            autoPopulated.lapsoStartDate = period.startDate;
            autoPopulated.lapsoEndDate = period.endDate;
            const start = new Date(period.startDate);
            const end = new Date(period.endDate);
            const diffMs = end.getTime() - start.getTime();
            const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
            autoPopulated.lapsoWeeks = Math.max(1, diffWeeks);
          } else {
            console.log("No period found for index", lapsoIndex);
          }
        }
      }
    } else {
      console.log("ClassroomSubject not found");
    }
  } catch (err) {
    console.error("Error:", err);
  }

  console.log(JSON.stringify(autoPopulated, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
