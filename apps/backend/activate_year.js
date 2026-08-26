
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function activateYear() {
    try {
        const updated = await prisma.academicYear.update({
            where: { id: 'ay_2024_2025' },
            data: { status: 'ACTIVE' }
        });
        console.log('Updated Year:', updated);
    } catch (error) {
        console.error('Error updating year:', error);
    } finally {
        await prisma.$disconnect();
    }
}

activateYear();
