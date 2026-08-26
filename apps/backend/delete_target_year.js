
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteYear() {
    try {
        const year = await prisma.academicYear.findFirst({
            where: { name: '2025-2026' }
        });

        if (year) {
            console.log('Found year:', year);
            await prisma.academicYear.delete({
                where: { id: year.id }
            });
            console.log('Deleted year 2025-2026');
        } else {
            console.log('Year 2025-2026 not found');
        }
    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

deleteYear();
