import { platformPrisma, getTenantPrisma, disconnectAll } from '../config/database';

async function run() {
  const institute = await platformPrisma.institute.findFirst();
  if (!institute) throw new Error('No se encontró ningún instituto');
  const t = await getTenantPrisma(institute.id);
  await t.$transaction(async (tx) => {
    await tx.studentClassroom.updateMany({ data: { isActive: false } });
    await tx.studentClassroom.create({
      data: {
        studentId: '234232434',
        classroomId: 'cmpltkidd000avv4wb31dnzwf',
        academicYearId: 'cmpltkdhz0008vv4wdan4erog',
        isActive: true
      }
    });
  });
  console.log('Moved student to 2025-2026');
  await disconnectAll();
}
run();
