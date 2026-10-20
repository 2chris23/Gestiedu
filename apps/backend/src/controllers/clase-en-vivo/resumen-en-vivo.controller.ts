import { parseDayDate } from './sesion-de-clase.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { RequestUser } from '../../types/fastify';
import { semanaDelPlanCon } from '../../services/semana-del-plan.service';
import { instituteTimezone } from '../../utils/school-time';
import { assertCanSeeClassroom, assertCanSeeStudent } from '../../services/authorization.service';
import { diaDeLaActividad } from '../../utils/actividad-del-dia';

/**
 * EL HORARIO EN VIVO DE UNA SECCIÓN
 *
 * Por cada materia del horario: el tema de la semana y dos contadores.
 *
 * QUÉ SIGNIFICA CADA CONTADOR (esto estaba mal y se veía mal):
 *
 *   Hoy   — lo que toca HACER en esa clase: actividades con fecha de hoy, o
 *           puestas en la clase de hoy para hoy mismo.
 *   Próx. — lo que se DEJÓ en esa clase para otro día. Es un dato de esa clase,
 *           no de la materia: por eso solo cuenta lo que nació en la sesión de
 *           ESE día.
 *
 * Antes "Próx." sumaba toda actividad pendiente de la materia, viniera de donde
 * viniera. El horario anunciaba "1 actividad para la próxima clase" en bloques
 * donde no se había puesto nada, y al entrar no había nada: el contador mentía.
 *
 * Lo ven el profesor de la sección, el alumno que estudia en ella y su
 * representante. Un alumno solo recibe SU nota; de los demás, nada.
 */
