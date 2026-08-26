
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAllYears() {
    try {
        const { count } = await prisma.academicYear.deleteMany({});
        console.log(`Deleted ${count} academic years.`);
    } catch (error) {
        console.error('Error deleting years:', error);
    } finally {
        await prisma.$disconnect();
    }
}

deleteAllYears();
