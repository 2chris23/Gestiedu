/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import {
    EventError,
    EventInput,
    EventScope,
    applyEventSuspensions,
    classroomsInScope,
    dayOfWeekOf,
    findClassesInSlot,
    parseDay,
    resolveAcademicYear,
    revertEventSuspensions,
    validateEventInput,
} from '../services/school-events.service';

/**
 * Eventos del liceo. Toda la lógica de "qué clases caen dentro" vive en
 * `school-events.service.ts` (`findClassesInSlot`), para que la vista de día, la
 * vista previa y la suspensión real no puedan dar números distintos.
 */

function sendError(reply: FastifyReply, error: unknown, fallback: string, context: Record<string, unknown>) {
    if (error instanceof EventError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    }
    logger.error(fallback, { error: error instanceof Error ? error.message : String(error), ...context });
    return reply.status(500).send({ error: fallback, code: 'INTERNAL_SERVER_ERROR' });
}

function normalizeInput(body: any): EventInput {
    return {
        title: typeof body?.title === 'string' ? body.title : '',
        description: typeof body?.description === 'string' ? body.description : null,
        date: body?.date,
        startTime: body?.startTime,
        endTime: body?.endTime,
        scope: body?.scope as EventScope,
        grades: Array.isArray(body?.grades) ? body.grades.map(Number).filter(Number.isInteger) : [],
        classroomIds: Array.isArray(body?.classroomIds) ? body.classroomIds.filter((x: any) => typeof x === 'string') : [],
        academicYearId: typeof body?.academicYearId === 'string' ? body.academicYearId : undefined,
    };
}

function toDateString(d: Date): string {
    return new Date(d).toISOString().slice(0, 10);
}

function serializeEvent(e: any) {
    return {
        id: e.id,
        title: e.title,
        description: e.description,
        date: toDateString(e.date),
        startTime: e.startTime,
        endTime: e.endTime,
        scope: e.scope,
        grades: e.grades,
        classroomIds: e.classroomIds,
        academicYearId: e.academicYearId,
        suspendedCount: e._count?.suspendedSessions ?? undefined,
        createdBy: e.createdBy
            ? { id: e.createdBy.id, firstName: e.createdBy.firstName, lastName: e.createdBy.lastName }
            : null,
        createdAt: e.createdAt,
    };
}

const EVENT_INCLUDE = {
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    _count: { select: { suspendedSessions: true } },
};

/** GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD[&academicYearId=] */
export async function listEvents(
    request: FastifyRequest<{ Querystring: { from?: string; to?: string; academicYearId?: string } }>,
    reply: FastifyReply
) {
    try {
        const { from, to, academicYearId } = request.query;
        const where: any = {};
        if (academicYearId) where.academicYearId = academicYearId;
        if (from || to) {
            where.date = {};
            if (from) where.date.gte = parseDay(from);
            if (to) where.date.lte = parseDay(to);
        }

        const events = await request.tenantPrisma.schoolEvent.findMany({
            where,
            include: EVENT_INCLUDE,
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });

        return reply.send({ events: events.map(serializeEvent), total: events.length });
    } catch (error) {
        return sendError(reply, error, 'Error al listar eventos', {});
    }
}

/**
 * GET /events/day?date=YYYY-MM-DD[&academicYearId=]
 *
 * Todo lo que necesita la vista de día: las clases de ese día (para contar
 * cuántas hay en cada bloque y, al pasar el ratón, mostrar sección, profesor y
 * materia), los eventos de ese día y las secciones del ciclo para el selector de
 * alcance.
 */
export async function getEventDay(
    request: FastifyRequest<{ Querystring: { date?: string; academicYearId?: string } }>,
    reply: FastifyReply
) {
    try {
        const { date, academicYearId } = request.query;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return reply.status(400).send({ error: 'Fecha inválida (formato YYYY-MM-DD)', code: 'INVALID_DATE' });
        }

        const prisma = request.tenantPrisma;
        const year = await resolveAcademicYear(prisma, academicYearId);

        const [classes, classrooms, events] = await Promise.all([
            // Día completo y todo el liceo: la misma función que usa la suspensión.
            findClassesInSlot(prisma, {
                academicYearId: year.id,
                date,
                startTime: '00:00',
                endTime: '23:59',
                scope: 'INSTITUTE',
            }),
            classroomsInScope(prisma, year.id, 'INSTITUTE'),
            prisma.schoolEvent.findMany({
                where: { academicYearId: year.id, date: parseDay(date) },
                include: EVENT_INCLUDE,
                orderBy: { startTime: 'asc' },
            }),
        ]);

        return reply.send({
            date,
            dayOfWeek: dayOfWeekOf(date),
            academicYear: { id: year.id, name: year.name },
            classes,
            classrooms,
            events: events.map(serializeEvent),
        });
    } catch (error) {
        return sendError(reply, error, 'Error al obtener el día', { date: request.query.date });
    }
}

/**
 * POST /events/preview
 *
 * Las clases que suspendería un evento, sin guardar nada. Usa la MISMA función
 * que la suspensión real, así que lo que promete la ventana es lo que pasa.
 */
