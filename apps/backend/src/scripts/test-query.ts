import { platformPrisma, getTenantPrisma, disconnectAll } from '../config/database';

async function testQuery() {
  const institutes = await platformPrisma.institute.findMany({ where: { status: 'ACTIVE' } });
  const tenantPrisma = await getTenantPrisma(institutes[0].id);

  const classrooms = await tenantPrisma.classroom.findMany({
    include: {
      studentClassrooms: {
        where: { isActive: true },
        include: {
          student: {
            include: {
              grades: true,
            }
          }
        }
      }
    }
  });

  console.log(JSON.stringify(classrooms, null, 2));

  await disconnectAll();
}

testQuery().catch(console.error);
