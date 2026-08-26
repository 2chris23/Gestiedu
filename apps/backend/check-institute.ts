import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInstitute() {
    try {
        const institute = await prisma.institute.findUnique({
            where: { id: 'institute' }
        });

        console.log('Institute found:', institute);

        if (!institute) {
            console.log('No institute found with ID "institute"');
            console.log('Creating default institute...');

            const newInstitute = await prisma.institute.create({
                data: {
                    id: 'institute',
                    name: 'Instituto Educativo',
                    code: 'INST-001',
                    email: 'info@instituto.edu'
                }
            });

            console.log('Institute created:', newInstitute);
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkInstitute();
