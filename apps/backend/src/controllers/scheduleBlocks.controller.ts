/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import {
    analyzeScheduleConflicts,
    findScheduleConflicts,
    ScheduleConflictError,
} from '../services/schedule-conflicts.service';
import { assertCanSeeClassroom } from '../services/authorization.service';
import { elTurnoDeLaSeccion } from '../services/turnos.service';

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

/**
 * Generación Automática de Horario (Auto-Schedule)
 */
/**
 * Generación / Ordenamiento al Azar de horario para una sección
 * Reglas fundamentales:
 * 1. Clases SIEMPRE APILADAS consecutivamente desde la 1ra hora (cero huecos / cero horas libres intermedias).
 * 2. Horarios estándar matutinos (07:00 a 12:30 con recreo 09:15-09:30; 4ta hora inicia a las 09:30).
 * 3. Sin colisiones de profesores (un docente no puede estar en dos aulas a la misma hora).
 * 4. Máximo 2 bloques de la misma materia por día.
 */
export async function autoGenerateSchedule(
    request: FastifyRequest<{ Params: { classroomId: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const prisma = request.tenantPrisma;

        // 1. Obtener todas las materias asignadas a la sección
        const subjects = await prisma.classroomSubject.findMany({
            where: { classroomId },
            include: {
                subject: true,
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

        // Estructura de 7 bloques estándar matutinos (Lunes=1 ... Viernes=5)
        const STANDARD_PERIODS = [
            { index: 0, startTime: '07:00', endTime: '07:45' }, // 1ra Hora
            { index: 1, startTime: '07:45', endTime: '08:30' }, // 2da Hora
            { index: 2, startTime: '08:30', endTime: '09:15' }, // 3ra Hora
            // Recreo: 09:15 - 09:30
            { index: 3, startTime: '09:30', endTime: '10:15' }, // 4ta Hora
            { index: 4, startTime: '10:15', endTime: '11:00' }, // 5ta Hora
            { index: 5, startTime: '11:00', endTime: '11:45' }, // 6ta Hora
            { index: 6, startTime: '11:45', endTime: '12:30' }, // 7ma Hora
        ];
        const DAYS = [1, 2, 3, 4, 5];

        // Capacidad matutina máxima: 7 bloques x 5 días = 35
        let totalBlocksNeeded = subjects.reduce((sum, s) => sum + (s.weeklyBlocks || 0), 0);

        // Ajustar bloques si excede los 35 de la jornada matutina
        const adjustedSubjects = subjects.map(s => {
            let blocks = s.weeklyBlocks || 0;
            if (totalBlocksNeeded > 35) {
                blocks = Math.max(1, Math.round((blocks / totalBlocksNeeded) * 35));
            }
            return { ...s, effectiveBlocks: blocks };
        });

        let adjustedTotal = adjustedSubjects.reduce((sum, s) => sum + s.effectiveBlocks, 0);
        while (adjustedTotal > 35) {
            adjustedSubjects.sort((a, b) => b.effectiveBlocks - a.effectiveBlocks);
            adjustedSubjects[0].effectiveBlocks--;
            adjustedTotal--;
        }
        while (adjustedTotal < Math.min(totalBlocksNeeded, 30)) {
            adjustedSubjects.sort((a, b) => a.effectiveBlocks - b.effectiveBlocks);
            adjustedSubjects[0].effectiveBlocks++;
            adjustedTotal++;
        }

        // Distribución diaria APILADA (sin huecos)
        const basePerDay = Math.floor(adjustedTotal / 5);
        const remainder = adjustedTotal % 5;
        const targetSlots: Array<{ day: number; startTime: string; endTime: string }> = [];

        DAYS.forEach((day, idx) => {
            const count = basePerDay + (idx < remainder ? 1 : 0);
            for (let p = 0; p < count; p++) {
                targetSlots.push({
                    day,
                    startTime: STANDARD_PERIODS[p].startTime,
                    endTime: STANDARD_PERIODS[p].endTime,
                });
            }
        });

        // Obtener horarios ocupados de profesores en OTRAS secciones
        // Incluye las horas PERSONALES: no tienen sección, así que un
        // `classroomId: { not }` las dejaba fuera y el generador podía colocar
        // una clase encima de la hora de planificación de un profesor.
        const otherBlocks = await prisma.scheduleBlock.findMany({
            where: { OR: [{ classroomId: { not: classroomId } }, { classroomId: null }] },
            include: { classroomSubject: { select: { teacherId: true } } },
        });

        const teacherBusySet = new Set<string>();
        otherBlocks.forEach(b => {
            // Profesor del bloque: el de su asignación (clase) o el dueño (hora personal)
            const busyTeacher = b.teacherId ?? b.classroomSubject?.teacherId;
            if (busyTeacher) {
                teacherBusySet.add(`${busyTeacher}-${b.dayOfWeek}-${b.startTime}`);
            }
        });

        // Crear pool de unidades de clase
        const unitPool: Array<{
            classroomSubjectId: string;
            subjectId: string;
            subjectName: string;
            teacherId: string | null;
        }> = [];

        adjustedSubjects.forEach(s => {
            for (let i = 0; i < s.effectiveBlocks; i++) {
                unitPool.push({
                    classroomSubjectId: s.id,
                    subjectId: s.subjectId,
                    subjectName: s.subject.name,
                    teacherId: s.teacherId,
                });
            }
        });

        // Heurística de asignación aleatoria con reintentos
        let bestAssignments: any[] | null = null;
        const MAX_ATTEMPTS = 100;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const pool = [...unitPool].sort(() => Math.random() - 0.5);
            const assignments: any[] = [];
            const dailySubjectCount: Record<string, number> = {};
            let success = true;

            for (const slot of targetSlots) {
                let foundIdx = -1;

                for (let i = 0; i < pool.length; i++) {
                    const unit = pool[i];
                    const countKey = `${slot.day}-${unit.subjectId}`;
                    const currentDayCount = dailySubjectCount[countKey] || 0;

                    // Máximo 2 bloques de la misma materia por día
                    if (currentDayCount >= 2) continue;

                    // Verificación de conflicto de profesor
                    if (unit.teacherId && teacherBusySet.has(`${unit.teacherId}-${slot.day}-${slot.startTime}`)) {
                        continue;
                    }

                    foundIdx = i;
                    break;
                }

                if (foundIdx === -1) {
                    success = false;
                    break;
                }

                const chosen = pool.splice(foundIdx, 1)[0];
                const countKey = `${slot.day}-${chosen.subjectId}`;
                dailySubjectCount[countKey] = (dailySubjectCount[countKey] || 0) + 1;

                assignments.push({
                    classroomId,
                    classroomSubjectId: chosen.classroomSubjectId,
                    dayOfWeek: slot.day,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    blockType: 'CLASS',
                });
            }

            if (success) {
                bestAssignments = assignments;
                break;
            }
        }

        // Fallback: si no hay forma de cumplir TODAS las reglas, se relaja solo la
        // blanda ("máximo 2 bloques de la misma materia por día"). La dura —un
        // profesor no puede estar en dos sitios a la vez— NUNCA: antes aquí se
        // colocaba la unidad igual (`pool.pop()`), y así se crearon choques
        // heredados. Lo que no quepa queda sin colocar y se informa.
        let unplacedUnits: typeof unitPool = [];
        if (!bestAssignments) {
            const pool = [...unitPool].sort(() => Math.random() - 0.5);
            const assignments: any[] = [];
            for (const slot of targetSlots) {
                let foundIdx = -1;
                for (let i = 0; i < pool.length; i++) {
                    const unit = pool[i];
                    if (unit.teacherId && teacherBusySet.has(`${unit.teacherId}-${slot.day}-${slot.startTime}`)) {
                        continue;
                    }
                    foundIdx = i;
                    break;
                }
                // Nadie cabe en esta franja sin chocar: queda vacía.
                if (foundIdx === -1) continue;
                const chosen = pool.splice(foundIdx, 1)[0];
                if (chosen) {
                    assignments.push({
                        classroomId,
                        classroomSubjectId: chosen.classroomSubjectId,
                        dayOfWeek: slot.day,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        blockType: 'CLASS',
                    });
                }
            }
            bestAssignments = assignments;
            unplacedUnits = pool;
        }

        // Limpiar horario anterior de esta sección y guardar el nuevo ordenado.
        // El horario viejo se guarda: si el generador automático produce algo peor
        // que lo que había, lo anterior no se ha perdido.
        await borrarGuardandoCopia(prisma, 'scheduleBlock', { classroomId }, quienBorra(request as any));

        if (bestAssignments && bestAssignments.length > 0) {
            await prisma.scheduleBlock.createMany({
                data: bestAssignments,
            });
        }

        // Consultar los bloques recién creados con relaciones para devolverlos
        const createdBlocks = await prisma.scheduleBlock.findMany({
            where: { classroomId },
            include: {
                classroomSubject: {
                    include: {
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        teacher: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });

        return reply.status(200).send({
            message: unplacedUnits.length > 0
                ? `Horario reorganizado. ${unplacedUnits.length} bloques no se colocaron para no dejar a un profesor en dos sitios a la vez`
                : 'Horario reorganizado al azar y apilado exitosamente',
            stats: {
                totalAssigned: createdBlocks.length,
                stacked: true,
                hasGaps: unplacedUnits.length > 0,
            },
            scheduleBlocks: createdBlocks,
            unplaced: unplacedUnits.map((u) => ({ subject: u.subjectName, teacherId: u.teacherId })),
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

        // Resolver teacherId por id o email para máxima compatibilidad
        const teacherUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: teacherId },
                    { email: teacherId }
                ]
            },
            select: { id: true }
        });
        const resolvedTeacherId = teacherUser ? teacherUser.id : teacherId;

        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                OR: [
                    // clases: el profesor sale de la asignación
                    { classroomSubject: { teacherId: resolvedTeacherId } },
                    // horas personales: el profesor es dueño directo del bloque
                    { teacherId: resolvedTeacherId },
                ],
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

/**
 * Guardar los movimientos hechos desde el horario de UN profesor.
 *
 * La vista del profesor no puede inventar clases: una clase existe porque el
 * admin asignó una materia a una sección con ese profesor (`ClassroomSubject`).
 * Por eso aquí solo se mueven o se quitan bloques que ya existen — y al moverlos
 * se mueve el mismo `ScheduleBlock` que ve la sección, que es justo lo que se
 * quiere: una sola fuente, dos vistas.
 */
export async function bulkUpdateTeacherSchedule(
    request: FastifyRequest<{
        Params: { teacherId: string };
        Body: {
            blocks?: Array<{
                id?: string;
                classroomSubjectId: string;
                dayOfWeek: number;
                startTime: string;
                endTime: string;
            }>;
            deleteIds?: string[];
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { teacherId } = request.params;
        const { blocks = [], deleteIds = [] } = request.body || {};
        const prisma = request.tenantPrisma;

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        for (const b of blocks) {
            if (!b.classroomSubjectId) {
                return reply.status(400).send({ error: 'Cada bloque debe indicar la materia asignada', code: 'MISSING_CLASSROOM_SUBJECT' });
            }
            if (b.dayOfWeek < 0 || b.dayOfWeek > 6) {
                return reply.status(400).send({ error: 'Día de semana inválido', code: 'INVALID_DAY_OF_WEEK' });
            }
            if (!timeRegex.test(b.startTime) || !timeRegex.test(b.endTime)) {
                return reply.status(400).send({ error: 'Formato de hora inválido', code: 'INVALID_TIME_FORMAT' });
            }
            if (b.startTime >= b.endTime) {
                return reply.status(400).send({ error: 'La hora de fin debe ser posterior a la de inicio', code: 'INVALID_TIME_RANGE' });
            }
        }

        const result = await prisma.$transaction(async (tx: any) => {
            // 1. Todo lo que se toca tiene que ser de ESTE profesor — tanto los
            //    bloques existentes como las asignaciones sobre las que se crean
            //    bloques nuevos. Si no, la ruta sería una puerta trasera para
            //    editar el horario de cualquier otro.
            const csIds = Array.from(new Set(blocks.map((b) => b.classroomSubjectId)));
            const ownedCs = csIds.length
                ? await tx.classroomSubject.findMany({
                    where: { id: { in: csIds }, teacherId },
                    select: { id: true, classroomId: true, weeklyBlocks: true, subject: { select: { name: true } }, classroom: { select: { name: true } } },
                })
                : [];
            const csById = new Map<string, any>(ownedCs.map((cs: any) => [cs.id, cs]));

            const foreignCs = csIds.filter((id) => !csById.has(id));
            if (foreignCs.length > 0) {
                const err: any = new Error('Algunas materias no están asignadas a este profesor');
                err.statusCode = 403;
                err.code = 'SUBJECT_NOT_ASSIGNED_TO_TEACHER';
                err.foreign = foreignCs;
                throw err;
            }

            const existingIds = Array.from(
                new Set([...blocks.map((b) => b.id).filter((id): id is string => Boolean(id)), ...deleteIds])
            );
            const owned = existingIds.length
                ? await tx.scheduleBlock.findMany({
                    where: { id: { in: existingIds }, classroomSubject: { teacherId } },
                    select: { id: true },
                })
                : [];
            const ownedIds = new Set(owned.map((b: any) => b.id));
            const foreign = existingIds.filter((id) => !ownedIds.has(id));
            if (foreign.length > 0) {
                const err: any = new Error('Algunos bloques no pertenecen a este profesor');
                err.statusCode = 403;
                err.code = 'BLOCK_NOT_OWNED_BY_TEACHER';
                err.foreign = foreign;
                throw err;
            }

            if (deleteIds.length > 0) {
                await borrarGuardandoCopia(tx, 'scheduleBlock', { id: { in: deleteIds } }, quienBorra(request as any));
            }

            // 2. No se puede pasar de los bloques semanales que el admin asignó.
            //    Es el mismo tope que muestra el contador "Restantes" en la barra
            //    lateral, comprobado también aquí para que no dependa del cliente.
            const byCs = new Map<string, number>();
            for (const b of blocks) {
                byCs.set(b.classroomSubjectId, (byCs.get(b.classroomSubjectId) ?? 0) + 1);
            }
            for (const [csId, count] of byCs) {
                const cs = csById.get(csId);
                if (count > cs.weeklyBlocks) {
                    const err: any = new Error(
                        `${cs.subject?.name ?? 'La materia'} en ${cs.classroom?.name ?? 'la sección'} tiene ${cs.weeklyBlocks} bloques semanales asignados y se intentaron colocar ${count}`
                    );
                    err.statusCode = 400;
                    err.code = 'WEEKLY_BLOCKS_LIMIT_EXCEEDED';
                    throw err;
                }
            }

            const desired = blocks.map((b) => ({
                id: b.id,
                classroomId: csById.get(b.classroomSubjectId).classroomId,
                classroomSubjectId: b.classroomSubjectId,
                dayOfWeek: b.dayOfWeek,
                startTime: b.startTime,
                endTime: b.endTime,
                blockType: 'CLASS',
            }));

            // Solo bloquean los choques nuevos; los heredados avisan (ver servicio).
            const analysis = await analyzeScheduleConflicts(tx, desired, { ignoreBlockIds: deleteIds });
            if (analysis.blocking.length > 0) {
                throw new ScheduleConflictError(analysis.blocking);
            }

            const saved = [];
            for (const d of desired) {
                if (d.id) {
                    saved.push(
                        await tx.scheduleBlock.update({
                            where: { id: d.id },
                            data: {
                                classroomSubjectId: d.classroomSubjectId,
                                dayOfWeek: d.dayOfWeek,
                                startTime: d.startTime,
                                endTime: d.endTime,
                            },
                        })
                    );
                } else {
                    saved.push(
                        await tx.scheduleBlock.create({
                            data: {
                                classroomId: d.classroomId,
                                classroomSubjectId: d.classroomSubjectId,
                                dayOfWeek: d.dayOfWeek,
                                startTime: d.startTime,
                                endTime: d.endTime,
                                blockType: 'CLASS',
                            },
                        })
                    );
                }
            }
            return { saved, preexisting: analysis.preexisting };
        });

        return reply.status(200).send({
            message: 'Horario del profesor actualizado exitosamente',
            blocks: result.saved,
            total: result.saved.length,
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
        if ((error as any)?.statusCode === 403 || (error as any)?.statusCode === 400) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message,
                code: (error as any).code,
                blocks: (error as any).foreign,
            });
        }
        logger.error('Error al actualizar horario del profesor', {
            error: error instanceof Error ? error.message : String(error),
            teacherId: request.params.teacherId,
        });
        return reply.status(500).send({ error: 'Error al actualizar horario del profesor', code: 'INTERNAL_SERVER_ERROR' });
    }
}

/**
 * Materias que el admin le asignó a un profesor, con sus bloques semanales.
 *
 * Es el equivalente, del lado del profesor, a las materias de una sección: cada
 * fila es un `ClassroomSubject` (sección + materia + este profesor + cuántos
 * bloques semanales le tocan), y es lo que alimenta la barra lateral del editor
 * para poder arrastrar y llevar la cuenta de cuántos bloques quedan por colocar.
 */
export async function getTeacherClassroomSubjects(
    request: FastifyRequest<{ Params: { teacherId: string } }>,
    reply: FastifyReply
) {
    try {
        const { teacherId } = request.params;
        const prisma = request.tenantPrisma;

        const assignments = await prisma.classroomSubject.findMany({
            where: { teacherId },
            include: {
                subject: { select: { id: true, name: true, code: true, color: true } },
                classroom: { select: { id: true, name: true, grade: true, section: true, slug: true } },
                _count: { select: { scheduleBlocks: true } },
            },
        });

        const sorted = assignments.sort((a: any, b: any) => {
            const byGrade = (a.classroom?.grade ?? 0) - (b.classroom?.grade ?? 0);
            if (byGrade !== 0) return byGrade;
            const bySection = (a.classroom?.name ?? '').localeCompare(b.classroom?.name ?? '');
            if (bySection !== 0) return bySection;
            return (a.subject?.name ?? '').localeCompare(b.subject?.name ?? '');
        });

        return reply.status(200).send({
            classroomSubjects: sorted.map((cs: any) => ({
                id: cs.id,
                weeklyBlocks: cs.weeklyBlocks,
                hoursPerWeek: cs.hoursPerWeek,
                assignedBlocks: cs._count?.scheduleBlocks ?? 0,
                subject: cs.subject,
                classroom: cs.classroom,
            })),
            total: sorted.length,
        });
    } catch (error) {
        logger.error('Error al obtener materias del profesor', {
            error: error instanceof Error ? error.message : String(error),
            teacherId: request.params.teacherId,
        });
        return reply.status(500).send({ error: 'Error al obtener materias del profesor' });
    }
}

/**
 * Colocar al azar los bloques que le faltan a un profesor.
 *
 * A diferencia del "ordenar al azar" de una sección, aquí NO se borra nada: un
 * profesor toca muchas secciones y regenerar su horario reescribiría el de
 * todas ellas. Se rellenan solo los bloques pendientes (los que el admin asignó
 * y aún no están en la cuadrícula), en huecos donde estén libres a la vez el
 * profesor y la sección destino.
 *
 * Las franjas horarias llegan del cliente porque se derivan de la configuración
 * del instituto (`useSchedulePeriods`), que es configurable por liceo — el
 * servidor no las inventa ni las hardcodea, solo valida su formato.
 */
export async function autoFillTeacherSchedule(
    request: FastifyRequest<{
        Params: { teacherId: string };
        Body: { periods?: Array<{ startTime: string; endTime: string }>; days?: number[] };
    }>,
    reply: FastifyReply
) {
    try {
        const { teacherId } = request.params;
        const { periods = [], days = [1, 2, 3, 4, 5] } = request.body || {};
        const prisma = request.tenantPrisma;

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const validPeriods = periods.filter(
            (p) => timeRegex.test(p?.startTime) && timeRegex.test(p?.endTime) && p.startTime < p.endTime
        );
        if (validPeriods.length === 0) {
            return reply.status(400).send({
                error: 'No se recibieron franjas horarias válidas',
                code: 'NO_PERIODS',
            });
        }
        const validDays = days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        if (validDays.length === 0) {
            return reply.status(400).send({ error: 'No se recibieron días válidos', code: 'NO_DAYS' });
        }

        const result = await prisma.$transaction(async (tx: any) => {
            const assignments = await tx.classroomSubject.findMany({
                where: { teacherId },
                include: {
                    subject: { select: { id: true, name: true } },
                    classroom: { select: { id: true, name: true } },
                    scheduleBlocks: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true } },
                },
            });

            if (assignments.length === 0) {
                const err: any = new Error('Este profesor no tiene materias asignadas');
                err.statusCode = 400;
                err.code = 'NO_SUBJECTS_ASSIGNED';
                throw err;
            }

            // Ocupación actual: del profesor (en cualquier sección) y de cada
            // sección destino (con clases de cualquier profesor).
            const classroomIds = Array.from(new Set(assignments.map((a: any) => a.classroomId)));
            const existing = await tx.scheduleBlock.findMany({
                where: {
                    OR: [
                        { classroomId: { in: classroomIds } },
                        { classroomSubject: { teacherId } },
                    ],
                },
                select: {
                    classroomId: true,
                    dayOfWeek: true,
                    startTime: true,
                    classroomSubject: { select: { teacherId: true, subjectId: true } },
                },
            });

            const slotKey = (day: number, start: string) => day + '|' + start;
            const teacherBusy = new Set<string>();
            const classroomBusy = new Set<string>();
            /** cuántos bloques de una materia ya hay ese día en esa sección */
            const perDayCount = new Map<string, number>();

            for (const b of existing) {
                if (b.classroomSubject?.teacherId === teacherId) {
                    teacherBusy.add(slotKey(b.dayOfWeek, b.startTime));
                }
                classroomBusy.add(b.classroomId + '|' + slotKey(b.dayOfWeek, b.startTime));
                if (b.classroomSubject?.subjectId) {
                    const k = b.classroomId + '|' + b.classroomSubject.subjectId + '|' + b.dayOfWeek;
                    perDayCount.set(k, (perDayCount.get(k) ?? 0) + 1);
                }
            }

            // Un elemento por bloque pendiente, barajados para que el reparto
            // no favorezca siempre a las mismas secciones.
            const pending: any[] = [];
            for (const a of assignments) {
                const missing = (a.weeklyBlocks || 0) - a.scheduleBlocks.length;
                for (let i = 0; i < missing; i++) pending.push(a);
            }
            for (let i = pending.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = pending[i];
                pending[i] = pending[j];
                pending[j] = tmp;
            }

            const slots: Array<{ day: number; startTime: string; endTime: string }> = [];
            for (const day of validDays) {
                for (const p of validPeriods) {
                    slots.push({ day, startTime: p.startTime, endTime: p.endTime });
                }
            }

            const created: any[] = [];
            const unplaced: Array<{ classroom: string; subject: string }> = [];

            for (const assignment of pending) {
                const candidates = slots
                    .filter((s) => !teacherBusy.has(slotKey(s.day, s.startTime)))
                    .filter((s) => !classroomBusy.has(assignment.classroomId + '|' + slotKey(s.day, s.startTime)));

                if (candidates.length === 0) {
                    unplaced.push({
                        classroom: assignment.classroom?.name ?? '',
                        subject: assignment.subject?.name ?? '',
                    });
                    continue;
                }

                // Se prefiere no amontonar más de 2 bloques de la misma materia
                // el mismo día en la misma sección; si no queda otra, se acepta.
                const countKey = (day: number) =>
                    assignment.classroomId + '|' + assignment.subjectId + '|' + day;
                const preferred = candidates.filter((s) => (perDayCount.get(countKey(s.day)) ?? 0) < 2);
                const pool = preferred.length > 0 ? preferred : candidates;
                const chosen = pool[Math.floor(Math.random() * pool.length)];

                created.push(
                    await tx.scheduleBlock.create({
                        data: {
                            classroomId: assignment.classroomId,
                            classroomSubjectId: assignment.id,
                            dayOfWeek: chosen.day,
                            startTime: chosen.startTime,
                            endTime: chosen.endTime,
                            blockType: 'CLASS',
                        },
                    })
                );

                teacherBusy.add(slotKey(chosen.day, chosen.startTime));
                classroomBusy.add(assignment.classroomId + '|' + slotKey(chosen.day, chosen.startTime));
                perDayCount.set(countKey(chosen.day), (perDayCount.get(countKey(chosen.day)) ?? 0) + 1);
            }

            return { created, unplaced };
        });

        return reply.status(200).send({
            message: 'Bloques colocados al azar',
            placed: result.created.length,
            unplaced: result.unplaced,
            blocks: result.created,
        });
    } catch (error) {
        if ((error as any)?.statusCode === 400) {
            return reply.status(400).send({
                error: (error as any).message,
                code: (error as any).code,
            });
        }
        logger.error('Error al colocar bloques al azar del profesor', {
            error: error instanceof Error ? error.message : String(error),
            teacherId: request.params.teacherId,
        });
        return reply.status(500).send({ error: 'Error al colocar bloques al azar', code: 'INTERNAL_SERVER_ERROR' });
    }
}

/**
 * Bloques PERSONAL: la hora propia de un profesor (planificación, guardia…),
 * con título y descripción. No pertenecen a ninguna sección ni materia.
 *
 * Los crea el ADMIN desde el horario del profesor (decisión de producto). Viven
 * en la misma tabla que las clases para que la pregunta "¿está ocupada esta
 * hora de este profesor?" siga resolviéndose con una sola consulta: por eso una
 * clase no puede colocarse encima de una hora personal, ni al revés.
 */
export async function createPersonalBlock(
    request: FastifyRequest<{
        Params: { teacherId: string };
        Body: { dayOfWeek: number; startTime: string; endTime: string; title: string; notes?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const { teacherId } = request.params;
        const { dayOfWeek, startTime, endTime, title, notes } = request.body || ({} as any);
        const prisma = request.tenantPrisma;

        const invalid = validatePersonalBlockInput({ dayOfWeek, startTime, endTime, title });
        if (invalid) return reply.status(400).send(invalid);

        const teacher = await prisma.user.findFirst({
            where: { id: teacherId, role: 'TEACHER' },
            select: { id: true },
        });
        if (!teacher) {
            return reply.status(404).send({ error: 'Profesor no encontrado', code: 'TEACHER_NOT_FOUND' });
        }

        const block = await prisma.$transaction(async (tx: any) => {
            const conflicts = await findScheduleConflicts(tx, [
                { teacherId, dayOfWeek, startTime, endTime, blockType: 'PERSONAL' },
            ]);
            if (conflicts.length > 0) {
                throw new ScheduleConflictError(conflicts);
            }

            return tx.scheduleBlock.create({
                data: {
                    teacherId,
                    dayOfWeek,
                    startTime,
                    endTime,
                    blockType: 'PERSONAL',
                    title: title.trim(),
                    notes: notes?.trim() || null,
                },
            });
        });

        return reply.status(201).send({ message: 'Bloque personal creado', scheduleBlock: block });
    } catch (error) {
        if (error instanceof ScheduleConflictError) {
            return reply.status(409).send({ error: error.message, code: error.code, conflicts: error.conflicts });
        }
        logger.error('Error al crear bloque personal', {
            error: error instanceof Error ? error.message : String(error),
            teacherId: request.params.teacherId,
        });
        return reply.status(500).send({ error: 'Error al crear bloque personal', code: 'INTERNAL_SERVER_ERROR' });
    }
}

function validatePersonalBlockInput(input: {
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    title?: string;
}): { error: string; code: string } | null {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!input.title || !input.title.trim()) {
        return { error: 'El bloque necesita un título', code: 'MISSING_TITLE' };
    }
    if (input.title.trim().length > 100) {
        return { error: 'El título no puede tener más de 100 caracteres', code: 'TITLE_TOO_LONG' };
    }
    if (typeof input.dayOfWeek !== 'number' || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
        return { error: 'Día de semana inválido', code: 'INVALID_DAY_OF_WEEK' };
    }
    if (!timeRegex.test(input.startTime || '') || !timeRegex.test(input.endTime || '')) {
        return { error: 'Formato de hora inválido', code: 'INVALID_TIME_FORMAT' };
    }
    if ((input.startTime as string) >= (input.endTime as string)) {
        return { error: 'La hora de fin debe ser posterior a la de inicio', code: 'INVALID_TIME_RANGE' };
    }
    return null;
}

/** Editar el título, la descripción o la posición de un bloque personal. */
export async function updatePersonalBlock(
    request: FastifyRequest<{
        Params: { id: string };
        Body: { dayOfWeek?: number; startTime?: string; endTime?: string; title?: string; notes?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const { id } = request.params;
        const prisma = request.tenantPrisma;

        const existing = await prisma.scheduleBlock.findUnique({ where: { id } });
        if (!existing || existing.blockType !== 'PERSONAL') {
            return reply.status(404).send({ error: 'Bloque personal no encontrado', code: 'PERSONAL_BLOCK_NOT_FOUND' });
        }

        const merged = {
            dayOfWeek: request.body.dayOfWeek ?? existing.dayOfWeek,
            startTime: request.body.startTime ?? existing.startTime,
            endTime: request.body.endTime ?? existing.endTime,
            title: request.body.title ?? existing.title ?? '',
        };
        const invalid = validatePersonalBlockInput(merged);
        if (invalid) return reply.status(400).send(invalid);

        const updated = await prisma.$transaction(async (tx: any) => {
            const conflicts = await findScheduleConflicts(tx, [
                {
                    id,
                    teacherId: existing.teacherId,
                    dayOfWeek: merged.dayOfWeek,
                    startTime: merged.startTime,
                    endTime: merged.endTime,
                    blockType: 'PERSONAL',
                },
            ]);
            if (conflicts.length > 0) {
                throw new ScheduleConflictError(conflicts);
            }

            return tx.scheduleBlock.update({
                where: { id },
                data: {
                    dayOfWeek: merged.dayOfWeek,
                    startTime: merged.startTime,
                    endTime: merged.endTime,
                    title: merged.title.trim(),
                    notes:
                        request.body.notes === undefined
                            ? existing.notes
                            : request.body.notes?.trim() || null,
                },
            });
        });

        return reply.status(200).send({ message: 'Bloque personal actualizado', scheduleBlock: updated });
    } catch (error) {
        if (error instanceof ScheduleConflictError) {
            return reply.status(409).send({ error: error.message, code: error.code, conflicts: error.conflicts });
        }
        logger.error('Error al actualizar bloque personal', {
            error: error instanceof Error ? error.message : String(error),
            id: request.params.id,
        });
        return reply.status(500).send({ error: 'Error al actualizar bloque personal', code: 'INTERNAL_SERVER_ERROR' });
    }
}

/** Eliminar un bloque personal. */
export async function deletePersonalBlock(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        const { id } = request.params;
        const prisma = request.tenantPrisma;

        const existing = await prisma.scheduleBlock.findUnique({ where: { id } });
        if (!existing || existing.blockType !== 'PERSONAL') {
            return reply.status(404).send({ error: 'Bloque personal no encontrado', code: 'PERSONAL_BLOCK_NOT_FOUND' });
        }

        await borrarGuardandoCopia(prisma, 'scheduleBlock', { id }, quienBorra(request as any));
        return reply.status(200).send({ message: 'Bloque personal eliminado' });
    } catch (error) {
        logger.error('Error al eliminar bloque personal', {
            error: error instanceof Error ? error.message : String(error),
            id: request.params.id,
        });
        return reply.status(500).send({ error: 'Error al eliminar bloque personal', code: 'INTERNAL_SERVER_ERROR' });
    }
}
