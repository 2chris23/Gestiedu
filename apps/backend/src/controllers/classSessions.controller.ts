import { FastifyRequest, FastifyReply } from 'fastify';
import { crearReemplazo, esFecha } from '../services/class-replacements.service';
import { avisarDelReemplazo } from './class-replacements.controller';
import { parseDay } from '../services/school-events.service';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import { RequestUser } from '../types/fastify';
import { planWeekRangeFromRange } from '../utils/plan-weeks';
import { semanaDelPlan, semanaDelPlanCon, type SemanaDelPlan } from '../services/semana-del-plan.service';

/**
 * El plan de una materia en una fecha: el del LAPSO de esa fecha (antes se
 * cogía el primero que saliera, de cualquier lapso) y su semana, contada como
 * la cuenta la rejilla (`services/semana-del-plan.service.ts`). Semana 0 =
 * antes de que empiece el plan (diagnóstico).
 */
async function planDeLaFecha(
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
import { instituteTimezone, isFutureDate, todayInTimezone } from '../utils/school-time';
import { assertClassroomScope, assertCanSeeClassroom, assertCanSeeStudent, teacherClassroomIds } from '../services/authorization.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { revisarNotas, sumarNotas, arreglarNotasGuardadasComoTexto, Notas } from '../utils/notas-de-clase';
import { clasificar, diaDeLaActividad } from '../utils/actividad-del-dia';
import { evaluacionesDeLaFecha } from '../services/evaluacion-de-la-semana.service';
import { instrumentoDeLaActividad, notaAManoProhibida } from '../services/instrumentos.service';
import { maximoDelInstrumento } from '../utils/instrumentos';

/**
 * La sesión de una clase en un día («YYYY-MM-DD»): la que hay, o una nueva.
 * Toda actividad nueva queda atada a la clase del día que se ve: sin eso, la
 * que se creaba un día sin asistencia guardada no salía en ninguna lista
 * (utils/actividad-del-dia.ts).
 */
async function sesionDelDia(db: any, classroomId: string, subjectId: string, dia: string) {
    const date = new Date(`${dia}T00:00:00.000Z`);
    return db.classSession.upsert({
        where: { classroomId_subjectId_date: { classroomId, subjectId, date } },
        update: {},
        create: { publicId: randomUUID(), classroomId, subjectId, date },
    });
}

/**
 * Parsea una fecha de input <input type="date"> (YYYY-MM-DD) a mediodía LOCAL.
 * CORRECCIÓN: `new Date('2026-08-28')` se interpreta como medianoche UTC y en
 * zonas UTC-x el frontend mostraba el día ANTERIOR (27/08). Con mediodía local
 * no hay drift: el día guardado es el día que eligió el usuario.
 */
function parseDayDate(value: string): Date {
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
async function exigirClasePropia(
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

/** Igual, pero partiendo de la actividad: primero se mira de qué clase es. */
async function exigirActividadPropia(
    request: FastifyRequest,
    activityId: string,
    accion: string
): Promise<{ classroomId: string; subjectId: string | null } | null> {
    const actividad = await request.tenantPrisma.classActivity.findUnique({
        where: { id: activityId },
        select: { classroomId: true, subjectId: true },
    });
    if (!actividad) return null;

    await assertClassroomScope(request.tenantPrisma, request.user as any, actividad.classroomId, {
        subjectId: actividad.subjectId ?? undefined,
        accion,
    });
    return actividad;
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
 * Obtener detalle en vivo de una clase (horario en vivo).
 * Devuelve: sesión (topic/observaciones), estudiantes con asistencia del día,
 * docente y el contenido del plan de evaluación de la semana correspondiente.
 */
export async function getLiveClassDetail(
    request: FastifyRequest<{ Querystring: { classroomId: string; subjectId: string; date: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date } = request.query;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos: classroomId, subjectId, date' });
        }

        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return reply.status(400).send({ error: 'Fecha inválida' });
        }
        // Día INTENCIONADO (del string YYYY-MM-DD) a mediodía LOCAL:
        // new Date('YYYY-MM-DD') es medianoche UTC y en zonas UTC-x desplaza el
        // día (28/08 → 27/08 a las 20:00) para los cálculos de semana/actividades.
        // El régimen UTC se conserva SOLO para las ventanas SQL de asistencia.
        const dayDate = parseDayDate(date);

        const startOfDay = new Date(parsedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        let targetSubjectId = subjectId;
        const sub = await prisma.subject.findFirst({
            where: { OR: [{ id: subjectId }, { slug: subjectId }] },
            select: { id: true, name: true, color: true, slug: true },
        });
        if (sub) {
            targetSubjectId = sub.id;
        }

        /**
         * LEER TAMBIÉN ES ALCANCE
         *
         * La ruta ya exigía ser profesor, pero no que la clase fuera suya: con
         * cambiar el id en la dirección, un profesor veía la lista de alumnos,
         * las notas y las observaciones de una sección ajena. Escribir sí
         * estaba comprobado; leer, no.
         */
        await assertClassroomScope(prisma, request.user as any, classroomId, {
            subjectId: targetSubjectId,
            accion: 'ver las clases',
        });

        /**
         * LO QUE NO DEPENDE DE NADA, A LA VEZ
         *
         * Eran diez consultas en fila, cada una esperando a la anterior aunque
         * ninguna necesitara lo de la otra. Con el servidor cargado, cada espera
         * se sumaba a la siguiente: con 500 personas, esta pantalla —la que el
         * profesor tiene abierta toda la clase— llegó a un p95 de 7,3 s. Las seis
         * de abajo salen juntas; lo que sí depende de otra cosa (la semana del
         * plan, los alumnos de fuera) sigue después.
         */
        const [session, classroomSubject, enrollments, attendances, planDelDia, activities, zonaLiceo, deLaSemana] = await Promise.all([
            // 1. Sesión de clase existente para esta materia y fecha
            prisma.classSession.findFirst({
                where: { classroomId, subjectId: targetSubjectId, date: { gte: startOfDay, lte: endOfDay } },
            }),
            // 2. Materia y docente (vía ClassroomSubject)
            prisma.classroomSubject.findFirst({
                where: { classroomId, subjectId: targetSubjectId },
                include: {
                    subject: { select: { id: true, name: true, color: true, slug: true } },
                    teacher: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
            // 3. Estudiantes de la sección (vía StudentClassroom oficial)
            prisma.studentClassroom.findMany({
                where: { classroomId, isActive: true },
                include: {
                    student: {
                        select: { id: true, firstName: true, lastName: true, avatar: true, studentCode: true, isActive: true }
                    }
                },
                orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
            }),
            // 4. Asistencia de ese día para los estudiantes
            prisma.dailyAttendance.findMany({
                where: { classroomId, date: { gte: startOfDay, lte: endOfDay } },
            }),
            // 5. El plan de la materia en ESE lapso, y su semana
            planDeLaFecha(prisma, classroomId, targetSubjectId, dayDate),
            // 6. Actividades/tareas de la materia
            prisma.classActivity.findMany({
                where: { classroomId, subjectId: targetSubjectId },
                include: {
                    classSession: {
                        select: { id: true, date: true },
                    },
                    // El instrumento de su evaluación, para las que aún no tienen copia.
                    planRow: { select: { instrumento: { select: { definicion: true } } } },
                },
                orderBy: [{ isDone: 'asc' }, { createdAt: 'desc' }],
            }),
            instituteTimezone(prisma),
            // 7. A qué evaluaciones del plan puede sumar lo que se haga este día.
            evaluacionesDeLaFecha(prisma, classroomId, targetSubjectId, dayDate),
        ]);
        const students = enrollments.map((e: any) => e.student).filter((s: any) => s && s.isActive);

        const attendanceByStudent = new Map(attendances.map(a => [a.studentId, a]));

        const studentsWithAttendance = students.map(s => {
            const att = attendanceByStudent.get(s.id);
            return {
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                avatar: s.avatar,
                studentCode: s.studentCode,
                status: att?.status || null,
            };
        });

        // 5. Contenido del plan de evaluación de la semana
        const { meta, sem: semanaDeHoy } = planDelDia;
        let weekNumber: number | undefined;
        let planContent: any = undefined;
        let planLapso: string | null = semanaDeHoy.lapso;
        let planColumns: any = null;
        let weekRow: any = null;

        if (meta) {
            planLapso = meta.lapso;
            // Columnas personalizadas guardadas en metadata
            if (meta.customColumns) {
                try {
                    const parsed = JSON.parse(meta.customColumns);
                    if (Array.isArray(parsed) && parsed.length > 0) planColumns = parsed;
                } catch { /* ignorar columnas inválidas */ }
            }

            // Antes de que empiece el plan (diagnóstico) no hay fila que enseñar.
            if (semanaDeHoy.inicioDelPlan && !semanaDeHoy.antesDelPlan) {
                // Semanas alineadas a LUNES (ver utils/plan-weeks.ts)
                weekNumber = semanaDeHoy.semana;

                const weekRows = await prisma.evaluationPlanRow.findMany({
                    where: { classroomId, subjectId: targetSubjectId, lapso: meta.lapso, weekNumber },
                    orderBy: { orderIndex: 'asc' },
                });

                if (weekRows.length > 0) {
                    planContent = {
                        headers: weekRows.filter(r => r.rowType === 'HEADER'),
                        fields: weekRows.filter(r => r.rowType === 'FIELD'),
                        evaluations: weekRows.filter(r => r.rowType === 'EVALUATION'),
                        texts: weekRows.filter(r => r.rowType === 'TEXT'),
                        indicators: weekRows.filter(r => r.rowType === 'INDICATORS'),
                    };
                    // Fila editable de la semana (EVALUATION) para el card espejo del plan
                    const evalRow = weekRows.find(r => r.rowType === 'EVALUATION');
                    if (evalRow) {
                        const extra: any = {};
                        if (evalRow.extraData) {
                            try { Object.assign(extra, JSON.parse(evalRow.extraData)); } catch { /* ignorar */ }
                        }
                        weekRow = {
                            id: evalRow.id,
                            title: evalRow.title || '',
                            label: evalRow.label || '',
                            textContent: evalRow.textContent || '',
                            actividadEval: evalRow.actividadEval || '',
                            tecnicas: evalRow.tecnicas || '',
                            instrumentos: evalRow.instrumentos || '',
                            criterios: evalRow.criterios || '',
                            tipoEvaluacion: evalRow.tipoEvaluacion || '',
                            ponderacion: evalRow.ponderacion ?? null,
                            puntos: evalRow.puntos ?? null,
                            extraData: extra,
                        };
                    }
                }
            }
        }

        // 6.1. Clasificación RELATIVA A ESTA CLASE:
        // - "Clase de Hoy": tareas cuya fecha de entrega sea la fecha de esta clase (dueOnClassDate),
        //   o actividades realizadas en esta misma sesión (target === 'CURRENT' && createdOnThisClass).
        // - "Próxima Clase": actividades CREADAS / ASIGNADAS en ESTA sesión (createdOnThisClass)
        //   para ser entregadas en una fecha futura. No se arrastran a todas las semanas arbitrariamente.
        const diaDeLaClase = date.slice(0, 10);
        const activitiesWithDue = activities.map(a => {
            // utils/actividad-del-dia.ts: el día de la actividad es el de su
            // clase, o el de su creación EN LA ZONA DEL LICEO (no en UTC).
            const c = clasificar(a, diaDeLaClase, session?.id, zonaLiceo);
            const { planRow, ...resto } = a as any;
            return {
                ...resto,
                instrumento: a.instrumento ?? planRow?.instrumento?.definicion ?? null,
                createdDate: `${diaDeLaActividad(a, zonaLiceo)}T12:00:00.000Z`,
                createdOnThisClass: c.nacioAqui,
                belongsToSession: c.nacioAqui,
                dueToday: c.hoy,
                isFuture: c.proxima,
            };
        });
        const activitiesFiltered = activitiesWithDue;

        // 7. Involucrados: estudiantes de la sección + estudiantes externos agregados a la sesión
        const sessionInvolvedIds: string[] = session?.involvedStudentIds || [];
        const externalIds = sessionInvolvedIds.filter((id: string) => !students.some(s => s.id === id));
        const externalStudents = externalIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: externalIds } },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    studentCode: true,
                    studentClassrooms: {
                        where: { isActive: true },
                        take: 1,
                        select: {
                            classroom: {
                                select: {
                                    name: true,
                                    academicYear: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            }).then(users => users.map(u => ({
                ...u,
                classroom: u.studentClassrooms?.[0]?.classroom || null
            })))
            : [];

        // 7.1. Obtener conteo de observaciones por estudiante EN ESTA SESIÓN ESPECÍFICA
        // Una observación pertenece a esta clase si está vinculada a session.id,
        // o coincide con classroomId, targetSubjectId y la fecha de la clase (incluso si session aún no fue creada).
        const obsDateLte = new Date(endOfDay.getTime() + 6 * 3600 * 1000); // margen para husos horarios locales (UTC-4 / UTC-5)
        const obsSessionFilter: any = session?.id
            ? {
                OR: [
                    { classSessionId: session.id },
                    {
                        classroomId,
                        subjectId: targetSubjectId,
                        date: { gte: startOfDay, lte: obsDateLte },
                    },
                ],
            }
            : {
                classroomId,
                subjectId: targetSubjectId,
                date: { gte: startOfDay, lte: obsDateLte },
            };

        // Si existe sesión guardada, vincular en background cualquier observación huérfana de este día
        if (session?.id) {
            prisma.observation.updateMany({
                where: {
                    classroomId,
                    subjectId: targetSubjectId,
                    date: { gte: startOfDay, lte: obsDateLte },
                    classSessionId: null,
                },
                data: { classSessionId: session.id },
            }).catch(() => {});
        }

        const allStudentIds = [...studentsWithAttendance.map(s => s.id), ...externalIds];
        const studentObsCounts = allStudentIds.length > 0
            ? await prisma.observation.groupBy({
                by: ['studentId'],
                where: {
                    studentId: { in: allStudentIds },
                    ...obsSessionFilter,
                },
                _count: { id: true },
            })
            : [];
        const studentObsMap = new Map(studentObsCounts.map(o => [o.studentId, o._count.id]));

        const involvedStudents = [
            ...studentsWithAttendance.map(s => ({
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                avatar: s.avatar,
                studentCode: s.studentCode,
                status: s.status,
                external: false,
                originClassroom: null as string | null,
                observationsCount: studentObsMap.get(s.id) || 0,
            })),
            ...externalStudents.map((s: any) => ({
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                avatar: s.avatar,
                studentCode: s.studentCode,
                status: null,
                external: true,
                originClassroom: s.classroom
                    ? `${s.classroom.name}${s.classroom.academicYear ? ` · ${s.classroom.academicYear.name}` : ''}`
                    : null,
                observationsCount: studentObsMap.get(s.id) || 0,
            })),
        ];

        // 7.2. Obtener observaciones registradas para esta sesión de clase
        let sessionObservations: any[] = [];
        const rawSessionObs = await prisma.observation.findMany({
            where: obsSessionFilter,
            include: {
                student: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        studentCode: true,
                        avatar: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const groupedObsMap = new Map<string, any>();
        for (const obs of rawSessionObs) {
            const key = obs.groupId || obs.id;
            if (!groupedObsMap.has(key)) {
                groupedObsMap.set(key, {
                    id: obs.id,
                    groupId: obs.groupId,
                    title: obs.title,
                    description: obs.description,
                    type: obs.type,
                    date: obs.date,
                    createdAt: obs.createdAt,
                    teacher: obs.createdBy ? `${obs.createdBy.firstName} ${obs.createdBy.lastName}` : null,
                    students: [],
                });
            }
            if (obs.student) {
                groupedObsMap.get(key).students.push({
                    id: obs.student.id,
                    name: `${obs.student.firstName} ${obs.student.lastName}`,
                    studentCode: obs.student.studentCode,
                    avatar: obs.student.avatar,
                });
            }
        }
        sessionObservations = Array.from(groupedObsMap.values());

        // La sección, con su turno: en un liceo de dos turnos, saber si esta
        // clase es la de la mañana o la de la tarde no es un detalle.
        const laSeccion = await prisma.classroom.findUnique({
            where: { id: classroomId },
            select: { id: true, name: true, shift: true, grade: true, section: true },
        });

        return reply.status(200).send({
            classroom: laSeccion,
            session: session ? {
                id: session.id,
                topic: session.topic,
                observations: session.observations,
                observationsTitle: session.observationsTitle,
                involvedStudentIds: session.involvedStudentIds,
                status: session.status,
                suspendedReason: session.suspendedReason,
            } : null,
            subject: classroomSubject?.subject || null,
            teacher: classroomSubject?.teacher
                ? { id: classroomSubject.teacher.id, firstName: classroomSubject.teacher.firstName, lastName: classroomSubject.teacher.lastName }
                : null,
            students: involvedStudents,
            weekNumber,
            // Antes de que empiece el plan del lapso: semanas de diagnóstico
            // (o como las llame el liceo), con contenido del profesor.
            antesDelPlan: semanaDeHoy.antesDelPlan,
            nombreAntesDelPlan: semanaDeHoy.nombreAntesDelPlan,
            inicioDelPlan: semanaDeHoy.inicioDelPlan ? semanaDeHoy.inicioDelPlan.toISOString().slice(0, 10) : null,
            planContent,
            planColumns,
            planLapso: planLapso || '1',
            weekRow,
            // Las evaluaciones del plan que cubren este día (una actividad suma
            // a una de ellas) y si el plan tiene puntos: sin evaluación, lo que
            // se haga hoy no suma a la nota del lapso y la pantalla lo dice.
            evaluacionesDeLaSemana: deLaSemana.evaluaciones,
            planConPuntos: deLaSemana.planConPuntos,
            activities: activitiesFiltered,
            sessionObservations,
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
        logger.error('Error getting live class detail', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al obtener detalle de clase' });
    }
}

/**
 * Crear una nueva sesión de clase
 */
export async function createClassSession(
    request: FastifyRequest<{ Body: { classroomId: string; subjectId: string; date: string; topic?: string; observations?: string; startTime?: string; endTime?: string; } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, topic, observations, startTime, endTime } = request.body;
        const prisma = request.tenantPrisma;

        // Abrir la clase es darla: solo quien la imparte. Antes bastaba ser
        // profesor, de cualquier sección.
        await exigirClasePropia(request, classroomId, subjectId, 'dar clase');

        // La fecha la decide el servidor: con el reloj del dispositivo adelantado
        // (a mano o por VPN) se podría abrir la clase de un día que no ha llegado.
        const zonaLiceo = await instituteTimezone(prisma);
        if (isFutureDate(date, zonaLiceo)) {
            return reply.status(400).send({
                error: 'No se puede registrar una clase de una fecha futura',
                code: 'FUTURE_DATE',
                today: todayInTimezone(zonaLiceo),
            });
        }

        const parsedDate = parseDay(date);
        const startOfDay = new Date(parsedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const sessionData: any = { topic, observations, startTime, endTime };
        
        const session = await prisma.classSession.upsert({
            where: {
                classroomId_subjectId_date: {
                    classroomId,
                    subjectId,
                    date: startOfDay,
                },
            },
            update: sessionData,
            create: {
                publicId: randomUUID(),
                classroomId,
                subjectId,
                date: startOfDay,
                ...sessionData,
            },
        });

        return reply.status(201).send(session);
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error creating class session', {
            error: error instanceof Error ? error.message : String(error)
        });
        return reply.status(500).send({ error: 'Error al crear sesión de clase' });
    }
}

/**
 * Guardar detalle de clase en vivo: crea/actualiza la sesión y la asistencia de los estudiantes.
 */
export async function saveLiveClassSession(
    request: FastifyRequest<{
        Body: {
            classroomId: string;
            subjectId: string;
            date: string;
            topic?: string;
            observations?: string;
            observationsTitle?: string;
            involvedStudentIds?: string[];
            startTime?: string;
            endTime?: string;
            attendances?: Array<{ studentId: string; status: string; comments?: string; soloSiNoHay?: boolean }>;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, topic, observations, observationsTitle, involvedStudentIds, startTime, endTime, attendances = [] } = request.body;
        const prisma = request.tenantPrisma;
        const user = request.user as RequestUser;

        if (!classroomId || !subjectId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos: classroomId, subjectId, date' });
        }

        await exigirClasePropia(request, classroomId, subjectId, 'dar clase');

        // La lista que se pasa es la de ESTA sección. Sin mirarlo, el profesor
        // de 1.º A ponía ausente a un alumno de 1.º B —y le pisaba lo que su
        // profesor ya hubiera marcado ese día—, igual que ya no puede por
        // `/attendance` (`quien-puede-que.test.ts`).
        if (attendances.length > 0) {
            const ids = Array.from(new Set(attendances.map((a) => a.studentId)));
            const deLaSeccion = await prisma.studentClassroom.count({
                where: { classroomId, isActive: true, studentId: { in: ids } },
            });
            if (deLaSeccion !== ids.length) {
                return reply.status(403).send({
                    error: 'Solo se pasa asistencia a los alumnos de esta sección',
                    code: 'STUDENT_NOT_IN_CLASSROOM',
                });
            }
        }

        const parsedDate = new Date(date);
        const startOfDay = new Date(parsedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const result = await prisma.$transaction(
            async (tx: any) => {
            const sessionData: any = { topic, observations, startTime, endTime };
            if (observationsTitle !== undefined) sessionData.observationsTitle = observationsTitle;
            if (involvedStudentIds !== undefined) sessionData.involvedStudentIds = involvedStudentIds;

            // 1. Crear o actualizar sesión de forma atómica con ON CONFLICT
            const session = await tx.classSession.upsert({
                where: {
                    classroomId_subjectId_date: {
                        classroomId,
                        subjectId,
                        date: startOfDay,
                    },
                },
                update: sessionData,
                create: {
                    publicId: randomUUID(),
                    classroomId,
                    subjectId,
                    date: startOfDay,
                    ...sessionData,
                },
            });

            // 2. Registrar la asistencia EN BLOQUE
            //
            // Antes se hacía una consulta por alumno, una detrás de otra. Con 40
            // alumnos son 40 viajes a la base dentro del presupuesto de 5 segundos
            // que Prisma le da a una transacción; bajo carga se pasaba y la clase
            // entera se perdía ("Transaction already closed"). En la prueba de
            // escrituras eran 648 clases perdidas en 20 minutos.
            //
            // Así son unas pocas operaciones sin importar si la sección tiene 10
            // alumnos o 40.
            if (attendances.length > 0) {
                const idsDeAlumnos = attendances.map((a) => a.studentId);

                const yaTenian = new Set(
                    (
                        await tx.dailyAttendance.findMany({
                            where: { date: startOfDay, studentId: { in: idsDeAlumnos } },
                            select: { studentId: true },
                        })
                    ).map((a: { studentId: string }) => a.studentId)
                );

                const nuevas = attendances.filter((a) => !yaTenian.has(a.studentId));
                if (nuevas.length > 0) {
                    await tx.dailyAttendance.createMany({
                        data: nuevas.map((a) => ({
                            studentId: a.studentId,
                            classroomId,
                            status: a.status,
                            comments: a.comments,
                            date: startOfDay,
                            teacherId: user?.userId,
                            classSessionId: session.id,
                        })),
                        skipDuplicates: true,
                    });
                }

                // Las que ya estaban se corrigen agrupadas por lo que se les pone:
                // casi siempre son dos o tres grupos (presente, ausente, tarde).
                const porLoQueSeLesPone = new Map<string, string[]>();
                for (const a of attendances) {
                    if (!yaTenian.has(a.studentId)) continue;
                    // «Solo si no hay»: lo que la pantalla NO tocó y manda como
                    // se ve (presente por defecto). Si ya hay algo guardado —otra
                    // pantalla lo marcó mientras tanto—, se respeta (ASIS-DOS-01,
                    // SOLO-01…03). Antes se pisaba y un ausente volvía a presente.
                    if (a.soloSiNoHay) continue;
                    const clave = `${a.status}\u0000${a.comments ?? ''}`;
                    const grupo = porLoQueSeLesPone.get(clave);
                    if (grupo) grupo.push(a.studentId);
                    else porLoQueSeLesPone.set(clave, [a.studentId]);
                }

                for (const [clave, ids] of porLoQueSeLesPone) {
                    const [status, comentario] = clave.split('\u0000');
                    await tx.dailyAttendance.updateMany({
                        where: { date: startOfDay, studentId: { in: ids } },
                        data: {
                            status: status as any,
                            comments: comentario === '' ? null : comentario,
                            classSessionId: session.id,
                        },
                    });
                }
            }

            // 3. Vincular observaciones de esta sección y materia creadas en esta fecha que no tenían classSessionId
            const obsDateLte = new Date(startOfDay.getTime() + 30 * 3600 * 1000);
            await tx.observation.updateMany({
                where: {
                    classroomId,
                    subjectId,
                    date: { gte: startOfDay, lte: obsDateLte },
                    classSessionId: null,
                },
                data: { classSessionId: session.id },
            });

                return session;
            },
            {
                // Bajo carga la base responde más lento; con el presupuesto justo de
                // 5 s la clase se perdía entera. Ahora la operación es corta, pero se
                // le deja aire para no perder el trabajo del profesor por un pico.
                timeout: 20000,
                maxWait: 10000,
            }
        );

        // Guardar la clase mueve la asistencia de esa sección: le toca a esos
        // alumnos, a sus representantes y al personal de la sección. A los demás
        // no les cambió nada.
        request.aQuienAfecta = {
            studentIds: (attendances || []).map((a) => a.studentId).filter(Boolean),
            classroomId,
        };

        return reply.status(200).send({ success: true, session: result });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error saving live class session', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al guardar la clase' });
    }
}

/**
 * Obtener actividades/tareas de una materia en una sección.
 */
export async function getClassActivities(
    request: FastifyRequest<{ Querystring: { classroomId: string; subjectId: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId } = request.query;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId) {
            return reply.status(400).send({ error: 'Faltan parámetros: classroomId, subjectId' });
        }

        let targetSubjectId = subjectId;
        const sub = await prisma.subject.findFirst({
            where: { OR: [{ id: subjectId }, { slug: subjectId }] },
            select: { id: true },
        });
        if (sub) targetSubjectId = sub.id;

        await exigirClasePropia(request, classroomId, targetSubjectId, 'ver las actividades');

        const activities = await prisma.classActivity.findMany({
            where: { classroomId, subjectId: targetSubjectId },
            include: {
                classSession: {
                    select: { id: true, date: true, startTime: true, endTime: true },
                },
            },
            orderBy: [{ isDone: 'asc' }, { createdAt: 'desc' }],
        });

        return reply.status(200).send({ activities });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error getting class activities', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al obtener actividades' });
    }
}

/**
 * Crear una actividad/tarea para la clase actual o la próxima.
 */
export async function createClassActivity(
    request: FastifyRequest<{
        Body: {
            classroomId: string;
            subjectId: string;
            title: string;
            description?: string;
            type?: string;
            target?: string;
            tag?: string;
            dueDate?: string;
            maxScore?: number;
            planRowId?: string;
            classSessionId?: string;
            /** El día de la clase que se ve («YYYY-MM-DD»). */
            date?: string;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const {
            classroomId,
            subjectId,
            title,
            description,
            type = 'TAREA',
            target = 'NEXT',
            tag,
            dueDate,
            maxScore = 20,
            planRowId,
            classSessionId,
            date,
        } = request.body;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !title) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos' });
        }
        if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return reply.status(400).send({ error: 'Fecha inválida', code: 'FECHA_INVALIDA' });
        }

        let targetSubjectId = subjectId;
        const sub = await prisma.subject.findFirst({
            where: { OR: [{ id: subjectId }, { slug: subjectId }] },
            select: { id: true },
        });
        if (sub) targetSubjectId = sub.id;

        await exigirClasePropia(request, classroomId, targetSubjectId, 'dejar actividades');
        const zonaLiceo = await instituteTimezone(prisma);

        // La clase donde nace: la que manda la pantalla (si es de ESTA clase) o
        // la del día que se ve. Sin ella la actividad no salía en ninguna lista.
        let sesion: { id: string; date: Date } | null = null;
        if (classSessionId) {
            sesion = await prisma.classSession.findFirst({
                where: { id: classSessionId, classroomId, subjectId: targetSubjectId },
                select: { id: true, date: true },
            });
            if (!sesion) {
                return reply.status(400).send({ error: 'Esa clase no es de esta sección y materia', code: 'SESION_AJENA' });
            }
        } else if (date) {
            if (isFutureDate(date, zonaLiceo)) {
                return reply.status(400).send({
                    error: 'Esa clase todavía no ha llegado: crea la actividad hoy y ponle fecha de entrega',
                    code: 'FUTURE_DATE',
                    today: todayInTimezone(zonaLiceo),
                });
            }
            sesion = await sesionDelDia(prisma, classroomId, targetSubjectId, date);
        }

        // A qué evaluación del plan suma: la de la semana en que se entrega
        // (si tiene fecha) o la de la clase donde nace. Una candidata, esa;
        // varias, la que elija el profesor; ninguna, no suma (formativa).
        const diaDeLaSemana = dueDate || (sesion ? sesion.date.toISOString().slice(0, 10) : date) || todayInTimezone(zonaLiceo);
        const { evaluaciones, planConPuntos } = await evaluacionesDeLaFecha(
            prisma,
            classroomId,
            targetSubjectId,
            parseDayDate(diaDeLaSemana)
        );
        let fila: string | null = null;
        // Lo que mande la pantalla solo vale si es una de ellas (la de una
        // pantalla vieja puede ser la fila vacía de la semana, o ajena).
        if (planRowId && evaluaciones.some((e) => e.id === planRowId)) {
            fila = planRowId;
        } else if (evaluaciones.length === 1) {
            fila = evaluaciones[0].id;
        } else if (evaluaciones.length > 1) {
            return reply.status(400).send({
                error: 'Esta semana tiene varias evaluaciones en el plan: elige a cuál suma la actividad',
                code: 'ELIGE_LA_EVALUACION',
                evaluaciones,
            });
        }

        const activity = await prisma.classActivity.create({
            data: {
                classroomId,
                subjectId: targetSubjectId,
                title,
                description,
                type,
                target,
                tag: tag || type,
                dueDate: dueDate ? parseDayDate(dueDate) : null,
                maxScore: maxScore ? Number(maxScore) : 20,
                scores: {},
                planRowId: fila,
                classSessionId: sesion?.id ?? null,
            },
        });
        // Si su evaluación del plan tiene instrumento, se califica con él.
        const def = fila ? await instrumentoDeLaActividad(prisma, { id: activity.id, instrumento: null, planRowId: fila }) : null;
        if (def) {
            Object.assign(
                activity,
                await prisma.classActivity.update({ where: { id: activity.id }, data: { instrumento: def as any, maxScore: maximoDelInstrumento(def), detalleDelInstrumento: {} } })
            );
        }

        // Una actividad nueva cambia el horario en vivo de ESA sección: sus
        // alumnos, sus representantes y su personal. Sin esta línea se tiraba la
        // copia guardada del liceo entero.
        request.aQuienAfecta = { classroomId };

        // Dónde sale en la clase que se ve: la pantalla lo dice tal cual, y no
        // «añadida» si no se va a ver.
        const diaVisto = date || (sesion ? sesion.date.toISOString().slice(0, 10) : todayInTimezone(zonaLiceo));
        const { dondeSale } = clasificar({ ...activity, classSession: sesion }, diaVisto, sesion?.id, zonaLiceo);
        return reply.status(201).send({ activity, dondeSale, sumaALaNota: Boolean(fila) || !planConPuntos });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error creating class activity', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al crear actividad' });
    }
}

/**
 * Actualizar una actividad (marcar hecha, editar título/descripción/puntajes).
 */
export async function updateClassActivity(
    request: FastifyRequest<{
        Params: { activityId: string };
        Body: {
            title?: string;
            description?: string;
            type?: string;
            target?: string;
            tag?: string;
            dueDate?: string;
            maxScore?: number;
            scores?: Record<string, any>;
            isDone?: boolean;
            carriedOver?: boolean;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { activityId } = request.params;
        const {
            title,
            description,
            type,
            target,
            tag,
            dueDate,
            maxScore,
            scores,
            isDone,
            carriedOver
        } = request.body;
        const prisma = request.tenantPrisma;

        const propia = await exigirActividadPropia(request, activityId, 'cambiar actividades');
        if (!propia) {
            return reply.status(404).send({ error: 'Actividad no encontrada' });
        }

        // Las notas que vengan aquí se AÑADEN, como en la puerta de las notas:
        // antes reemplazaban el mapa entero y borraban las del resto de la clase.
        if (scores !== undefined) {
            // Con instrumento, la nota sale de las marcas: a mano, solo al alumno
            // evaluado de otra forma (INSTR-05).
            const noSe = await notaAManoProhibida(prisma, activityId, Object.keys(scores || {}));
            if (noSe) {
                return reply.status(409).send({
                    error: 'Esta actividad se califica con el instrumento de su evaluación del plan: marca sus casillas',
                    code: 'NOTA_POR_INSTRUMENTO',
                });
            }
            const actual = await prisma.classActivity.findUnique({
                where: { id: activityId },
                select: { maxScore: true, scores: true },
            });
            const escala = maxScore !== undefined ? (maxScore ? Number(maxScore) : 20) : (actual?.maxScore ?? 20);
            const problema = revisarNotas(scores, escala);
            if (problema) {
                return reply.status(400).send({ error: problema, code: 'NOTA_NO_VALIDA' });
            }
            await arreglarNotasGuardadasComoTexto(prisma as any, activityId, actual?.scores);
            await sumarNotas(prisma as any, activityId, scores as Notas);
        }

        const activity = await prisma.classActivity.update({
            where: { id: activityId },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(type !== undefined && { type }),
                ...(target !== undefined && { target }),
                ...(tag !== undefined && { tag }),
                ...(dueDate !== undefined && { dueDate: dueDate ? parseDayDate(dueDate) : null }),
                ...(maxScore !== undefined && { maxScore: maxScore ? Number(maxScore) : 20 }),
                ...(isDone !== undefined && { isDone }),
                ...(carriedOver !== undefined && { carriedOver }),
            },
        });

        request.aQuienAfecta = { classroomId: propia.classroomId };

        return reply.status(200).send({ activity });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error updating class activity', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al actualizar actividad' });
    }
}

