import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEnrollments() {
  const students = await prisma.user.findMany({
    include: { studentClassrooms: true, classroom: true }
  });

  for (const student of students) {
    console.log(`Student: ${student.email} (${student.id}) | classroomId: ${student.classroomId} | Enrollments: ${student.studentClassrooms.length}`);
    student.studentClassrooms.forEach(e => {
        console.log(`  - Enrollment: class=${e.classroomId} active=${e.isActive} academicYear=${e.academicYearId}`);
    });
  }
  await prisma.$disconnect();
}

checkEnrollments().catch(e => {
  console.error(e);
  process.exit(1);
});
