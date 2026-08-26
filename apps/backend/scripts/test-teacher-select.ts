// Test script to verify Prisma select is working
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    const user = await prisma.user.findUnique({
        where: { id: '23456789' },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            teacherClassrooms: {
                select: {
                    isMainTeacher: true,
                    classroom: {
                        select: {
                            name: true,
                            grade: true,
                            section: true
                        }
                    }
                }
            }
        }
    });

    console.log('User data:');
    console.log(JSON.stringify(user, null, 2));

    await prisma.$disconnect();
}

test().catch(console.error);