/**
 * Guardar o actualizar calificaciones de una actividad de clase.
 */
export async function saveClassActivityGrades(
    request: FastifyRequest<{
        Params: { activityId: string };
        Body: {
            scores: Record<string, number | null>;
            maxScore?: number;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { activityId } = request.params;
        const { scores = {}, maxScore } = request.body;
        const prisma = request.tenantPrisma;

        const activity = await prisma.classActivity.findUnique({ where: { id: activityId } });
        if (!activity) {
            return reply.status(404).send({ error: 'Actividad no encontrada' });
        }

        await exigirActividadPropia(request, activityId, 'dar notas');

        // Con instrumento, la nota sale de las marcas: a mano, solo al alumno
        // evaluado de otra forma (INSTR-05).
        const noSe = await notaAManoProhibida(prisma, activityId, Object.keys(scores || {}));
        if (noSe) {
            return reply.status(409).send({
                error: 'Esta actividad se califica con el instrumento de su evaluación del plan: marca sus casillas',
                code: 'NOTA_POR_INSTRUMENTO',
            });
        }

        const escala = maxScore !== undefined ? Number(maxScore) : (activity.maxScore ?? 20);
        const problema = revisarNotas(scores, escala);
        if (problema) {
            return reply.status(400).send({ error: problema, code: 'NOTA_NO_VALIDA' });
        }

        // Se añaden a lo guardado en la misma escritura: ver `utils/notas-de-clase.ts`.
        await arreglarNotasGuardadasComoTexto(prisma as any, activityId, activity.scores);
        await sumarNotas(prisma as any, activityId, scores as Notas, maxScore);
        const updated = await prisma.classActivity.findUnique({ where: { id: activityId } });

        // A quién le toca: a los alumnos que recibieron nota y al personal de la
        // sección. Antes se avisaba al liceo entero: con los profesores
        // calificando a la vez, eso manda a todos los lectores a la base de datos
        // sin que a ninguno le haya cambiado nada.
        request.aQuienAfecta = {
            studentIds: Object.keys(scores || {}),
            classroomId: (activity as any)?.classroomId || undefined,
        };

        return reply.status(200).send({ success: true, activity: updated });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error saving activity grades', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al guardar calificaciones de la actividad' });
    }
}

