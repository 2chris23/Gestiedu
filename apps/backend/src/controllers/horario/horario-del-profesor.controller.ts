/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';
import {
    analyzeScheduleConflicts,
    ScheduleConflictError,
} from '../../services/schedule-conflicts.service';

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

        // Si el usuario es TEACHER, solo puede consultar su propio horario
        if (request.user?.role === 'TEACHER' && resolvedTeacherId !== request.user.userId) {
            return reply.status(403).send({
                error: 'Solo puedes consultar tu propio horario',
                code: 'FORBIDDEN',
            });
        }

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

        // Resolver teacherId por id o email
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

        // Si el usuario es TEACHER, solo puede consultar sus propias asignaciones
        if (request.user?.role === 'TEACHER' && resolvedTeacherId !== request.user.userId) {
            return reply.status(403).send({
                error: 'Solo puedes consultar tus propias asignaciones',
                code: 'FORBIDDEN',
            });
        }

        const assignments = await prisma.classroomSubject.findMany({
            where: { teacherId: resolvedTeacherId },
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
