import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';
import { RequestUser } from '../types/fastify';
import { planWeekNumberFromRange, planWeekRangeFromRange } from '../utils/plan-weeks';
import { instituteTimezone, isFutureDate, todayInTimezone } from '../utils/school-time';
import { assertClassroomScope } from '../services/authorization.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';

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

        // 1. Sesión de clase existente para esta materia y fecha
        const session = await prisma.classSession.findFirst({
            where: { classroomId, subjectId: targetSubjectId, date: { gte: startOfDay, lte: endOfDay } },
        });

        // 2. Materia y docente (vía ClassroomSubject)
        const classroomSubject = await prisma.classroomSubject.findFirst({
            where: { classroomId, subjectId: targetSubjectId },
            include: {
                subject: { select: { id: true, name: true, color: true, slug: true } },
                teacher: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        // 3. Estudiantes de la sección (vía StudentClassroom oficial)
        const enrollments = await prisma.studentClassroom.findMany({
            where: { classroomId, isActive: true },
            include: {
                student: {
                    select: { id: true, firstName: true, lastName: true, avatar: true, studentCode: true, isActive: true }
                }
            },
            orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
        });
        const students = enrollments.map((e: any) => e.student).filter((s: any) => s && s.isActive);

        // 4. Asistencia de ese día para los estudiantes
        const attendances = await prisma.dailyAttendance.findMany({
            where: { classroomId, date: { gte: startOfDay, lte: endOfDay } },
        });
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
        let weekNumber: number | undefined;
        let planContent: any = undefined;
        let planLapso: string | null = null;
        let planColumns: any = null;
        let weekRow: any = null;

        const meta = await prisma.evaluationPlanMetadata.findFirst({
            where: { classroomId, subjectId: targetSubjectId },
        });

        if (meta) {
            planLapso = meta.lapso;
            // Columnas personalizadas guardadas en metadata
            if (meta.customColumns) {
                try {
                    const parsed = JSON.parse(meta.customColumns);
                    if (Array.isArray(parsed) && parsed.length > 0) planColumns = parsed;
                } catch { /* ignorar columnas inválidas */ }
            }

            // Calcular la semana usando fechaDesde del plan; si no existe, usar el inicio del año académico
            let lapsoStart: Date | null = meta.fechaDesde ? new Date(meta.fechaDesde) : null;

            if (!lapsoStart) {
                const classroom = await prisma.classroom.findUnique({
                    where: { id: classroomId },
                    select: { academicYear: { select: { startDate: true } } },
                });
                if (classroom?.academicYear?.startDate) {
                    lapsoStart = new Date(classroom.academicYear.startDate);
                }
            }

            if (lapsoStart) {
                // CORRECCIÓN: semanas alineadas a LUNES (ver utils/plan-weeks.ts)
                weekNumber = planWeekNumberFromRange(lapsoStart, dayDate);

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

        // 6. Actividades/tareas de la materia
        const activities = await prisma.classActivity.findMany({
            where: { classroomId, subjectId: targetSubjectId },
            include: {
                classSession: {
                    select: { id: true, date: true },
                },
            },
            orderBy: [{ isDone: 'asc' }, { createdAt: 'desc' }],
        });

        // 6.1. Clasificación RELATIVA A ESTA CLASE:
        // - "Clase de Hoy": tareas cuya fecha de entrega sea la fecha de esta clase (dueOnClassDate),
        //   o actividades realizadas en esta misma sesión (target === 'CURRENT' && createdOnThisClass).
        // - "Próxima Clase": actividades CREADAS / ASIGNADAS en ESTA sesión (createdOnThisClass)
        //   para ser entregadas en una fecha futura. No se arrastran a todas las semanas arbitrariamente.
        const classDateNoon = dayDate;
        const dayOf = (dd: Date) => new Date(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate());
        const classDay = dayOf(classDateNoon);

        const activitiesWithDue = activities.map(a => {
            const createdDay = a.classSession?.date ? dayOf(new Date(a.classSession.date)) : dayOf(new Date(a.createdAt));
            const boundToSession = Boolean(a.classSessionId && session?.id && a.classSessionId === session.id);
            const createdOnThisClass = Boolean(boundToSession || createdDay.getTime() === classDay.getTime());

            const dueDay = a.dueDate ? dayOf(new Date(a.dueDate)) : null;
            const dueOnClassDate = Boolean(dueDay && dueDay.getTime() === classDay.getTime());

            const dueToday = Boolean(dueOnClassDate || (a.target === 'CURRENT' && createdOnThisClass));
            // REGLA DEL PRODUCTO — no cambiar sin hablarlo:
            // Una actividad para la PRÓXIMA clase se anuncia SOLO en la clase donde
            // se creó (`createdOnThisClass`). Dos motivos:
            //   1. así se sabe en qué clase se mandó, y
            //   2. si se anunciara en todas las clases anteriores, 'Próxima clase'
            //      se llenaría de actividades acumuladas.
            // El día que toca entregarla aparece como 'Clase de hoy' por su fecha
            // (`dueOnClassDate`), esté donde esté el profesor.
            const isFuture = Boolean(a.target === 'NEXT' && createdOnThisClass && !dueToday);

            return {
                ...a,
                createdDate: createdDay.toISOString(),
                createdOnThisClass,
                belongsToSession: createdOnThisClass,
                dueToday,
                isFuture,
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

        return reply.status(200).send({
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
            planContent,
            planColumns,
            planLapso: planLapso || '1',
            weekRow,
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

        const parsedDate = new Date(date);
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
            attendances?: Array<{ studentId: string; status: string; comments?: string }>;
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
        } = request.body;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !title) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos' });
        }

        let targetSubjectId = subjectId;
        const sub = await prisma.subject.findFirst({
            where: { OR: [{ id: subjectId }, { slug: subjectId }] },
            select: { id: true },
        });
        if (sub) targetSubjectId = sub.id;

        await exigirClasePropia(request, classroomId, targetSubjectId, 'dejar actividades');

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
                planRowId: planRowId || null,
                classSessionId: classSessionId || null,
            },
        });

        return reply.status(201).send({ activity });
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
                ...(scores !== undefined && { scores }),
                ...(isDone !== undefined && { isDone }),
                ...(carriedOver !== undefined && { carriedOver }),
            },
        });

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

        let existingScores: Record<string, any> = {};
        if (activity.scores) {
            try {
                existingScores = typeof activity.scores === 'string' ? JSON.parse(activity.scores) : (activity.scores as Record<string, any>);
            } catch { existingScores = {}; }
        }

        const mergedScores = { ...existingScores, ...scores };

        const updated = await prisma.classActivity.update({
            where: { id: activityId },
            data: {
                scores: mergedScores,
                ...(maxScore !== undefined && { maxScore: Number(maxScore) }),
            },
        });

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
 * Obtener el tema generador (plan de la semana) por materia para una sección y fecha.
 * Se usa para enriquecer el "Horario en Vivo" sin tener que abrir el detalle de cada clase.
 */
export async function getLiveOverview(
    request: FastifyRequest<{ Querystring: { classroomId: string; date: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, date } = request.query;
        const prisma = request.tenantPrisma;

        if (!classroomId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros: classroomId, date' });
        }

        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return reply.status(400).send({ error: 'Fecha inválida' });
        }
        // Día intencionado a mediodía LOCAL (ver getLiveClassDetail)
        const dayDate = parseDayDate(date);

        // Para cada materia de la sección, calcular la semana y obtener el tema generador (HEADER)
        const subjects = await prisma.classroomSubject.findMany({
            where: { classroomId },
            include: { subject: { select: { id: true, name: true, color: true } } },
        });

        // Fecha de referencia del año académico para calcular la semana
        const classroom = await prisma.classroom.findUnique({
            where: { id: classroomId },
            select: { academicYear: { select: { startDate: true } } },
        });
        const yearStart = classroom?.academicYear?.startDate ? new Date(classroom.academicYear.startDate) : null;

        const result: Record<string, { subjectName: string; color?: string; weekNumber?: number; temaGenerador?: string; firstColumnLabel?: string; activitiesCount?: number; todayActivitiesCount?: number; nextActivitiesCount?: number }> = {};

        for (const cs of subjects) {
            const meta = await prisma.evaluationPlanMetadata.findFirst({
                where: { classroomId, subjectId: cs.subject.id },
            });

            let weekNumber: number | undefined;
            let temaGenerador: string | undefined;

            if (meta) {
                let lapsoStart: Date | null = meta.fechaDesde ? new Date(meta.fechaDesde) : yearStart;

                if (lapsoStart) {
                    // CORRECCIÓN: semanas alineadas a LUNES (ver utils/plan-weeks.ts)
                    weekNumber = planWeekNumberFromRange(lapsoStart, dayDate);

                    const planRow = await prisma.evaluationPlanRow.findFirst({
                        where: {
                            classroomId,
                            subjectId: cs.subject.id,
                            lapso: meta.lapso,
                            weekNumber,
                        },
                        orderBy: { orderIndex: 'asc' },
                    });
                    temaGenerador = planRow?.title || undefined;
                }
            }

            // Actividades de esta materia en la sección para la fecha dada
            const allActivities = await prisma.classActivity.findMany({
                where: {
                    classroomId,
                    subjectId: cs.subject.id,
                },
            });

            const dayOf = (dd: Date) => new Date(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate());
            const classDay = dayOf(dayDate);

            let todayActivitiesCount = 0;
            let nextActivitiesCount = 0;

            for (const a of allActivities) {
                const dueDay = a.dueDate ? dayOf(a.dueDate) : null;
                const isDueToday = Boolean(dueDay && dueDay.getTime() === classDay.getTime());
                const isCreatedToday = dayOf(a.createdAt).getTime() === classDay.getTime();

                if (a.target === 'CURRENT') {
                    if (isDueToday || isCreatedToday) todayActivitiesCount++;
                } else if (a.target === 'NEXT') {
                    if (isDueToday) {
                        todayActivitiesCount++;
                    } else if (!a.dueDate || (dueDay && dueDay.getTime() > classDay.getTime())) {
                        nextActivitiesCount++;
                    }
                }
            }

            const activitiesCount = allActivities.length;

            // Obtener el nombre de la primera columna del plan
            let firstColumnLabel = 'Tema Generador';
            if (meta?.customColumns) {
                try {
                    const cols = typeof meta.customColumns === 'string' ? JSON.parse(meta.customColumns) : meta.customColumns;
                    if (Array.isArray(cols) && cols.length > 0 && cols[0].label) {
                        firstColumnLabel = cols[0].label;
                    }
                } catch {}
            }

            result[cs.subject.id] = {
                subjectName: cs.subject.name,
                color: cs.subject.color || undefined,
                weekNumber,
                temaGenerador,
                firstColumnLabel,
                activitiesCount,
                todayActivitiesCount,
                nextActivitiesCount,
            };
        }

        return reply.status(200).send({ overview: result });
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
        Body: { classroomId: string; subjectId: string; date: string; reason?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, reason } = request.body;
        const prisma = request.tenantPrisma;
        const user = request.user as RequestUser;

        if (!classroomId || !subjectId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos' });
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

            return {
                session,
                carriedOverCount: pendingNext.length,
                ...mergeResult,
            };
        });

        return reply.status(200).send({
            success: true,
            session: result.session,
            carriedOverCount: result.carriedOverCount,
            mergedWeek: result.mergedWeek,
            mergedTemaGenerador: result.mergedTemaGenerador,
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
): Promise<number | null> {
    const meta = await prisma.evaluationPlanMetadata.findFirst({
        where: { classroomId, subjectId },
    });
    if (!meta) return null;

    let lapsoStart: Date | null = meta.fechaDesde ? new Date(meta.fechaDesde) : null;

    if (!lapsoStart) {
        const classroom = await prisma.classroom.findUnique({
            where: { id: classroomId },
            select: { academicYear: { select: { startDate: true } } },
        });
        if (classroom?.academicYear?.startDate) {
            lapsoStart = new Date(classroom.academicYear.startDate);
        }
    }

    if (!lapsoStart) return null;

    // CORRECCIÓN: semanas alineadas a LUNES (Semana 2 inicia en el primer lunes
    // posterior a la semana inicial; ver utils/plan-weeks.ts).
    return planWeekNumberFromRange(lapsoStart, date);
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
    const currentWeek = await getPlanWeekNumber(prisma, classroomId, subjectId, date);
    if (!currentWeek) return { mergedWeek: null, mergedTemaGenerador: false };

    const currentHeader = await prisma.evaluationPlanRow.findFirst({
        where: { classroomId, subjectId, weekNumber: currentWeek, rowType: 'HEADER' },
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
        where: { classroomId, subjectId, weekNumber: nextWeek, rowType: 'HEADER' },
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

        // 1. Metadata del plan (para lapso y columnas)
        let meta = await prisma.evaluationPlanMetadata.findFirst({
            where: { classroomId, subjectId },
        });

        // Si no existe metadata, crearla mínima
        if (!meta) {
            meta = await prisma.evaluationPlanMetadata.create({
                data: { classroomId, subjectId, lapso: '1' },
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
        const weekNumber = await getPlanWeekNumber(prisma, classroomId, subjectId, parsedDate);
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
