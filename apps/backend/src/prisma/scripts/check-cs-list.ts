import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/tenant_san_miguel' } } });

async function main() {
  const classroomId = "cmpltkidd000avv4wb31dnzwf";
  
  const cs = await db.classroomSubject.findMany({
    where: { classroomId },
    include: { subject: true }
  });
  
  console.log("ClassroomSubjects for classroom:", classroomId);
  console.log(cs);
}

main().catch(console.error).finally(() => db.$disconnect());
