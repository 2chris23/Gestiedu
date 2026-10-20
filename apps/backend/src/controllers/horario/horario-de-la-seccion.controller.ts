/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';
import {
    analyzeScheduleConflicts,
    findScheduleConflicts,
    ScheduleConflictError,
} from '../../services/schedule-conflicts.service';
import { assertCanSeeClassroom } from '../../services/authorization.service';
import { elTurnoDeLaSeccion } from '../../services/turnos.service';

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

        /**
         * EL HORARIO DE SU SECCIÓN TAMBIÉN ES SUYO
         *
         * Esta lectura era solo de profesores, así que **el alumno no podía ver
         * su propio horario**: la pantalla salía vacía. Ahora lo ven también el
         * alumno de esa sección y su representante —y ningún otro—, y de paso
         * un profesor ya no puede asomarse al horario de una sección ajena.
         */
        await assertCanSeeClassroom(request.tenantPrisma, request.user as any, classroomId);

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
            // El turno decide a qué hora empieza la rejilla del horario.
            shift: await elTurnoDeLaSeccion(request.tenantPrisma, classroomId),
        });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
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
        // Solo lo que se mueve. Antes iba el cuerpo entero a la base: se podía
        // cambiar la sección o la clase del bloque y la comprobación de choques
        // miraba al profesor de antes (VIEJA-02).
        const b: any = request.body ?? {};
        const updateData: { dayOfWeek?: number; startTime?: string; endTime?: string; location?: string; notes?: string; blockType?: string } = {};
        for (const k of ['dayOfWeek', 'startTime', 'endTime', 'location', 'notes'] as const) if (b[k] !== undefined) (updateData as any)[k] = b[k];

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

        /**
         * MOVER UN BLOQUE TAMBIÉN PUEDE PISAR OTRO
         *
         * Crear un bloque sí comprobaba el solape; moverlo, no. Así que la
         * sección podía terminar con dos clases a la misma hora el mismo día, y
         * el profesor en dos aulas a la vez, sin que nadie avisara: bastaba
         * crear el bloque en un hueco libre y luego arrastrarlo encima de otro.
         * Lo vigila HOR-03.
         *
         * Se usa `findScheduleConflicts`, que es la fuente única de las dos
         * reglas duras del horario (`docs/MAPA_DE_CALCULOS.md`, sección 8):
         * una sección no recibe dos clases a la vez, y un profesor no está en
         * dos sitios a la vez. Comprobarlo aquí a mano habría dejado esta vía
         * con reglas distintas de las otras.
         *
         * Se comprueba contra el día y la hora que quedarían DESPUÉS del
         * cambio, no contra los que tenía: quien mueve solo la hora conserva el
         * día, y al revés.
         */
        const bloqueFinal = {
            id: existing.id,
            classroomId: existing.classroomId,
            classroomSubjectId: existing.classroomSubjectId,
            teacherId: existing.teacherId,
            dayOfWeek: updateData.dayOfWeek ?? existing.dayOfWeek,
            startTime: updateData.startTime ?? existing.startTime,
            endTime: updateData.endTime ?? existing.endTime,
            blockType: updateData.blockType ?? existing.blockType,
        };

        if (bloqueFinal.endTime <= bloqueFinal.startTime) {
            return reply.status(400).send({
                error: 'La hora de fin tiene que ser posterior a la de inicio',
                code: 'INVALID_TIME_RANGE',
            });
        }

        const choques = await findScheduleConflicts(request.tenantPrisma, [bloqueFinal]);

        if (choques.length > 0) {
            return reply.status(400).send({
                error: choques[0].message || 'Este horario se solapa con un bloque existente',
                code: 'SCHEDULE_OVERLAP',
                conflicts: choques,
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

        await borrarGuardandoCopia(request.tenantPrisma, 'scheduleBlock', { id }, quienBorra(request as any));

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
                await borrarGuardandoCopia(
                    prisma,
                    'scheduleBlock',
                    { id: { in: deleteIds }, classroomId },
                    quienBorra(request as any)
                );
            }

            // 2. Validar choques ANTES de escribir. Antes esto se hacía después
            //    de commitear y solo dejaba un warning, así que un horario con el
            //    profesor en dos secciones a la vez se guardaba igual.
            //    Solo bloquean los choques que este guardado CREA o EMPEORA; los
            //    heredados (bloques que no se tocaron) se devuelven como aviso.
            const analysis = await analyzeScheduleConflicts(
                prisma,
                blocks.map((b) => ({ ...b, classroomId })),
                { ignoreBlockIds: deleteIds }
            );
            if (analysis.blocking.length > 0) {
                throw new ScheduleConflictError(analysis.blocking);
            }

            // 3. Procesar cada bloque
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

            return { processedBlocks, preexisting: analysis.preexisting };
        });

        return reply.status(200).send({
            message: 'Horario actualizado exitosamente',
            blocks: result.processedBlocks,
            total: result.processedBlocks.length,
            warnings: result.preexisting.map((c) => c.message),
            preexistingConflicts: result.preexisting,
        });
    } catch (error) {
        if (error instanceof ScheduleConflictError) {
            return reply.status(409).send({
                error: error.message,
                code: error.code,
                conflicts: error.conflicts,
            });
        }
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