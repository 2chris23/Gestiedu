import { FastifyReply, FastifyRequest } from 'fastify';
import { assertCanSeeStudent } from '../services/authorization.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { lapsoDeLaFecha } from '../utils/lapso-de-la-actividad';
import { logger } from '../utils/logger';

/**
 * «MI CLASE»: UNA MATERIA VISTA POR EL ALUMNO (O SU REPRESENTANTE)
 *
 * Al tocar una clase de su horario, el alumno abría una ventanita con el tema
 * del día y nada más. El liceo quiere que vea lo que un alumno necesita de esa
 * materia: el plan de evaluación, sus actividades con SU nota y SUS
 * observaciones. Nada de los demás alumnos.
 *
 * Por eso esto se arma en el servidor y no reusando lo del profesor:
 *
 *   - `ClassActivity.scores` guarda las notas de TODA la sección en un mapa;
 *     aquí sale solo la suya.
 *   - Las observaciones de grupo llevan a los otros alumnos implicados; aquí no.
 *   - Del membrete del plan no salen la cédula, el teléfono ni el correo del
 *     profesor: son sus datos, no del plan.
 *
 * Lo ve quien puede ver al alumno (`assertCanSeeStudent`: él, su
 * representante, un profesor suyo, el admin). Solo lectura.
 */

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function miClase(
    request: FastifyRequest<{ Params: { id: string; subjectId: string }; Querystring: { lapso?: string } }>,
    reply: FastifyReply
) {
    try {
        const prisma = request.tenantPrisma;
        const { id: studentId, subjectId } = request.params;

        await assertCanSeeStudent(prisma, request.user as any, studentId);

        // Su sección del ciclo en curso (si ninguno está activo, la última).
        const inscripciones = await prisma.studentClassroom.findMany({
            where: { studentId, isActive: true },
            select: {
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        academicYear: {
                            select: {
                                id: true,
                                status: true,
                                startDate: true,
                                periods: { select: { id: true, name: true, startDate: true, endDate: true, inicioDelPlan: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const inscripcion =
            inscripciones.find((i) => i.classroom?.academicYear?.status === 'ACTIVE') ?? inscripciones[0];
        const seccion = inscripcion?.classroom;
        if (!seccion) {
            return reply.status(404).send({ error: 'El alumno no está inscrito en ninguna sección', code: 'SIN_SECCION' });
        }

        // Que la materia sea de su sección: si no, no hay «su clase» que ver.
        const materiaDeLaSeccion = await prisma.classroomSubject.findFirst({
            where: { classroomId: seccion.id, subjectId },
            select: {
                subject: { select: { id: true, name: true, color: true } },
                teacher: { select: { firstName: true, lastName: true } },
            },
        });
        if (!materiaDeLaSeccion) {
            return reply.status(404).send({ error: 'Esa materia no es de su sección', code: 'MATERIA_AJENA' });
        }

        // Los lapsos en orden: el del plan es su número (1, 2, 3) en ese orden.
        const lapsos = [...(seccion.academicYear?.periods ?? [])].sort(
            (a, b) => a.startDate.getTime() - b.startDate.getTime()
        );
        const hoy = todayInTimezone(await instituteTimezone(prisma));
        const idDeHoy = lapsoDeLaFecha(hoy, lapsos);
        const numeroDeHoy = String(Math.max(1, lapsos.findIndex((l) => l.id === idDeHoy) + 1));
        const pedido = request.query.lapso;
        const lapso = pedido && /^[1-9]$/.test(pedido) && Number(pedido) <= Math.max(lapsos.length, 1) ? pedido : numeroDeHoy;

        const [meta, filas, actividades, observaciones] = await Promise.all([
            prisma.evaluationPlanMetadata.findUnique({
                where: { classroomId_subjectId_lapso: { classroomId: seccion.id, subjectId, lapso } },
                select: {
                    nombreDocente: true,
                    areaFormacion: true,
                    annoSeccion: true,
                    periodoEscolar: true,
                    peic: true,
                    enfasisCurricular: true,
                    referentesEticos: true,
                    intencionalidad: true,
                    temaIndispensable: true,
                    customColumns: true,
                },
            }),
            prisma.evaluationPlanRow.findMany({
                where: { classroomId: seccion.id, subjectId, lapso },
                select: {
                    id: true,
                    rowType: true,
                    weekNumber: true,
                    endWeekNumber: true,
                    orderIndex: true,
                    title: true,
                    headingLevel: true,
                    label: true,
                    content: true,
                    textContent: true,
                    actividadEval: true,
                    tecnicas: true,
                    instrumentos: true,
                    criterios: true,
                    ponderacion: true,
                    puntos: true,
                    tipoEvaluacion: true,
                    // Columnas propias del profesor y cuántas semanas abarca
                    // cada celda: sin esto, el plan del alumno sale a medias.
                    extraData: true,
                },
                orderBy: [{ weekNumber: 'asc' }, { orderIndex: 'asc' }],
            }),
            prisma.classActivity.findMany({
                where: { classroomId: seccion.id, subjectId },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    type: true,
                    tag: true,
                    dueDate: true,
                    maxScore: true,
                    scores: true,
                    evaluadoDeOtraForma: true,
                    createdAt: true,
                    classSession: { select: { date: true } },
                    planRow: { select: { weekNumber: true, actividadEval: true, lapso: true } },
                },
                orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
            }),
            prisma.observation.findMany({
                where: { studentId, subjectId },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    type: true,
                    date: true,
                    createdBy: { select: { firstName: true, lastName: true } },
                },
                orderBy: { date: 'desc' },
            }),
        ]);

        const lista = actividades.map((a) => {
            const notas = (a.scores ?? {}) as Record<string, number | null>;
            const nota = notas?.[studentId];
            const tieneNota = typeof nota === 'number' && !Number.isNaN(nota);
            const fecha = a.dueDate ?? a.classSession?.date ?? null;
            const dia = fecha ? ymd(fecha) : null;
            return {
                id: a.id,
                title: a.title,
                description: a.description,
                type: a.type,
                tag: a.tag,
                fecha: dia,
                maxScore: a.maxScore ?? null,
                nota: tieneNota ? nota : null,
                estado: tieneNota ? 'EVALUADA' : dia && dia < hoy ? 'VENCIDA' : 'PENDIENTE',
                criterio: a.planRow?.actividadEval ?? null,
                semana: a.planRow?.weekNumber ?? null,
                // Si a ÉL se le evalúa de otra forma (solo lo suyo, no el mapa entero).
                otraForma: ((a.evaluadoDeOtraForma ?? {}) as Record<string, { metodo: string; motivo?: string }>)[studentId] ?? null,
            };
        });

        // Las semanas del lapso, contadas igual que la rejilla del profesor
        // (`getEvaluationPlanMetadata`): así la «Semana 5» es la misma en las dos.
        // Desde que empieza el PLAN, que puede ser después del inicio del lapso
        // (semanas de diagnóstico, `Period.inicioDelPlan`).
        const delLapso = lapsos[Number(lapso) - 1];
        const inicioDelPlan = delLapso ? delLapso.inicioDelPlan ?? delLapso.startDate : null;
        const semanas = delLapso && inicioDelPlan
            ? Math.max(1, Math.ceil((delLapso.endDate.getTime() - inicioDelPlan.getTime()) / (7 * 24 * 60 * 60 * 1000)))
            : null;

        return reply.status(200).send({
            alumnoId: studentId,
            inicioDelLapso: inicioDelPlan ? ymd(inicioDelPlan) : null,
            semanas,
            seccion: { id: seccion.id, name: seccion.name },
            materia: materiaDeLaSeccion.subject,
            profesor: materiaDeLaSeccion.teacher
                ? `${materiaDeLaSeccion.teacher.firstName} ${materiaDeLaSeccion.teacher.lastName}`
                : null,
            lapso,
            lapsoDeHoy: numeroDeHoy,
            lapsos: lapsos.map((l, i) => ({ numero: String(i + 1), name: l.name })),
            plan: { membrete: meta, filas },
            actividades: lista,
            observaciones: observaciones.map((o) => ({
                id: o.id,
                title: o.title,
                description: o.description,
                type: o.type,
                date: o.date,
                profesor: o.createdBy ? `${o.createdBy.firstName} ${o.createdBy.lastName}` : null,
            })),
        });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error armando «mi clase»', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'No se pudo cargar la clase' });
    }
}

/**
 * Las materias de la sección del alumno: la entrada a «Mi clase» para el
 * representante, que no tiene el horario del alumno a mano. Misma regla:
 * `assertCanSeeStudent`.
 */
export async function misMaterias(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        const prisma = request.tenantPrisma;
        const studentId = request.params.id;
        await assertCanSeeStudent(prisma, request.user as any, studentId);

        const inscripciones = await prisma.studentClassroom.findMany({
            where: { studentId, isActive: true },
            select: {
                classroom: { select: { id: true, name: true, academicYear: { select: { status: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const seccion = (
            inscripciones.find((i) => i.classroom?.academicYear?.status === 'ACTIVE') ?? inscripciones[0]
        )?.classroom;
        if (!seccion) return reply.status(200).send({ seccion: null, materias: [] });

        const materias = await prisma.classroomSubject.findMany({
            where: { classroomId: seccion.id },
            select: {
                subject: { select: { id: true, name: true, color: true } },
                teacher: { select: { firstName: true, lastName: true } },
            },
            orderBy: { subject: { name: 'asc' } },
        });

        return reply.status(200).send({
            seccion: { id: seccion.id, name: seccion.name },
            materias: materias.map((m) => ({
                ...m.subject,
                profesor: m.teacher ? `${m.teacher.firstName} ${m.teacher.lastName}` : null,
            })),
        });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error listando las materias del alumno', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'No se pudieron cargar las materias' });
    }
}
