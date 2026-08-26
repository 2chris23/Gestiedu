
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const userCount = await prisma.user.count();
        console.log(`Total users in DB: ${userCount}`);

        const users = await prisma.user.findMany({
            select: { id: true, email: true, firstName: true, role: true, instituteId: true }
        });
        console.log('Users found:', JSON.stringify(users, null, 2));

        const institutes = await prisma.institute.findMany();
        console.log('Institutes:', JSON.stringify(institutes, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