/**
 * EVALUAR A UN ALUMNO DE OTRA FORMA EN UNA ACTIVIDAD
 *
 * Un alumno que no puede hacer deporte se evalúa con el cuaderno; uno con una
 * adaptación, con un trabajo escrito. Queda dicho en la actividad, alumno por
 * alumno: cómo se le evaluó y por qué. Su nota se pone igual que la de los
 * demás y cuenta igual (mismo peso en el plan): lo que cambia es el método,
 * no la regla. Lo ven él y su representante en «Mi clase».
 *
 * `metodo` vacío o DELETE = se quita (vuelve a evaluarse como los demás).
 * Solo el profesor de esa clase o el admin (`exigirActividadPropia`).
 */
export async function evaluarDeOtraForma(
    request: FastifyRequest<{
        Params: { activityId: string; studentId: string };
        Body?: { metodo?: string; motivo?: string | null };
    }>,
    reply: FastifyReply
) {
    try {
        const { activityId, studentId } = request.params;
        const prisma = request.tenantPrisma;

        const propia = await exigirActividadPropia(request, activityId, 'dar notas');
        if (!propia) return reply.status(404).send({ error: 'Actividad no encontrada' });

        const metodo = typeof request.body?.metodo === 'string' ? request.body.metodo.trim() : '';
        const motivo = typeof request.body?.motivo === 'string' ? request.body.motivo.trim() : '';
        const quitar = request.method === 'DELETE' || metodo === '';

        if (!quitar) {
            if (metodo.length > 60) {
                return reply.status(400).send({ error: 'Cómo se le evalúa: 60 letras como mucho', code: 'METODO_MUY_LARGO' });
            }
            if (motivo.length > 200) {
                return reply.status(400).send({ error: 'El motivo: 200 letras como mucho', code: 'MOTIVO_MUY_LARGO' });
            }
            // Un alumno de ESA sección: no se anota a cualquiera en la actividad.
            const inscrito = await prisma.studentClassroom.findFirst({
                where: { studentId, classroomId: propia.classroomId, isActive: true },
                select: { id: true },
            });
            if (!inscrito) {
                return reply.status(400).send({ error: 'Ese alumno no es de esta sección', code: 'ALUMNO_AJENO' });
            }
        }

        // En la misma escritura (jsonb), como las notas: dos profesores no se
        // pisan el uno al otro al anotar a alumnos distintos a la vez.
        if (quitar) {
            await prisma.$executeRaw`
                UPDATE "class_activities"
                   SET "evaluadoDeOtraForma" = COALESCE("evaluadoDeOtraForma", '{}'::jsonb) - ${studentId}::text,
                       "updatedAt" = now()
                 WHERE id = ${activityId}`;
        } else {
            const valor = JSON.stringify({ metodo, ...(motivo ? { motivo } : {}) });
            await prisma.$executeRaw`
                UPDATE "class_activities"
                   SET "evaluadoDeOtraForma" = COALESCE("evaluadoDeOtraForma", '{}'::jsonb) || jsonb_build_object(${studentId}::text, ${valor}::jsonb),
                       "updatedAt" = now()
                 WHERE id = ${activityId}`;
        }

        const actividad = await prisma.classActivity.findUnique({ where: { id: activityId } });
        request.aQuienAfecta = { studentIds: [studentId], classroomId: propia.classroomId };
        return reply.status(200).send({ success: true, activity: actividad });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error anotando la otra forma de evaluar', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'No se pudo guardar cómo se le evalúa' });
    }
}

