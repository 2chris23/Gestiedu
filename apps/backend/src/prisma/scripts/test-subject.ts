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
    
    const cs = await db.classroomSubject.findFirst({
        where: { classroomId }
    });
    
    if (cs) {
        console.log(`classroomId: ${cs.classroomId}`);
        console.log(`subjectId: ${cs.subjectId}`);
    } else {
        console.log("No subjects assigned to this classroom");
    }

  } finally {
    await db.$disconnect();
  }
}

main().catch(console.error);
