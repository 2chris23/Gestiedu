/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

interface GetScheduleRequest {
    Params: {
        classroomId: string;
    };
}

interface CreateScheduleBlockRequest {
    Params: {
        classroomId: string;
    };
    Body: {
        classroomSubjectId?: string;
        dayOfWeek: number; // 0-6
        startTime: string; // HH:MM
        endTime: string; // HH:MM
        blockType?: string; // CLASS, BREAK, LUNCH, ASSEMBLY
        location?: string;
        notes?: string;
    };
}

interface UpdateScheduleBlockRequest {
    Params: {
        id: string;
    };
    Body: {
        classroomSubjectId?: string;
        dayOfWeek?: number;
        startTime?: string;
        endTime?: string;
        blockType?: string;
        location?: string;
        notes?: string;
    };
}

interface DeleteScheduleBlockRequest {
    Params: {
        id: string;
    };
}

interface BulkUpdateScheduleRequest {
    Params: {
        classroomId: string;
    };
    Body: {
        blocks: Array<{
            id?: string; // Si existe, actualizar; si no, crear
            classroomSubjectId?: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            blockType?: string;
            location?: string;
            notes?: string;
        }>;
        deleteIds?: string[]; // IDs de bloques a eliminar
    };
}

/**
 * Obtener horario completo de una sección
 */