/**
 * Eliminar una actividad.
 */
export async function deleteClassActivity(
    request: FastifyRequest<{ Params: { activityId: string } }>,
    reply: FastifyReply
) {
    try {
        const { activityId } = request.params;
        const prisma = request.tenantPrisma;

        const propia = await exigirActividadPropia(request, activityId, 'borrar actividades');
        if (!propia) {
            return reply.status(404).send({ error: 'Actividad no encontrada' });
        }

        await borrarGuardandoCopia(prisma, 'classActivity', { id: activityId }, quienBorra(request as any));

        request.aQuienAfecta = { classroomId: propia.classroomId };

        return reply.status(200).send({ success: true });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error deleting class activity', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al eliminar actividad' });
    }
}

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
 * Calcular el número de semana lectiva de una fecha para una materia.
 * Usa fechaDesde del plan; si no existe, el inicio del año académico.
 */
async function getPlanWeekNumber(
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

/**
 * Buscar estudiantes de todo el instituto (cualquier sección o año) para
 * agregarlos como involucrados en una clase.
 */
export async function searchStudentsForSession(
    request: FastifyRequest<{ Querystring: { search?: string } }>,
    reply: FastifyReply
) {
    try {
        const { search } = request.query;
        const prisma = request.tenantPrisma;

        const where: any = { role: 'STUDENT', isActive: true };
        /**
         * El profesor encuentra a los alumnos de las secciones donde da clase o
         * es guía; el admin, a todos. Antes cualquier profesor sacaba el nombre,
         * la cédula, la foto y la sección de cualquier alumno del liceo con solo
         * escribir una letra (HUECOS_ABIERTOS de `quien-puede-que.test.ts`).
         */
        const quien = request.user as any;
        if (quien?.role !== 'ADMIN') {
            const secciones = await teacherClassroomIds(prisma, quien?.userId ?? quien?.id ?? '');
            where.studentClassrooms = { some: { isActive: true, classroomId: { in: secciones } } };
        }
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { studentCode: { contains: search, mode: 'insensitive' } },
                { id: { contains: search } },
            ];
        }

        const students = await prisma.user.findMany({
            where,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                studentCode: true,
                studentClassrooms: {
                    where: { isActive: true },
                    take: 1,
                    select: {
                        classroom: {
                            select: {
                                id: true,
                                name: true,
                                academicYear: { select: { name: true } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            take: 50,
        });

        const mapped = students.map((s: any) => {
            const activeClassroom = s.studentClassrooms?.[0]?.classroom || null;
            return {
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                avatar: s.avatar,
                studentCode: s.studentCode,
                classroomName: activeClassroom?.name || null,
                academicYearName: activeClassroom?.academicYear?.name || null,
                classroomId: activeClassroom?.id || null,
            };
        });

        return reply.status(200).send({ students: mapped });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error searching students for session', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al buscar estudiantes' });
    }
}

const PLAN_ROW_FIELDS = [
    'title', 'label', 'textContent', 'actividadEval', 'tecnicas',
    'instrumentos', 'criterios', 'tipoEvaluacion', 'ponderacion', 'puntos',
];

/**
 * Guardar la fila del plan de evaluación de la semana actual desde la clase en vivo.
 * Espejo del plan: si no existe la fila EVALUATION de la semana, se crea.
 * Persiste columnas personalizadas en metadata.customColumns y valores extra en extraData.
 */
export async function savePlanWeekRow(
    request: FastifyRequest<{
        Body: {
            classroomId: string;
            subjectId: string;
            date: string;
            values: Record<string, any>;
            columns?: Array<{ key: string; label: string; mergeable?: boolean; numeric?: boolean }>;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, values = {}, columns } = request.body;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos: classroomId, subjectId, date' });
        }

        await exigirClasePropia(request, classroomId, subjectId, 'planificar');

        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return reply.status(400).send({ error: 'Fecha inválida' });
        }

        // 1. El plan de ESE lapso (para lapso y columnas)
        const { meta: delLapso, sem } = await planDeLaFecha(prisma, classroomId, subjectId, parsedDate);
        if (sem.antesDelPlan) {
            return reply.status(400).send({
                error: `Esta semana es de ${sem.nombreAntesDelPlan.toLowerCase()}: el plan de evaluación empieza el ${sem.inicioDelPlan!.toISOString().slice(0, 10).split('-').reverse().join('/')}.`,
                code: 'ANTES_DEL_PLAN',
            });
        }
        let meta = delLapso;

        // Si no existe metadata, crearla mínima, del lapso de esa fecha
        if (!meta) {
            meta = await prisma.evaluationPlanMetadata.create({
                data: { classroomId, subjectId, lapso: sem.lapso ?? '1' },
            });
        }

        // 2. Guardar columnas personalizadas si vienen
        if (Array.isArray(columns)) {
            const cleaned = columns.filter((c: any) => c && c.key && c.label);
            await prisma.evaluationPlanMetadata.update({
                where: { id: meta.id },
                data: { customColumns: JSON.stringify(cleaned) },
            });
        }

        // 3. Calcular semana
        const weekNumber = (await getPlanWeekNumber(prisma, classroomId, subjectId, parsedDate))?.semana;
        if (!weekNumber) {
            return reply.status(400).send({ error: 'No se pudo determinar la semana del plan (falta fecha de inicio del ciclo)' });
        }

        // 4. Separar valores conocidos vs extras (columnas personalizadas)
        // Solo actualizar los campos que vienen en values (partial update)
        const known: Record<string, any> = {};
        const extra: Record<string, any> = {};
        Object.entries(values).forEach(([k, v]) => {
            if (PLAN_ROW_FIELDS.includes(k)) known[k] = v;
            else extra[k] = v;
        });

        // 5. Upsert de la fila EVALUATION de la semana (partial update)
        const existing = await prisma.evaluationPlanRow.findFirst({
            where: { classroomId, subjectId, lapso: meta.lapso, weekNumber, rowType: 'EVALUATION' },
        });

        // Solo tocar los campos que vienen explicitamente en values
        const rowData: any = {};
        PLAN_ROW_FIELDS.forEach(field => {
            if (field in known) {
                if (field === 'ponderacion' || field === 'puntos') {
                    rowData[field] = known[field] !== null && known[field] !== ''
                        ? parseFloat(known[field]) : null;
                } else {
                    rowData[field] = known[field] !== undefined ? known[field] : null;
                }
            }
        });

        // extraData: mezclar con existente si hay
        if (Object.keys(extra).length > 0) {
            let existingExtra: any = {};
            if (existing?.extraData) {
                try { existingExtra = JSON.parse(existing.extraData); } catch { /* ignorar */ }
            }
            rowData.extraData = JSON.stringify({ ...existingExtra, ...extra });
        }

        let savedRow;
        if (existing) {
            savedRow = await prisma.evaluationPlanRow.update({
                where: { id: existing.id },
                data: rowData,
            });
        } else {
            const count = await prisma.evaluationPlanRow.count({
                where: { classroomId, subjectId, lapso: meta.lapso },
            });
            savedRow = await prisma.evaluationPlanRow.create({
                data: {
                    classroomId,
                    subjectId,
                    lapso: meta.lapso,
                    rowType: 'EVALUATION',
                    weekNumber,
                    orderIndex: count,
                    ...rowData,
                },
            });
        }

        return reply.status(200).send({ success: true, row: savedRow, weekNumber });
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error saving plan week row', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al guardar la fila del plan' });
    }
}
