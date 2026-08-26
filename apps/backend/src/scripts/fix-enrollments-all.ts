import { platformPrisma, getTenantPrisma, disconnectAll } from '../config/database';

async function fixAllEnrollments() {
  console.log('Starting global enrollment fix...');
  
  try {
    const institutes = await platformPrisma.institute.findMany({
      where: { status: 'ACTIVE' }
    });

    console.log(`Found ${institutes.length} active institutes.`);

    for (const institute of institutes) {
      console.log(`\nProcessing institute: ${institute.name} (${institute.id})`);
      const tenantPrisma = await getTenantPrisma(institute.id);

      const students = await tenantPrisma.user.findMany({
        where: { role: 'STUDENT', classroomId: { not: null } },
        include: { classroom: true, studentClassrooms: true }
      });

      console.log(`  Found ${students.length} students with a classroom assigned.`);
      
      let fixedCount = 0;

      for (const student of students) {
        const classroomId = student.classroomId;
        const classroom = student.classroom;
        if (!classroomId || !classroom) continue;

        const activeEnrollment = student.studentClassrooms.find(e => e.classroomId === classroomId && e.isActive);

        if (!activeEnrollment) {
          console.log(`  Fixing student ${student.email} (${student.id}) -> Section ${classroom.name}`);
          
          await tenantPrisma.$transaction(async (tx) => {
            // Desactivar todas las actuales
            await tx.studentClassroom.updateMany({
              where: { studentId: student.id, isActive: true },
              data: { isActive: false }
            });

            // Reactivar o crear
            const existing = await tx.studentClassroom.findFirst({
              where: { studentId: student.id, classroomId }
            });

            if (existing) {
              await tx.studentClassroom.update({
                where: { id: existing.id },
                data: { isActive: true }
              });
            } else {
              await tx.studentClassroom.create({
                data: {
                  studentId: student.id,
                  classroomId,
                  academicYearId: classroom.academicYearId!,
                  isActive: true
                }
              });
            }
          });
          fixedCount++;
        }
      }
      console.log(`  Fixed ${fixedCount} enrollments for institute ${institute.name}.`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await disconnectAll();
  }
}

fixAllEnrollments().catch(console.error);
