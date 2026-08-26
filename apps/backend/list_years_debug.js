
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listYears() {
    try {
        const years = await prisma.academicYear.findMany();
        console.log(JSON.stringify(years, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

listYears();