export async function previewEvent(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        const input = normalizeInput(request.body);
        // El título no hace falta para previsualizar.
        const invalid = validateEventInput({ ...input, title: input.title || 'preview' });
        if (invalid) throw invalid;

        const prisma = request.tenantPrisma;
        const year = await resolveAcademicYear(prisma, input.academicYearId);
        const classes = await findClassesInSlot(prisma, { ...input, academicYearId: year.id });

        return reply.send({ classes, count: classes.length });
    } catch (error) {
        return sendError(reply, error, 'Error al previsualizar el evento', {});
    }
}

/** POST /events — crea el evento y suspende sus clases, todo o nada. */
export async function createEvent(request: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    try {
        const input = normalizeInput(request.body);
        const invalid = validateEventInput(input);
        if (invalid) throw invalid;

        const prisma = request.tenantPrisma;
        const userId = (request.user as any)?.userId ?? null;

        const result = await prisma.$transaction(async (tx: any) => {
            const year = await resolveAcademicYear(tx, input.academicYearId);

            const event = await tx.schoolEvent.create({
                data: {
                    title: input.title.trim(),
                    description: input.description?.trim() || null,
                    date: parseDay(input.date),
                    startTime: input.startTime,
                    endTime: input.endTime,
                    scope: input.scope,
                    grades: input.scope === 'GRADES' ? input.grades : [],
                    classroomIds: input.scope === 'CLASSROOMS' ? input.classroomIds : [],
                    academicYearId: year.id,
                    createdById: userId,
                },
            });

            const classes = await findClassesInSlot(tx, { ...input, academicYearId: year.id });
            const suspended = await applyEventSuspensions(
                tx,
                { id: event.id, title: event.title, date: input.date },
                classes
            );

            const full = await tx.schoolEvent.findUnique({ where: { id: event.id }, include: EVENT_INCLUDE });
            return { event: full, classes, suspended };
        });

        return reply.status(201).send({
            message: 'Evento creado',
            event: serializeEvent(result.event),
            affectedClasses: result.classes.length,
            suspendedSessions: result.suspended,
        });
    } catch (error) {
        return sendError(reply, error, 'Error al crear el evento', {});
    }
}

/**
 * PUT /events/:id — si cambian la franja o el alcance, las suspensiones se
 * deshacen y se recalculan: el evento siempre suspende exactamente lo que dice.
 */
export async function updateEvent(request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) {
    try {
        const { id } = request.params;
        const prisma = request.tenantPrisma;

        const existing = await prisma.schoolEvent.findUnique({ where: { id } });
        if (!existing) {
            return reply.status(404).send({ error: 'Evento no encontrado', code: 'EVENT_NOT_FOUND' });
        }

        const body: any = request.body || {};
        const input = normalizeInput({
            title: body.title ?? existing.title,
            description: body.description ?? existing.description,
            date: body.date ?? toDateString(existing.date),
            startTime: body.startTime ?? existing.startTime,
            endTime: body.endTime ?? existing.endTime,
            scope: body.scope ?? existing.scope,
            grades: body.grades ?? existing.grades,
            classroomIds: body.classroomIds ?? existing.classroomIds,
            academicYearId: existing.academicYearId,
        });
        const invalid = validateEventInput(input);
        if (invalid) throw invalid;

        const result = await prisma.$transaction(async (tx: any) => {
            await revertEventSuspensions(tx, id);

            const event = await tx.schoolEvent.update({
                where: { id },
                data: {
                    title: input.title.trim(),
                    description: input.description?.trim() || null,
                    date: parseDay(input.date),
                    startTime: input.startTime,
                    endTime: input.endTime,
                    scope: input.scope,
                    grades: input.scope === 'GRADES' ? input.grades : [],
                    classroomIds: input.scope === 'CLASSROOMS' ? input.classroomIds : [],
                },
            });

            const classes = await findClassesInSlot(tx, { ...input, academicYearId: existing.academicYearId });
            const suspended = await applyEventSuspensions(
                tx,
                { id: event.id, title: event.title, date: input.date },
                classes
            );

            const full = await tx.schoolEvent.findUnique({ where: { id }, include: EVENT_INCLUDE });
            return { event: full, classes, suspended };
        });

        return reply.send({
            message: 'Evento actualizado',
            event: serializeEvent(result.event),
            affectedClasses: result.classes.length,
            suspendedSessions: result.suspended,
        });
    } catch (error) {
        return sendError(reply, error, 'Error al actualizar el evento', { id: request.params.id });
    }
}

/** DELETE /events/:id — deshace las suspensiones y borra el evento. */
export async function deleteEvent(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        const { id } = request.params;
        const prisma = request.tenantPrisma;

        const existing = await prisma.schoolEvent.findUnique({ where: { id } });
        if (!existing) {
            return reply.status(404).send({ error: 'Evento no encontrado', code: 'EVENT_NOT_FOUND' });
        }

        const reverted = await prisma.$transaction(async (tx: any) => {
            const n = await revertEventSuspensions(tx, id);
            await borrarGuardandoCopia(tx, 'schoolEvent', { id }, quienBorra(request as any));
            return n;
        });

        return reply.send({ message: 'Evento eliminado', revertedSessions: reverted });
    } catch (error) {
        return sendError(reply, error, 'Error al eliminar el evento', { id: request.params.id });
    }
}
