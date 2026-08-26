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
    const classrooms = await db.classroom.findMany();
    console.log(JSON.stringify(classrooms, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
