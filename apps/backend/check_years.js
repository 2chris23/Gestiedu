
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAcademicYears() {
    try {
        const years = await prisma.academicYear.findMany();
        console.log('Academic Years:', years);
    } catch (error) {
        console.error('Error fetching academic years:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkAcademicYears();
