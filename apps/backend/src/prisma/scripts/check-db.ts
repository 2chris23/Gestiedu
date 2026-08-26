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
    const years = await db.academicYear.findMany({
      include: { periods: true }
    });
    console.log(JSON.stringify(years, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
