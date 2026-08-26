import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

// Connect to tenant_san_miguel
const url = 'postgresql://postgres:postgres@localhost:5432/tenant_san_miguel';
const db = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const classroomId = "cmpltkidd000avv4wb31dnzwf";
  const subjectId = "cmpnb3ixr0000vv6oo0azgfw2";
  const lapso = '1';

  console.log("Checking ClassroomSubject:", { classroomId, subjectId });
  const cs = await db.classroomSubject.findUnique({
    where: { classroomId_subjectId: { classroomId, subjectId } }
  });

  if (!cs) {
    console.log("=> ERROR: ClassroomSubject does not exist for this classroom and subject!");
    
    // Check if subject exists
    const subject = await db.subject.findUnique({ where: { id: subjectId }});
    console.log("Subject exists?", !!subject);
    
    // Check if classroom exists
    const classroom = await db.classroom.findUnique({ where: { id: classroomId }});
    console.log("Classroom exists?", !!classroom);
  } else {
    console.log("=> ClassroomSubject EXISTS.");
  }

  // Also check if the period exists
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    include: {
      academicYear: {
        include: { periods: { orderBy: { startDate: 'asc' } } }
      }
    }
  });

  if (classroom?.academicYear) {
      console.log("Periods in Academic Year:", classroom.academicYear.periods.length);
      const activePeriods = classroom.academicYear.periods;
      const lapsoIndex = parseInt(lapso) - 1;
      const period = activePeriods[lapsoIndex];
      if (period) {
          const start = new Date(period.startDate);
          const end = new Date(period.endDate);
          const diffMs = end.getTime() - start.getTime();
          const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
          console.log("=> LAPSO WEEKS WOULD BE:", Math.max(1, diffWeeks));
      } else {
          console.log("=> ERROR: Period not found for index", lapsoIndex);
      }
  } else {
      console.log("=> ERROR: No Academic Year linked to Classroom.");
  }
}

main().catch(console.error).finally(() => db.$disconnect());
