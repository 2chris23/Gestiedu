import { PrismaClient } from '@prisma/client';
import { UserRole } from '../src/utils/prisma-enums';
import { getDashboardStats } from '../src/controllers/students.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

const prisma = new PrismaClient();

async function verifyDashboard() {
    try {
        console.log('Connecting to database...');
        // Find a student
        const student = await prisma.user.findFirst({
            where: { role: UserRole.STUDENT },
            include: {
                studentClassrooms: {
                    include: { classroom: true }
                }
            }
        });

        if (!student) {
            console.error('No student found in database to test with.');
            return;
        }

        console.log(`Testing with student: ${student.firstName} ${student.lastName} (${student.id})`);

        // Mock Request and Reply
        const req = {
            params: { id: student.id },
            user: { id: student.id, role: 'STUDENT', instituteId: student.instituteId },
            server: { prisma },
            log: console,
        } as unknown as FastifyRequest<{ Params: { id: string } }>;

        const reply = {
            status: (code: number) => {
                console.log(`Response Status: ${code} `);
                return reply;
            },
            send: (payload: any) => {
                console.log('Response Payload:');
                console.dir(payload, { depth: null, colors: true });
                return reply;
            },
        } as unknown as FastifyReply;

        // Call Controller
        console.log('Invoking getDashboardStats...');
        await getDashboardStats(req, reply);

    } catch (error) {
        console.error('Error during verification:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyDashboard();
