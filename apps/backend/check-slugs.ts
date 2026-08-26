import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSlugs() {
    const subjects = await prisma.subject.findMany({
        select: {
            id: true,
            name: true,
            slug: true
        }
    });

    console.log('Subjects in database:');
    console.log(JSON.stringify(subjects, null, 2));

    await prisma.$disconnect();
}

checkSlugs();
