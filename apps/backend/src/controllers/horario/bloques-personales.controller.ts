/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';
import {
    findScheduleConflicts,
    ScheduleConflictError,
} from '../../services/schedule-conflicts.service';

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
