import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { semanaDelPlan, type SemanaDelPlan } from '../../services/semana-del-plan.service';

/**
 * El plan de una materia en una fecha: el del LAPSO de esa fecha (antes se
 * cogía el primero que saliera, de cualquier lapso) y su semana, contada como
 * la cuenta la rejilla (`services/semana-del-plan.service.ts`). Semana 0 =
 * antes de que empiece el plan (diagnóstico).
 */
export async function planDeLaFecha(
    prisma: any,
    classroomId: string,
    subjectId: string,
    fecha: Date
): Promise<{ meta: any | null; sem: SemanaDelPlan }> {
    const [base, metas] = await Promise.all([
        semanaDelPlan(prisma, classroomId, fecha),
        prisma.evaluationPlanMetadata.findMany({ where: { classroomId, subjectId }, orderBy: { lapso: 'asc' } }),
    ]);
    const meta = base.lapso ? metas.find((m: any) => m.lapso === base.lapso) ?? null : metas[0] ?? null;
    const sem = meta?.fechaDesde ? await semanaDelPlan(prisma, classroomId, fecha, new Date(meta.fechaDesde)) : base;
    return { meta, sem };
}
import { assertClassroomScope } from '../../services/authorization.service';

/**
 * Parsea una fecha de input <input type="date"> (YYYY-MM-DD) a mediodía LOCAL.
 * CORRECCIÓN: `new Date('2026-08-28')` se interpreta como medianoche UTC y en
 * zonas UTC-x el frontend mostraba el día ANTERIOR (27/08). Con mediodía local
 * no hay drift: el día guardado es el día que eligió el usuario.
 */
export function parseDayDate(value: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    }
    return new Date(value);
}

interface GetClassSessionRequest {
    Params: {
        sessionId: string;
    };
}

interface UpdateClassSessionRequest {
    Params: {
        sessionId: string;
    };
    Body: {
        topic?: string;
        observations?: string;
        startTime?: string;
        endTime?: string;
    };
}

/**
 * Obtener detalle de una sesión de clase específica
 */
export async function getClassSessionById(
    request: FastifyRequest<GetClassSessionRequest>,
    reply: FastifyReply
) {
    try {
        const { sessionId } = request.params;
        const prisma = request.tenantPrisma;

        const session = await prisma.classSession.findUnique({
            where: { id: sessionId },
            include: {
                subject: {
                    select: { id: true, name: true, color: true }
                },
                classroom: {
                    select: { id: true, name: true, grade: true, section: true }
                },
                attendanceRecords: {
                    include: {
                        student: {
                            select: { id: true, firstName: true, lastName: true, avatar: true }
                        }
                    }
                }
            }
        });

        if (!session) {
            return reply.status(404).send({ error: 'Sesión no encontrada' });
        }
        // La clase, con la asistencia de cada alumno, es de quien la da (y del
        // guía de la sección, que la mira). Antes la leía cualquier profesor.
        await exigirClasePropia(request, session.classroomId, session.subjectId, 'ver la clase');

        return reply.status(200).send(session);
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error getting class session', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: request.params.sessionId,
        });
        return reply.status(500).send({ error: 'Error al obtener sesión de clase' });
    }
}

/**
 * Actualizar detalles de una sesión de clase
 */
/**
 * SOLO SOBRE LAS CLASES PROPIAS
 *
 * Un profesor da nota, asistencia, actividades y observaciones **de las clases
 * que imparte**. El profesor guía además puede sobre su sección. Esto no estaba
 * comprobado en ninguna de las escrituras de esta pantalla.
 */
export async function exigirClasePropia(
    request: FastifyRequest,
    classroomId: string,
    subjectId: string | undefined,
    accion: string
): Promise<void> {
    await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, {
        subjectId,
        accion,
    });
}

export async function updateClassSession(
    request: FastifyRequest<UpdateClassSessionRequest>,
    reply: FastifyReply
) {
    try {
        const { sessionId } = request.params;
        const { topic, observations, startTime, endTime } = request.body;
        const prisma = request.tenantPrisma;

        // Antes cualquier profesor le cambiaba el tema y las observaciones a
        // una clase ajena solo con su id.
        const actual = await prisma.classSession.findUnique({
            where: { id: sessionId },
            select: { classroomId: true, subjectId: true },
        });
        if (!actual) {
            return reply.status(404).send({ error: 'Sesión no encontrada' });
        }
        await exigirClasePropia(request, actual.classroomId, actual.subjectId, 'dar clase');

        const session = await prisma.classSession.update({
            where: { id: sessionId },
            data: {
                topic,
                observations,
                startTime,
                endTime
            }
        });

        return reply.status(200).send(session);
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error updating class session', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: request.params.sessionId,
        });
        return reply.status(500).send({ error: 'Error al actualizar sesión de clase' });
    }
}

/**
 * Calcular el número de semana lectiva de una fecha para una materia.
 * Usa fechaDesde del plan; si no existe, el inicio del año académico.
 */
export async function getPlanWeekNumber(
    prisma: any,
    classroomId: string,
    subjectId: string,
    date: Date
): Promise<{ semana: number; lapso: string; meta: any } | null> {
    const { meta, sem } = await planDeLaFecha(prisma, classroomId, subjectId, date);
    // Sin plan en ese lapso, o antes de que empiece (diagnóstico): no hay semana.
    if (!meta || !sem.inicioDelPlan || sem.antesDelPlan) return null;
    return { semana: sem.semana, lapso: meta.lapso, meta };
}