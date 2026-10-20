/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';

/**
 * Obtener resumen de horarios por ciclo escolar
 */
export async function getScheduleSummary(
    request: FastifyRequest<{ Params: { academicYearId: string } }>,
    reply: FastifyReply
) {
    try {
        const { academicYearId } = request.params;
        const prisma = request.tenantPrisma;

        const classrooms = await prisma.classroom.findMany({
            where: { academicYearId },
            include: {
                teacher: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                subjects: {
                    include: {
                        subject: { select: { id: true, name: true } },
                        teacher: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                        scheduleBlocks: { select: { id: true } },
                    },
                },
            },
            orderBy: [{ grade: 'asc' }, { section: 'asc' }],
        });

        // Build section summaries
        const sections = classrooms.map(classroom => {
            const totalWeeklyBlocks = classroom.subjects.reduce((sum: number, cs: any) => sum + (cs.weeklyBlocks || 0), 0);
            const assignedBlocks = classroom.subjects.reduce((sum: number, cs: any) => sum + (cs.scheduleBlocks?.length || 0), 0);

            return {
                id: classroom.id,
                name: classroom.name,
                slug: classroom.slug,
                grade: classroom.grade,
                section: classroom.section,
                teacher: classroom.teacher,
                subjectCount: classroom.subjects.length,
                totalWeeklyBlocks,
                assignedBlocks,
                completionPercent: totalWeeklyBlocks > 0 ? Math.round((assignedBlocks / totalWeeklyBlocks) * 100) : 0,
            };
        });

        // Build teacher summaries
        const teacherMap = new Map<string, any>();
        classrooms.forEach((classroom: any) => {
            classroom.subjects.forEach((cs: any) => {
                if (cs.teacher) {
                    const existing = teacherMap.get(cs.teacher.id) || {
                        id: cs.teacher.id,
                        firstName: cs.teacher.firstName,
                        lastName: cs.teacher.lastName,
                        avatar: cs.teacher.avatar,
                        sections: new Set<string>(),
                        totalBlocks: 0,
                        totalHours: 0,
                    };
                    existing.sections.add(classroom.name);
                    existing.totalBlocks += cs.scheduleBlocks?.length || 0;
                    existing.totalHours += cs.hoursPerWeek || 0;
                    teacherMap.set(cs.teacher.id, existing);
                }
            });
        });

        const teachers = Array.from(teacherMap.values()).map((t: any) => ({
            id: t.id,
            firstName: t.firstName,
            lastName: t.lastName,
            avatar: t.avatar,
            sections: Array.from(t.sections),
            sectionCount: t.sections.size,
            totalBlocks: t.totalBlocks,
            totalHours: parseFloat(t.totalHours.toFixed(1)),
        }));

        return reply.status(200).send({ sections, teachers });
    } catch (error) {
        logger.error('Error getting schedule summary', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al obtener resumen de horarios' });
    }
}

/**
 * Obtener historial de clases por fecha
 */
export async function getClassSessionsByDate(
    request: FastifyRequest<{ Params: { classroomId: string }; Querystring: { date?: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const queryDateStr = request.query.date;
        const prisma = request.tenantPrisma;

        if (!queryDateStr) {
            return reply.status(400).send({ error: 'Fecha no proporcionada' });
        }

        const date = new Date(queryDateStr);
        if (isNaN(date.getTime())) {
            return reply.status(400).send({ error: 'Fecha inválida' });
        }

        // "YYYY-MM-DD" se interpreta como medianoche UTC, y las sesiones se buscan
        // por rango UTC (más abajo), así que el día de la semana TAMBIÉN tiene que
        // salir en UTC. Con getDay() (hora local), en America/Caracas (UTC-4) el
        // lunes daba domingo: el historial mostraba el horario del día anterior.
        const dayOfWeek = date.getUTCDay();

        // 1. Get schedule for this day of week
        const scheduledBlocks = await prisma.scheduleBlock.findMany({
            where: {
                classroomId,
                dayOfWeek,
            },
            include: {
                classroomSubject: {
                    include: {
                        subject: { select: { id: true, name: true, color: true } },
                        teacher: { select: { id: true, firstName: true, lastName: true } }
                    }
                }
            },
            orderBy: { startTime: 'asc' }
        });

        // 2. Get recorded sessions for this specific date
        // Since we store date as Date object, we might need a range query to match the whole day
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const recordedSessions = await prisma.classSession.findMany({
            where: {
                classroomId,
                date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: {
                subject: { select: { id: true, name: true, color: true } }
            }
        });

        // Map recorded sessions by subjectId for easy matching
        const sessionMap = new Map();
        recordedSessions.forEach((session: any) => {
            sessionMap.set(session.subjectId, session);
        });

        // Combine
        const combined = scheduledBlocks.map((block: any) => {
            const subjectId = block.classroomSubject?.subject?.id;
            const session = subjectId ? sessionMap.get(subjectId) : null;
            
            return {
                blockId: block.id,
                startTime: block.startTime,
                endTime: block.endTime,
                subject: block.classroomSubject?.subject,
                teacher: block.classroomSubject?.teacher,
                // Una sesión SUSPENDED existe pero la clase no se dio: antes se
                // marcaba como registrada solo por existir, y el historial
                // pintaba en verde las clases que suspendió un evento.
                isRecorded: !!session && session.status !== 'SUSPENDED',
                isSuspended: session?.status === 'SUSPENDED',
                suspendedReason: session?.status === 'SUSPENDED' ? session.suspendedReason ?? null : null,
                sessionInfo: session ? {
                    id: session.id,
                    topic: session.topic,
                    observations: session.observations,
                    startTime: session.startTime,
                    endTime: session.endTime
                } : null
            };
        });

        // Also include sessions that were recorded but not in the schedule (extra classes)
        const scheduledSubjectIds = new Set(scheduledBlocks.map((b: any) => b.classroomSubject?.subject?.id).filter(Boolean));
        const extraSessions = recordedSessions
            .filter((session: any) => !scheduledSubjectIds.has(session.subjectId))
            .map((session: any) => ({
                blockId: null,
                startTime: session.startTime || '00:00',
                endTime: session.endTime || '00:00',
                subject: session.subject,
                teacher: null, // Hard to fetch without classroomSubject but possible if we query more
                isRecorded: session.status !== 'SUSPENDED',
                isSuspended: session.status === 'SUSPENDED',
                suspendedReason: session.status === 'SUSPENDED' ? session.suspendedReason ?? null : null,
                isExtra: true,
                sessionInfo: {
                    id: session.id,
                    topic: session.topic,
                    observations: session.observations,
                    startTime: session.startTime,
                    endTime: session.endTime
                }
            }));

        const result = [...combined, ...extraSessions].sort((a, b) => a.startTime.localeCompare(b.startTime));

        return reply.status(200).send(result);
    } catch (error) {
        logger.error('Error getting class sessions by date', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({ error: 'Error al obtener historial de clases' });
    }
}