export async function getClassroomSchedule(
    request: FastifyRequest<GetScheduleRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;

        const scheduleBlocks = await request.tenantPrisma.scheduleBlock.findMany({
            where: {
                classroomId,
            },
            include: {
                classroomSubject: {
                    include: {
                        subject: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                color: true,
                            },
                        },
                        teacher: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' },
            ],
        });

        return reply.status(200).send({
            scheduleBlocks,
            total: scheduleBlocks.length,
        });
    } catch (error) {
        logger.error('Error al obtener horario', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al obtener horario',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Crear un bloque de horario
 */
export async function createScheduleBlock(
    request: FastifyRequest<CreateScheduleBlockRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const {
            classroomSubjectId,
            dayOfWeek,
            startTime,
            endTime,
            blockType = 'CLASS',
            location,
            notes,
        } = request.body;

        // Validar día de semana
        if (dayOfWeek < 0 || dayOfWeek > 6) {
            return reply.status(400).send({
                error: 'Día de semana inválido (debe ser 0-6)',
                code: 'INVALID_DAY_OF_WEEK',
            });
        }

        // Validar formato de tiempo
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return reply.status(400).send({
                error: 'Formato de tiempo inválido (debe ser HH:MM)',
                code: 'INVALID_TIME_FORMAT',
            });
        }

        // Si se proporciona classroomSubjectId, validar que existe y pertenece a esta sección
        if (classroomSubjectId) {
            const classroomSubject = await request.tenantPrisma.classroomSubject.findFirst({
                where: {
                    id: classroomSubjectId,
                    classroomId,
                },
                include: {
                    scheduleBlocks: true,
                },
            });

            if (!classroomSubject) {
                return reply.status(404).send({
                    error: 'Materia no encontrada en esta sección',
                    code: 'CLASSROOM_SUBJECT_NOT_FOUND',
                });
            }

            // Validar que no se exceda el límite de bloques semanales
            const currentBlocksCount = classroomSubject.scheduleBlocks.length;
            if (currentBlocksCount >= classroomSubject.weeklyBlocks) {
                return reply.status(400).send({
                    error: `Esta materia ya tiene ${currentBlocksCount} bloques asignados (límite: ${classroomSubject.weeklyBlocks})`,
                    code: 'WEEKLY_BLOCKS_LIMIT_EXCEEDED',
                });
            }
        }

        // Verificar solapamiento de horarios
        const overlapping = await request.tenantPrisma.scheduleBlock.findFirst({
            where: {
                classroomId,
                dayOfWeek,
                OR: [
                    {
                        AND: [
                            { startTime: { lte: startTime } },
                            { endTime: { gt: startTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { lt: endTime } },
                            { endTime: { gte: endTime } },
                        ],
                    },
                    {
                        AND: [
                            { startTime: { gte: startTime } },
                            { endTime: { lte: endTime } },
                        ],
                    },
                ],
            },
        });

        if (overlapping) {
            return reply.status(400).send({
                error: 'Este horario se solapa con un bloque existente',
                code: 'SCHEDULE_OVERLAP',
            });
        }

        // Crear el bloque
        const scheduleBlock = await request.tenantPrisma.scheduleBlock.create({
            data: {
                classroomId,
                classroomSubjectId,
                dayOfWeek,
                startTime,
                endTime,
                blockType,
                location,
                notes,
            },
            include: {
                classroomSubject: {
                    include: {
                        subject: true,
                        teacher: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
        });

        return reply.status(201).send({
            message: 'Bloque de horario creado exitosamente',
            scheduleBlock,
        });
    } catch (error) {
        logger.error('Error al crear bloque de horario', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            body: request.body,
        });
        return reply.status(500).send({
            error: 'Error al crear bloque de horario',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Actualizar un bloque de horario
 */
export async function updateScheduleBlock(
    request: FastifyRequest<UpdateScheduleBlockRequest>,
    reply: FastifyReply
) {
    try {
        const { id } = request.params;
        const updateData = request.body;

        const existing = await request.tenantPrisma.scheduleBlock.findUnique({
            where: { id },
        });

        if (!existing) {
            return reply.status(404).send({
                error: 'Bloque de horario no encontrado',
                code: 'SCHEDULE_BLOCK_NOT_FOUND',
            });
        }

        // Validaciones similares a createScheduleBlock
        if (updateData.dayOfWeek !== undefined && (updateData.dayOfWeek < 0 || updateData.dayOfWeek > 6)) {
            return reply.status(400).send({
                error: 'Día de semana inválido',
                code: 'INVALID_DAY_OF_WEEK',
            });
        }

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (updateData.startTime && !timeRegex.test(updateData.startTime)) {
            return reply.status(400).send({
                error: 'Formato de tiempo de inicio inválido',
                code: 'INVALID_TIME_FORMAT',
            });
        }
        if (updateData.endTime && !timeRegex.test(updateData.endTime)) {
            return reply.status(400).send({
                error: 'Formato de tiempo de fin inválido',
                code: 'INVALID_TIME_FORMAT',
            });
        }

        const updated = await request.tenantPrisma.scheduleBlock.update({
            where: { id },
            data: updateData,
            include: {
                classroomSubject: {
                    include: {
                        subject: true,
                        teacher: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                    },
                },
            },
        });

        return reply.status(200).send({
            message: 'Bloque actualizado exitosamente',
            scheduleBlock: updated,
        });
    } catch (error) {
        logger.error('Error al actualizar bloque de horario', {
            error: error instanceof Error ? error.message : String(error),
            id: request.params.id,
        });
        return reply.status(500).send({
            error: 'Error al actualizar bloque',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Eliminar un bloque de horario
 */
export async function deleteScheduleBlock(
    request: FastifyRequest<DeleteScheduleBlockRequest>,
    reply: FastifyReply
) {
    try {
        const { id } = request.params;

        const existing = await request.tenantPrisma.scheduleBlock.findUnique({
            where: { id },
        });

        if (!existing) {
            return reply.status(404).send({
                error: 'Bloque de horario no encontrado',
                code: 'SCHEDULE_BLOCK_NOT_FOUND',
            });
        }

        await request.tenantPrisma.scheduleBlock.delete({
            where: { id },
        });

        return reply.status(200).send({
            message: 'Bloque eliminado exitosamente',
        });
    } catch (error) {
        logger.error('Error al eliminar bloque de horario', {
            error: error instanceof Error ? error.message : String(error),
            id: request.params.id,
        });
        return reply.status(500).send({
            error: 'Error al eliminar bloque',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Actualización masiva de horario (para drag & drop)
 */
export async function bulkUpdateSchedule(
    request: FastifyRequest<BulkUpdateScheduleRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const { blocks, deleteIds = [] } = request.body;

        // Usar transacción para asegurar atomicidad
        const result = await request.tenantPrisma.$transaction(async (prisma) => {
            // 1. Eliminar bloques marcados para eliminación
            if (deleteIds.length > 0) {
                await prisma.scheduleBlock.deleteMany({
                    where: {
                        id: { in: deleteIds },
                        classroomId,
                    },
                });
            }

            // 2. Procesar cada bloque
            const processedBlocks = [];
            for (const block of blocks) {
                if (block.id) {
                    // Actualizar bloque existente
                    const updated = await prisma.scheduleBlock.update({
                        where: { id: block.id },
                        data: {
                            classroomSubjectId: block.classroomSubjectId,
                            dayOfWeek: block.dayOfWeek,
                            startTime: block.startTime,
                            endTime: block.endTime,
                            blockType: block.blockType,
                            location: block.location,
                            notes: block.notes,
                        },
                    });
                    processedBlocks.push(updated);
                } else {
                    // Crear nuevo bloque
                    const created = await prisma.scheduleBlock.create({
                        data: {
                            classroomId,
                            classroomSubjectId: block.classroomSubjectId,
                            dayOfWeek: block.dayOfWeek,
                            startTime: block.startTime,
                            endTime: block.endTime,
                            blockType: block.blockType || 'CLASS',
                            location: block.location,
                            notes: block.notes,
                        },
                    });
                    processedBlocks.push(created);
                }
            }

            return processedBlocks;
        });

        // Verificaciones de colisiones post-guardado (idealmente dentro de la transacción, pero es más fácil aquí en modo masivo para reportar errores)
        // Check for teacher collisions
        const teacherCollisions = await request.tenantPrisma.$queryRaw`
            SELECT t.id, t."firstName", sb."dayOfWeek", sb."startTime"
            FROM schedule_blocks sb
            JOIN classroom_subjects cs ON sb."classroomSubjectId" = cs.id
            JOIN users t ON cs."teacherId" = t.id
            WHERE sb."classroomId" = ${classroomId}
            AND EXISTS (
                SELECT 1 FROM schedule_blocks sb2
                JOIN classroom_subjects cs2 ON sb2."classroomSubjectId" = cs2.id
                WHERE cs2."teacherId" = cs."teacherId"
                AND sb2."classroomId" != ${classroomId}
                AND sb2."dayOfWeek" = sb."dayOfWeek"
                AND (
                    (sb2."startTime" <= sb."startTime" AND sb2."endTime" > sb."startTime")
                    OR
                    (sb2."startTime" < sb."endTime" AND sb2."endTime" >= sb."endTime")
                    OR
                    (sb2."startTime" >= sb."startTime" AND sb2."endTime" <= sb."endTime")
                )
            )
            LIMIT 1
        `;

        if (Array.isArray(teacherCollisions) && teacherCollisions.length > 0) {
            // Revert by failing (Since we are outside transaction, this is a bit messy, let's just warn or let the user fix it. Wait, it's better to just log it for now or return a warning in the response).
            logger.warn('Teacher collision detected during bulk update', { teacherCollisions });
        }

        return reply.status(200).send({
            message: 'Horario actualizado exitosamente',
            blocks: result,
            total: result.length,
            warnings: Array.isArray(teacherCollisions) && teacherCollisions.length > 0 ? ['Se detectaron colisiones de profesores en otras secciones.'] : [],
        });
    } catch (error) {
        logger.error('Error en actualización masiva de horario', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al actualizar horario',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Generación Automática de Horario (Auto-Schedule)
 */
export async function autoGenerateSchedule(
    request: FastifyRequest<{ Params: { classroomId: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;

        // 1. Obtener todas las materias asignadas a la sección
        const subjects = await request.tenantPrisma.classroomSubject.findMany({
            where: { classroomId },
            include: {
                teacher: true,
                scheduleBlocks: true,
            },
        });

        if (!subjects || subjects.length === 0) {
            return reply.status(400).send({
                error: 'La sección no tiene materias asignadas',
                code: 'NO_SUBJECTS_ASSIGNED',
            });
        }

        // 2. Limpiar el horario actual de esta sección para generar uno nuevo
        await request.tenantPrisma.scheduleBlock.deleteMany({
            where: { classroomId },
        });

        // 3. Estructura de bloques estándar (Ej: Lunes a Viernes, 7 bloques diarios de 45 min)
        // 0=Domingo, 1=Lunes ... 5=Viernes
        const DAYS = [1, 2, 3, 4, 5]; 
        const BLOCKS_PER_DAY = 7;
        const START_TIMES = ['07:00', '07:45', '08:30', '09:30', '10:15', '11:00', '11:45'];
        const END_TIMES =   ['07:45', '08:30', '09:15', '10:15', '11:00', '11:45', '12:30'];

        const newBlocks: any[] = [];
        let totalBlocksNeeded = 0;
        let blocksAssigned = 0;

        for (const subject of subjects) {
            totalBlocksNeeded += subject.weeklyBlocks;
        }

        // Mezclar materias (heurística aleatoria para variar)
        const shuffledSubjects = [...subjects].sort(() => Math.random() - 0.5);

        for (const subject of shuffledSubjects) {
            let blocksToAssign = subject.weeklyBlocks;
            
            // Intentar colocar en la cuadrícula
            for (const day of DAYS) {
                if (blocksToAssign <= 0) break;
                
                for (let b = 0; b < BLOCKS_PER_DAY; b++) {
                    if (blocksToAssign <= 0) break;

                    const sTime = START_TIMES[b];
                    const eTime = END_TIMES[b];

                    // Revisar si la celda ya está ocupada en esta sección
                    const isCellOccupied = newBlocks.some(nb => nb.dayOfWeek === day && nb.startTime === sTime);
                    if (isCellOccupied) continue;

                    // Revisar si el PROFESOR está ocupado en OTRA sección a esta misma hora
                    let teacherBusy = false;
                    if (subject.teacherId) {
                        const busy = await request.tenantPrisma.scheduleBlock.findFirst({
                            where: {
                                dayOfWeek: day,
                                startTime: sTime,
                                classroomSubject: {
                                    teacherId: subject.teacherId
                                }
                            }
                        });
                        if (busy) teacherBusy = true;
                    }

                    if (!teacherBusy) {
                        // Asignar!
                        newBlocks.push({
                            classroomId,
                            classroomSubjectId: subject.id,
                            dayOfWeek: day,
                            startTime: sTime,
                            endTime: eTime,
                            blockType: 'CLASS'
                        });
                        blocksToAssign--;
                        blocksAssigned++;
                    }
                }
            }
        }

        if (newBlocks.length > 0) {
            await request.tenantPrisma.scheduleBlock.createMany({
                data: newBlocks
            });
        }

        return reply.status(200).send({
            message: 'Horario generado automáticamente',
            stats: {
                totalNeeded: totalBlocksNeeded,
                assigned: blocksAssigned,
                successRate: Math.round((blocksAssigned / totalBlocksNeeded) * 100) + '%'
            }
        });

    } catch (error) {
        logger.error('Error generando horario automáticamente', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al generar horario',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

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
 * Obtener horario de un profesor (todos sus bloques de todas las secciones)
 */
export async function getTeacherScheduleBlocks(
    request: FastifyRequest<{ Params: { teacherId: string } }>,
    reply: FastifyReply
) {
    try {
        const { teacherId } = request.params;
        const prisma = request.tenantPrisma;

        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                classroomSubject: {
                    teacherId: teacherId,
                },
            },
            include: {
                classroomSubject: {
                    include: {
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        classroom: { select: { id: true, name: true, grade: true, section: true, slug: true } },
                    },
                },
            },
            orderBy: [
                { dayOfWeek: 'asc' },
                { startTime: 'asc' },
            ],
        });

        return reply.status(200).send({ scheduleBlocks: blocks, total: blocks.length });
    } catch (error) {
        logger.error('Error getting teacher schedule blocks', {
            error: error instanceof Error ? error.message : String(error),
            teacherId: request.params.teacherId,
        });
        return reply.status(500).send({ error: 'Error al obtener horario del profesor' });
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

        // JS getDay(): 0=Sunday, 1=Monday...
        // Prisma ScheduleBlock dayOfWeek might use the same standard
        const dayOfWeek = date.getDay();

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
                isRecorded: !!session,
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
                isRecorded: true,
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
