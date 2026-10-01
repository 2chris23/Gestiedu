import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { assertCanSeeClassroom } from '../services/authorization.service';
import { crearReemplazo, esFecha, SELECCION } from '../services/class-replacements.service';
import { parseDay } from '../services/school-events.service';

/**
 * Las rutas de reemplazos. Ver `services/class-replacements.service.ts` para
 * las reglas; aquí solo quién puede y cómo se responde.
 */

const idDe = (request: FastifyRequest) => (request.user as any)?.userId ?? (request.user as any)?.id;
const liceoDe = (request: FastifyRequest) => request.institute?.id ?? (request.user as any)?.instituteId;

function responderError(reply: FastifyReply, error: any, porDefecto: string) {
    if (error?.statusCode) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    }
    logger.error(porDefecto, { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({ error: porDefecto });
}

/**
 * Aviso en la campana a los dos profesores. Que falle no deshace el reemplazo:
 * el reemplazo ya se ve en su horario, el aviso es un extra.
 */
export async function avisarDelReemplazo(
    request: FastifyRequest,
    r: { profesorQueEntra: string; profesorQueSale: string | null; materiaQueEntra: string; materiaQueSale: string },
    classroomName: string,
    fecha: string
) {
    try {
        const instituteId = liceoDe(request);
        const avisos = [
            {
                recipientId: r.profesorQueEntra,
                title: 'Cubres una clase',
                message: `El ${fecha} das ${r.materiaQueEntra} en ${classroomName} en la hora de ${r.materiaQueSale}, que se suspendió.`,
            },
        ];
        if (r.profesorQueSale && r.profesorQueSale !== r.profesorQueEntra) {
            avisos.push({
                recipientId: r.profesorQueSale,
                title: 'Tu clase tiene reemplazo',
                message: `El ${fecha}, en la hora de ${r.materiaQueSale} en ${classroomName}, se dará ${r.materiaQueEntra}.`,
            });
        }
        await request.tenantPrisma.notification.createMany({
            data: avisos.map((a) => ({
                ...a,
                type: 'CLASS_REPLACEMENT',
                priority: 'MEDIUM',
                senderId: idDe(request) ?? null,
                instituteId: instituteId ?? null,
            })),
        });
    } catch (error) {
        logger.warn('No se pudo avisar del reemplazo', { error: error instanceof Error ? error.message : String(error) });
    }
}

/** POST /api/class-replacements — solo admin. */
export async function createClassReplacement(
    request: FastifyRequest<{
        Body: { classroomId: string; suspendedSubjectId: string; subjectId: string; date: string; reason?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, suspendedSubjectId, subjectId, date, reason } = request.body ?? ({} as any);
        if (!classroomId || !suspendedSubjectId || !subjectId || !esFecha(date)) {
            return reply.status(400).send({ error: 'Faltan datos o la fecha no es válida (AAAA-MM-DD)' });
        }

        const resultado = await request.tenantPrisma.$transaction((tx: any) =>
            crearReemplazo(tx, { classroomId, suspendedSubjectId, subjectId, fecha: date, reason, createdById: idDe(request) })
        );

        request.aQuienAfecta = { classroomId };
        await avisarDelReemplazo(request, resultado, resultado.reemplazos[0]?.classroom?.name ?? 'la sección', date);

        return reply.status(201).send({ replacements: resultado.reemplazos });
    } catch (error: any) {
        // Dos admins a la vez sobre el mismo hueco: el segundo choca con la llave única.
        if (error?.code === 'P2002') {
            return reply.status(409).send({ error: 'Esa clase ya tiene un reemplazo', code: 'ALREADY_REPLACED' });
        }
        return responderError(reply, error, 'Error al crear el reemplazo');
    }
}

/**
 * GET /api/class-replacements?classroomId=…&from=…&to=…
 * GET /api/class-replacements?teacherId=…&from=…&to=…
 *
 * Admin: cualquiera. Profesor: los de las secciones donde da clase, o los
 * suyos. Nunca más de 62 días por consulta.
 */
export async function listClassReplacements(
    request: FastifyRequest<{ Querystring: { classroomId?: string; teacherId?: string; from?: string; to?: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, teacherId, from, to } = request.query ?? {};
        if ((!classroomId && !teacherId) || !esFecha(from) || !esFecha(to ?? from)) {
            return reply.status(400).send({ error: 'Indica la sección o el profesor, y las fechas (AAAA-MM-DD)' });
        }
        const desde = parseDay(from);
        const hasta = parseDay(to ?? from);
        const dias = (hasta.getTime() - desde.getTime()) / 86_400_000;
        if (dias < 0 || dias > 62) {
            return reply.status(400).send({ error: 'El rango de fechas debe ser de 0 a 62 días' });
        }

        const user = request.user as any;
        const yo = idDe(request);
        if (user?.role !== UserRole.ADMIN) {
            if (teacherId && teacherId !== yo) {
                return reply.status(403).send({ error: 'Solo puedes ver tus propios reemplazos' });
            }
            /**
             * QUIEN VA A ESA CLASE TIENE QUE SABER QUE CAMBIÓ
             *
             * Esto solo lo dejaba ver a los profesores de la sección, así que el
             * alumno veía en su horario la materia de siempre aunque el admin ya
             * hubiera puesto otra: se presentaba a una clase que no era. Ahora
             * lo ven también el alumno de esa sección y su representante —y
             * nadie más— con la misma regla que el resto del horario.
             */
            if (classroomId) {
                await assertCanSeeClassroom(request.tenantPrisma as any, user, classroomId);
            }
        }

        const replacements = await request.tenantPrisma.classReplacement.findMany({
            where: {
                ...(classroomId ? { classroomId } : {}),
                ...(teacherId ? { teacherId } : {}),
                date: { gte: desde, lte: hasta },
            },
            select: SELECCION,
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });

        return reply.send({ replacements });
    } catch (error) {
        return responderError(reply, error, 'Error al obtener los reemplazos');
    }
}

/**
 * DELETE /api/class-replacements/:id — solo admin.
 * Quita TODO el reemplazo de esa clase ese día (todos sus bloques), no uno
 * suelto: medio reemplazo dejaría al profesor dando media clase.
 */
export async function deleteClassReplacement(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        const uno = await request.tenantPrisma.classReplacement.findUnique({
            where: { id: request.params.id },
            select: { classroomId: true, date: true, suspendedSubjectId: true },
        });
        if (!uno) return reply.status(404).send({ error: 'Reemplazo no encontrado' });

        await request.tenantPrisma.$transaction((tx: any) =>
            borrarGuardandoCopia(
                tx,
                'classReplacement',
                { classroomId: uno.classroomId, date: uno.date, suspendedSubjectId: uno.suspendedSubjectId },
                quienBorra(request as any)
            )
        );

        request.aQuienAfecta = { classroomId: uno.classroomId };
        return reply.send({ message: 'Reemplazo quitado' });
    } catch (error) {
        return responderError(reply, error, 'Error al quitar el reemplazo');
    }
}
