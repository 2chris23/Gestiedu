import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSubjectAssignments() {
    const subject = await prisma.subject.findUnique({
        where: { slug: 'ciencias-naturales' },
        include: {
            classroomSubjects: {
                include: {
                    classroom: true,
                    teacher: true
                }
            }
        }
    });

    console.log('Subject with assignments:');
    console.log(JSON.stringify(subject, null, 2));

    await prisma.$disconnect();
}

checkSubjectAssignments();