export async function getLiveOverview(
    request: FastifyRequest<{ Querystring: { classroomId: string; date: string; studentId?: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, date, studentId } = request.query;
        const prisma = request.tenantPrisma;

        if (!classroomId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros: classroomId, date' });
        }

        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return reply.status(400).send({ error: 'Fecha inválida' });
        }

        await assertCanSeeClassroom(prisma, request.user as any, classroomId);

        // ¿De quién son las notas que se devuelven? Del alumno que pregunta, o
        // del representado que se pida (si de verdad lo representa).
        const quienPregunta = request.user as RequestUser | undefined;
        let alumnoDeLasNotas: string | null =
            quienPregunta?.role === 'STUDENT' ? (quienPregunta.userId ?? null) : null;
        if (studentId) {
            await assertCanSeeStudent(prisma, request.user as any, studentId);
            alumnoDeLasNotas = studentId;
        }

        // Día intencionado a mediodía LOCAL (ver getLiveClassDetail)
        const dayDate = parseDayDate(date);
        const inicioDelDia = new Date(parsedDate);
        inicioDelDia.setUTCHours(0, 0, 0, 0);
        const finDelDia = new Date(parsedDate);
        finDelDia.setUTCHours(23, 59, 59, 999);

        const [subjects, classroom, metas, sesionesDelDia, zonaLiceo] = await Promise.all([
            prisma.classroomSubject.findMany({
                where: { classroomId },
                include: { subject: { select: { id: true, name: true, color: true } } },
            }),
            prisma.classroom.findUnique({
                where: { id: classroomId },
                select: {
                    shift: true,
                    academicYear: {
                        select: {
                            startDate: true,
                            periods: { select: { id: true, startDate: true, endDate: true, inicioDelPlan: true, nombreAntesDelPlan: true } },
                        },
                    },
                },
            }),
            prisma.evaluationPlanMetadata.findMany({ where: { classroomId }, orderBy: { lapso: 'asc' } }),
            prisma.classSession.findMany({
                where: { classroomId, date: { gte: inicioDelDia, lte: finDelDia } },
                select: { id: true, subjectId: true, status: true },
            }),
            instituteTimezone(prisma),
        ]);

        const yearStart = classroom?.academicYear?.startDate ? new Date(classroom.academicYear.startDate) : null;
        const lapsos = classroom?.academicYear?.periods ?? [];
        // La semana del plan de ese día, contada como la rejilla. El plan de
        // cada materia es el del LAPSO de ese día (antes, el primero que saliera).
        const semanaDelDia = semanaDelPlanCon(dayDate, lapsos, yearStart);
        const metaPorMateria = new Map<string, (typeof metas)[number]>();
        for (const m of metas) {
            if (semanaDelDia.lapso && m.lapso !== semanaDelDia.lapso) continue;
            if (!metaPorMateria.has(m.subjectId)) metaPorMateria.set(m.subjectId, m);
        }
        const sesionPorMateria = new Map(sesionesDelDia.map((s) => [s.subjectId, s]));
        const idsDeSesion = sesionesDelDia.map((s) => s.id);

        // Semana del plan por materia (cada materia puede empezar su lapso en
        // otra fecha, así que el número de semana se calcula una por una).
        const semanaPorMateria = new Map<string, number>();
        for (const cs of subjects) {
            const meta = metaPorMateria.get(cs.subject.id);
            if (!meta) continue;
            const sem = meta.fechaDesde
                ? semanaDelPlanCon(dayDate, lapsos, yearStart, new Date(meta.fechaDesde))
                : semanaDelDia;
            // Semana 0: antes de que empiece el plan. No hay tema que buscar.
            if (sem.inicioDelPlan && !sem.antesDelPlan) semanaPorMateria.set(cs.subject.id, sem.semana);
        }

        // Las filas del plan de todas las materias, de un tirón (antes era una
        // consulta por materia dentro de un bucle: 15 materias, 45 consultas).
        const condicionesDePlan = subjects
            .map((cs) => {
                const meta = metaPorMateria.get(cs.subject.id);
                const semana = semanaPorMateria.get(cs.subject.id);
                if (!meta || semana === undefined) return null;
                return { classroomId, subjectId: cs.subject.id, lapso: meta.lapso, weekNumber: semana };
            })
            .filter(Boolean) as Array<{ classroomId: string; subjectId: string; lapso: string; weekNumber: number }>;

        const filasDelPlan = condicionesDePlan.length
            ? await prisma.evaluationPlanRow.findMany({
                  where: { OR: condicionesDePlan },
                  orderBy: { orderIndex: 'asc' },
              })
            : [];
        const filaPorMateria = new Map<string, (typeof filasDelPlan)[number]>();
        for (const fila of filasDelPlan) {
            if (fila.subjectId && !filaPorMateria.has(fila.subjectId)) filaPorMateria.set(fila.subjectId, fila);
        }

        /**
         * Solo las actividades que tienen que ver con ESE día: las que nacieron
         * en la clase de ese día y las que vencen ese día. Antes se traían
         * TODAS las de la materia desde el principio del año.
         */
        const actividades = await prisma.classActivity.findMany({
            where: {
                classroomId,
                OR: [
                    ...(idsDeSesion.length ? [{ classSessionId: { in: idsDeSesion } }] : []),
                    { dueDate: { gte: inicioDelDia, lte: finDelDia } },
                    // Las viejas sin clase: se fechan por su creación en la zona
                    // del liceo (utils/actividad-del-dia.ts); ±1 día de margen.
                    {
                        classSessionId: null,
                        createdAt: { gte: new Date(inicioDelDia.getTime() - 86400000), lte: new Date(finDelDia.getTime() + 86400000) },
                    },
                ],
            },
            orderBy: { createdAt: 'asc' },
        });

        const result: Record<string, {
            subjectName: string;
            color?: string;
            weekNumber?: number;
            temaGenerador?: string;
            firstColumnLabel?: string;
            activitiesCount?: number;
            todayActivitiesCount?: number;
            nextActivitiesCount?: number;
            suspendida?: boolean;
            antesDelPlan?: boolean;
            nombreAntesDelPlan?: string;
            actividades?: Array<{
                id: string;
                title: string;
                type: string;
                tag?: string | null;
                target: string;
                dueDate: string | null;
                maxScore: number | null;
                paraOtroDia: boolean;
                miNota?: number | null;
            }>;
        }> = {};

        const soloElDia = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const diaDeClase = soloElDia(dayDate);

        for (const cs of subjects) {
            const materiaId = cs.subject.id;
            const meta = metaPorMateria.get(materiaId);
            const sesion = sesionPorMateria.get(materiaId);
            const deLaMateria = actividades.filter((a) => a.subjectId === materiaId);

            let todayActivitiesCount = 0;
            let nextActivitiesCount = 0;
            const listaDelDia: NonNullable<(typeof result)[string]['actividades']> = [];

            for (const a of deLaMateria) {
                const venceHoy = Boolean(a.dueDate && soloElDia(a.dueDate).getTime() === diaDeClase.getTime());
                const naceHoy = Boolean(
                    (sesion && a.classSessionId === sesion.id) ||
                        (!a.classSessionId && diaDeLaActividad(a, zonaLiceo) === date.slice(0, 10))
                );
                if (!venceHoy && !naceHoy) continue;

                // Puesta en esta clase para otro día: eso es "Próx."
                const paraOtroDia = naceHoy && !venceHoy && a.target === 'NEXT';
                if (paraOtroDia) nextActivitiesCount++;
                else todayActivitiesCount++;

                const notas = (a.scores ?? {}) as Record<string, number | null>;
                listaDelDia.push({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    tag: a.tag,
                    target: a.target,
                    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
                    maxScore: a.maxScore ?? null,
                    paraOtroDia,
                    ...(alumnoDeLasNotas ? { miNota: notas?.[alumnoDeLasNotas] ?? null } : {}),
                });
            }

            // El nombre de la primera columna del plan (el liceo la puede llamar
            // de otra forma que "Tema Generador").
            let firstColumnLabel = 'Tema Generador';
            if (meta?.customColumns) {
                try {
                    const cols = typeof meta.customColumns === 'string' ? JSON.parse(meta.customColumns) : meta.customColumns;
                    if (Array.isArray(cols) && cols.length > 0 && cols[0].label) {
                        firstColumnLabel = cols[0].label;
                    }
                } catch {}
            }

            result[materiaId] = {
                subjectName: cs.subject.name,
                color: cs.subject.color || undefined,
                weekNumber: semanaPorMateria.get(materiaId),
                temaGenerador: filaPorMateria.get(materiaId)?.title || undefined,
                antesDelPlan: semanaDelDia.antesDelPlan,
                nombreAntesDelPlan: semanaDelDia.nombreAntesDelPlan,
                firstColumnLabel,
                activitiesCount: listaDelDia.length,
                todayActivitiesCount,
                nextActivitiesCount,
                suspendida: sesion?.status === 'SUSPENDED',
                actividades: listaDelDia,
            };
        }

        return reply.status(200).send({ overview: result, shift: classroom?.shift ?? 'MANANA' });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error getting live overview', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al obtener resumen en vivo' });
    }
}
