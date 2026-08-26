import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCreateSubject() {
    try {
        console.log('Attempting to create subject...');

        const subject = await prisma.subject.create({
            data: {
                name: 'Test Matemáticas',
                color: '#ff0000'
            }
        });

        console.log('Subject created successfully:', subject);
    } catch (error) {
        console.error('Error creating subject:');
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

testCreateSubject();
