import { FastifyReply, FastifyRequest } from 'fastify';
import { cuadroGeneralDeLaSeccion } from '../services/cuadro-general.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * CONTROLADOR DE MI SECCIÓN GUÍA Y CUADRO GENERAL
 *
 * GET /api/classrooms/mis-secciones-guia
 * GET /api/classrooms/:id/cuadro-general?periodId=...
 */

export async function obtenerMisSeccionesGuia(
    request: FastifyRequest,
    reply: FastifyReply
) {
    try {
        const prisma = request.tenantPrisma;
        const userId = (request.user as any)?.userId ?? (request.user as any)?.id;
        const role = (request.user as any)?.role;

        const where: any = role === 'ADMIN' ? {} : { teacherId: userId };

        const classrooms = await prisma.classroom.findMany({
            where,
            include: {
                academicYear: {
                    select: { id: true, name: true, status: true, startDate: true, endDate: true },
                },
                _count: {
                    select: { studentClassrooms: { where: { isActive: true } } },
                },
            },
            orderBy: [
                { academicYear: { startDate: 'desc' } },
                { grade: 'asc' },
                { section: 'asc' },
            ],
        });

        const formato = classrooms.map((c) => ({
            id: c.id,
            name: c.name,
            grade: c.grade,
            section: c.section,
            shift: c.shift,
            slug: c.slug,
            academicYear: c.academicYear,
            studentCount: c._count.studentClassrooms,
        }));

        return reply.status(200).send({
            success: true,
            classrooms: formato,
        });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function obtenerCuadroGeneral(
    request: FastifyRequest<{
        Params: { id: string };
        Querystring: { periodId?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const prisma = request.tenantPrisma;
        const userId = String((request.user as any)?.userId ?? (request.user as any)?.id ?? '');
        const userRole = String((request.user as any)?.role ?? '');
        const { id: classroomId } = request.params;
        const { periodId } = request.query;

        const data = await cuadroGeneralDeLaSeccion(prisma, {
            classroomId,
            periodId: periodId || undefined,
            userId,
            userRole,
        });

        return reply.status(200).send({
            success: true,
            data,
        });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
