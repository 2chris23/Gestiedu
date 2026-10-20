import { getPlanWeekNumber } from './sesion-de-clase.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { crearReemplazo, esFecha } from '../../services/class-replacements.service';
import { avisarDelReemplazo } from '../class-replacements.controller';
import { logger } from '../../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Suspender una clase: marca la sesión como SUSPENDED y rota las actividades pendientes
 * (target NEXT) para que queden disponibles en la próxima clase no suspendida.
 * Además, fusiona automáticamente el tema generador de la semana actual con la siguiente
 * para no romper el plan de evaluación cuando se pierde una semana.
 */
export async function suspendClassSession(
    request: FastifyRequest<{
        Body: { classroomId: string; subjectId: string; date: string; reason?: string; replacementSubjectId?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, reason, replacementSubjectId } = request.body ?? ({} as any);
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !esFecha(date)) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos o la fecha no es válida (AAAA-MM-DD)' });
        }

        // Antes se aceptaba cualquier par de identificadores y se creaba una
        // sesión suspendida para una materia que la sección ni tenía.
        const asignada = await prisma.classroomSubject.findUnique({
            where: { classroomId_subjectId: { classroomId, subjectId } },
            select: { id: true, classroom: { select: { name: true } } },
        });
        if (!asignada) {
            return reply.status(404).send({ error: 'Esa materia no es de esta sección', code: 'SUBJECT_NOT_IN_CLASSROOM' });
        }

        const parsedDate = new Date(date);
        const startOfDay = new Date(parsedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const result = await prisma.$transaction(async (tx: any) => {
            // 1. Buscar o crear sesión y marcarla suspendida
            const existing = await tx.classSession.findFirst({
                where: { classroomId, subjectId, date: { gte: startOfDay, lte: endOfDay } },
            });

            let session;
            if (existing) {
                session = await tx.classSession.update({
                    where: { id: existing.id },
                    data: { status: 'SUSPENDED', suspendedReason: reason },
                });
            } else {
                session = await tx.classSession.create({
                    data: {
                        publicId: randomUUID(),
                        classroomId,
                        subjectId,
                        date: parsedDate,
                        status: 'SUSPENDED',
                        suspendedReason: reason,
                    },
                });
            }

            // 2. Rotar actividades pendientes de la próxima clase (target NEXT) para la siguiente clase
            const pendingNext = await tx.classActivity.findMany({
                where: { classroomId, subjectId, target: 'NEXT', isDone: false },
            });

            for (const act of pendingNext) {
                await tx.classActivity.update({
                    where: { id: act.id },
                    data: { carriedOver: true },
                });
            }

            // 3. Fusionar tema generador de la semana actual con la siguiente
            const mergeResult = await mergeTemaGeneradorOnSuspend(tx, classroomId, subjectId, parsedDate);

            // 4. Otra materia en su lugar, si el admin la eligió. Va en la MISMA
            // transacción: si el reemplazo no se puede (el profesor está
            // ocupado), la clase tampoco queda suspendida y el admin decide.
            const reemplazo = replacementSubjectId
                ? await crearReemplazo(tx, {
                      classroomId,
                      suspendedSubjectId: subjectId,
                      subjectId: replacementSubjectId,
                      fecha: date,
                      reason,
                      createdById: (request.user as any)?.userId ?? (request.user as any)?.id,
                  })
                : null;

            return {
                session,
                carriedOverCount: pendingNext.length,
                reemplazo,
                ...mergeResult,
            };
        });

        request.aQuienAfecta = { classroomId };
        if (result.reemplazo) {
            await avisarDelReemplazo(request, result.reemplazo, asignada.classroom?.name ?? 'la sección', date);
        }

        return reply.status(200).send({
            success: true,
            session: result.session,
            carriedOverCount: result.carriedOverCount,
            mergedWeek: result.mergedWeek,
            mergedTemaGenerador: result.mergedTemaGenerador,
            replacements: result.reemplazo?.reemplazos ?? [],
        });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error suspending class session', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al suspender la clase' });
    }
}

/**
 * Fusiona el tema generador (HEADER) de la semana actual con la siguiente.
 * - Si la siguiente semana ya tiene tema generador: concatena "actual + siguiente".
 * - Si no tiene: mueve el actual a la siguiente semana.
 * - Deja vacía la semana actual para que el profesor pueda ajustar después.
 */
async function mergeTemaGeneradorOnSuspend(
    prisma: any,
    classroomId: string,
    subjectId: string,
    date: Date
): Promise<{ mergedWeek: number | null; mergedTemaGenerador: boolean }> {
    const semana = await getPlanWeekNumber(prisma, classroomId, subjectId, date);
    if (!semana) return { mergedWeek: null, mergedTemaGenerador: false };
    const currentWeek = semana.semana;

    // Las filas de ESE lapso: antes se buscaba la semana en cualquier lapso y
    // se podía fusionar el tema del lapso equivocado.
    const currentHeader = await prisma.evaluationPlanRow.findFirst({
        where: { classroomId, subjectId, lapso: semana.lapso, weekNumber: currentWeek, rowType: 'HEADER' },
        orderBy: { orderIndex: 'asc' },
    });

    // Sin tema generador en la semana actual → nada que fusionar
    if (!currentHeader?.title) {
        return { mergedWeek: currentWeek, mergedTemaGenerador: false };
    }

    const currentTitle = currentHeader.title.trim();
    if (!currentTitle) {
        return { mergedWeek: currentWeek, mergedTemaGenerador: false };
    }

    const nextWeek = currentWeek + 1;
    const nextHeader = await prisma.evaluationPlanRow.findFirst({
        where: { classroomId, subjectId, lapso: semana.lapso, weekNumber: nextWeek, rowType: 'HEADER' },
        orderBy: { orderIndex: 'asc' },
    });

    if (nextHeader?.title && nextHeader.title.trim()) {
        // Concatenar actual con el siguiente
        const combined = `${nextHeader.title.trim()} / ${currentTitle}`;
        await prisma.evaluationPlanRow.update({
            where: { id: nextHeader.id },
            data: { title: combined },
        });
    } else if (nextHeader) {
        // Mover el actual a la semana siguiente
        await prisma.evaluationPlanRow.update({
            where: { id: nextHeader.id },
            data: { title: currentTitle },
        });
    } else {
        // Crear HEADER en la semana siguiente
        await prisma.evaluationPlanRow.create({
            data: {
                classroomId,
                subjectId,
                lapso: currentHeader.lapso,
                rowType: 'HEADER',
                weekNumber: nextWeek,
                title: currentTitle,
                headingLevel: currentHeader.headingLevel ?? 1,
                orderIndex: 0,
            },
        });
    }

    // Vaciar el tema generador de la semana actual (perdida)
    await prisma.evaluationPlanRow.update({
        where: { id: currentHeader.id },
        data: { title: '' },
    });

    return { mergedWeek: currentWeek, mergedTemaGenerador: true };
}
