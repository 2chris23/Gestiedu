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
        where: { role: 'STUDENT', isActive: true },
        include: { studentClassrooms: { include: { classroom: true } } }
      });

      console.log(`  Found ${students.length} students.`);
      
      let fixedCount = 0;

      for (const student of students) {
        const activeEnrollment = student.studentClassrooms.find(e => e.isActive);
        if (!activeEnrollment) {
          console.log(`  Student ${student.email} has no active enrollment.`);
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
