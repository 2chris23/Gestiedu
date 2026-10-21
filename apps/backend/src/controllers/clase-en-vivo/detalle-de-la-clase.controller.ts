import { planDeLaFecha, parseDayDate } from './sesion-de-clase.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { instituteTimezone } from '../../utils/school-time';
import { assertClassroomScope } from '../../services/authorization.service';
import { clasificar, diaDeLaActividad } from '../../utils/actividad-del-dia';
import { evaluacionesDeLaFecha } from '../../services/evaluacion-de-la-semana.service';
import { avisarSiFalla } from '../../utils/sin-callar';

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
            }).catch(avisarSiFalla('classSessions.controller'));
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
