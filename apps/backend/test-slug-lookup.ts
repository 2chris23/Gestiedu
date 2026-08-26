import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simular la lógica del servicio getSubjectById
async function testSlugLookup() {
    const idOrSlug = 'ciencias-naturales';

    console.log('Testing slug lookup for:', idOrSlug);
    console.log('Contains dash?', idOrSlug.includes('-'));

    // Esta es la lógica exacta del servicio
    const whereClause = idOrSlug.includes('-')
        ? { slug: idOrSlug }
        : { id: idOrSlug };

    console.log('Where clause:', JSON.stringify(whereClause, null, 2));

    try {
        const subject = await prisma.subject.findUnique({
            where: whereClause,
            include: {
                classroomSubjects: {
                    include: {
                        classroom: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                grade: true,
                                _count: {
                                    select: { studentClassrooms: true }
                                }
                            }
                        },
                        teacher: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        },
                        scheduleBlocks: {
                            select: {
                                dayOfWeek: true,
                                startTime: true,
                                endTime: true
                            }
                        }
                    }
                }
            }
        });

        if (!subject) {
            console.log('❌ Subject not found');
        } else {
            console.log('✅ Subject found:', subject.name);
            console.log('Classroom assignments:', subject.classroomSubjects.length);
        }
    } catch (error) {
        console.error('❌ Error:', error);
    }

    await prisma.$disconnect();
}

testSlugLookup();
