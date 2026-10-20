/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { promediosDeLaSeccion } from '../services/aggregation.service';
import { getAcademicConfig } from '../services/promotion/configuracion-academica';
import { findTeacherAssignmentConflicts } from '../services/schedule-conflicts.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { horasDeLosBloques } from '../services/personal.service';
import { noQuitarConTrabajo } from '../services/secciones-de-la-materia.service';

interface AssignSubjectToClassroomRequest {
    Params: {
        classroomId: string;
    };
    Body: {
        subjectId: string;
        teacherId?: string;
        weeklyBlocks?: number;
    };
}

interface UpdateClassroomSubjectRequest {
    Params: {
        classroomId: string;
        subjectId: string;
    };
    Body: {
        teacherId?: string;
        weeklyBlocks?: number;
        hoursPerWeek?: number;
    };
}

interface GetClassroomSubjectsRequest {
    Params: {
        classroomId: string;
    };
    Querystring: {
        page?: number;
        limit?: number;
    };
}

interface RemoveSubjectFromClassroomRequest {
    Params: {
        classroomId: string;
        subjectId: string;
    };
}

interface AssignTeacherToSubjectRequest {
    Params: {
        classroomId: string;
        subjectId: string;
    };
    Body: {
        /** `null` quita el profesor de la clase. */
        teacherId: string | null;
        notes?: string;
    };
}

interface GetTeacherHistoryRequest {
    Params: {
        classroomId: string;
        subjectId: string;
    };
}

/**
 * Obtener todas las materias asignadas a una sección
 */
export async function getClassroomSubjects(
    request: FastifyRequest<GetClassroomSubjectsRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const { page = 1, limit = 50 } = request.query;

        // Calcular skip para paginación
        const skip = (page - 1) * limit;

        const where: any = { classroomId };
        if (request.user?.role === 'TEACHER') {
            where.teacherId = request.user.userId;
        }

        // Obtener total de registros
        const total = await request.tenantPrisma.classroomSubject.count({
            where,
        });

        const subjects = await request.tenantPrisma.classroomSubject.findMany({
            where,
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        color: true,
                        description: true,
                        evaluacion: true,
                    },
                },
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                    },
                },
                scheduleBlocks: {
                    select: {
                        id: true,
                        dayOfWeek: true,
                        startTime: true,
                        endTime: true,
                        location: true,
                    },
                },
            },
            orderBy: {
                subject: {
                    name: 'asc',
                },
            },
            skip,
            take: limit,
        });

        return reply.status(200).send({
            subjects,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + subjects.length < total,
        });
    } catch (error) {
        logger.error('Error al obtener materias de la sección', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al obtener materias de la sección',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Obtener detalle de una materia específica en una sección
 */
export async function getClassroomSubjectDetail(
    request: FastifyRequest<UpdateClassroomSubjectRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId: rawSubjectId } = request.params;

        // Si subjectId parece un slug (no un CUID), resolverlo
        let subjectId = rawSubjectId;
        if (!rawSubjectId.match(/^c[a-z0-9]{24}$/)) {
            const subject = await request.tenantPrisma.subject.findFirst({
                where: { slug: rawSubjectId },
                select: { id: true },
            });
            if (subject) {
                subjectId = subject.id;
            } else {
                return reply.status(404).send({
                    error: 'Materia no encontrada',
                    code: 'SUBJECT_NOT_FOUND',
                });
            }
        }

        const classroomSubject = await request.tenantPrisma.classroomSubject.findUnique({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        specialization: true,
                    },
                },
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true,
                    },
                },
                scheduleBlocks: {
                    orderBy: [
                        { dayOfWeek: 'asc' },
                        { startTime: 'asc' },
                    ],
                },
                teacherHistory: {
                    where: {
                        isActive: true,
                    },
                    include: {
                        teacher: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: {
                        startDate: 'desc',
                    },
                },
            },
        });

        if (!classroomSubject) {
            return reply.status(404).send({
                error: 'Materia no encontrada en esta sección',
                code: 'CLASSROOM_SUBJECT_NOT_FOUND',
            });
        }

        if (request.user?.role === 'TEACHER' && classroomSubject.teacherId !== request.user.userId) {
            return reply.status(403).send({
                error: 'No tienes permiso para ver esta materia',
                code: 'FORBIDDEN',
            });
        }

        return reply.status(200).send({ classroomSubject });
    } catch (error) {
        logger.error('Error al obtener detalle de materia', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            subjectId: request.params.subjectId,
        });
        return reply.status(500).send({
            error: 'Error al obtener detalle de materia',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Asignar una materia a una sección
 */
export async function assignSubjectToClassroom(
    request: FastifyRequest<AssignSubjectToClassroomRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const { subjectId, teacherId, weeklyBlocks = 0 } = request.body;

        // Verificar que la sección existe
        const classroom = await request.tenantPrisma.classroom.findUnique({
            where: { id: classroomId },
        });

        if (!classroom) {
            return reply.status(404).send({
                error: 'Sección no encontrada',
                code: 'CLASSROOM_NOT_FOUND',
            });
        }

        // Verificar que la materia existe
        const subject = await request.tenantPrisma.subject.findUnique({
            where: { id: subjectId },
        });

        if (!subject) {
            return reply.status(404).send({
                error: 'Materia no encontrada',
                code: 'SUBJECT_NOT_FOUND',
            });
        }

        // Verificar si ya está asignada
        const existing = await request.tenantPrisma.classroomSubject.findUnique({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
        });

        if (existing) {
            return reply.status(400).send({
                error: 'Esta materia ya está asignada a la sección',
                code: 'SUBJECT_ALREADY_ASSIGNED',
            });
        }

        // Si se proporciona teacherId, verificar que existe y está activo
        if (teacherId) {
            const teacher = await request.tenantPrisma.user.findFirst({
                where: {
                    id: teacherId,
                    role: 'TEACHER',
                    isActive: true,
                },
            });

            if (!teacher) {
                return reply.status(404).send({
                    error: 'Profesor no encontrado o inactivo',
                    code: 'TEACHER_NOT_FOUND',
                });
            }
        }

        // Las horas: bloques × la hora de clase del turno de la sección.
        const liceo = (request as any).institute?.id ?? (request.user as any)?.instituteId ?? '';
        const seccion = await request.tenantPrisma.classroom.findUnique({ where: { id: classroomId }, select: { shift: true } });
        const hoursPerWeek = await horasDeLosBloques(liceo, seccion?.shift, weeklyBlocks ?? 0);

        // Crear la asignación
        const classroomSubject = await request.tenantPrisma.classroomSubject.create({
            data: {
                classroomId,
                subjectId,
                teacherId,
                weeklyBlocks,
                hoursPerWeek,
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });

        // Si se asignó un profesor, crear registro en historial
        if (teacherId) {
            await request.tenantPrisma.subjectTeacherHistory.create({
                data: {
                    classroomSubjectId: classroomSubject.id,
                    teacherId,
                    isActive: true,
                },
            });
        }

        return reply.status(201).send({
            message: 'Materia asignada exitosamente',
            classroomSubject,
        });
    } catch (error) {
        logger.error('Error al asignar materia a sección', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            body: request.body,
        });
        return reply.status(500).send({
            error: 'Error al asignar materia',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/** Helper: resolve slug or CUID to actual subject ID */
async function resolveSubjectId(tenantPrisma: any, rawSubjectId: string): Promise<string | null> {
    if (rawSubjectId.match(/^c[a-z0-9]{24}$/)) return rawSubjectId;
    const subject = await tenantPrisma.subject.findFirst({
        where: { slug: rawSubjectId },
        select: { id: true },
    });
    return subject?.id || null;
}

/**
 * Actualizar configuración de una materia en una sección
 */
export async function updateClassroomSubject(
    request: FastifyRequest<UpdateClassroomSubjectRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId: rawSubjectId } = request.params;
        const { weeklyBlocks, hoursPerWeek } = request.body;

        const subjectId = await resolveSubjectId(request.tenantPrisma, rawSubjectId);
        if (!subjectId) {
            return reply.status(404).send({ error: 'Materia no encontrada', code: 'SUBJECT_NOT_FOUND' });
        }

        const classroomSubject = await request.tenantPrisma.classroomSubject.findUnique({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
        });

        if (!classroomSubject) {
            return reply.status(404).send({
                error: 'Materia no encontrada en esta sección',
                code: 'CLASSROOM_SUBJECT_NOT_FOUND',
            });
        }

        // Calcular horas si se proporciona weeklyBlocks
        // Con bloques, las horas salen de la hora de clase del turno de la sección.
        let calculatedHours = hoursPerWeek;
        if (weeklyBlocks !== undefined) {
            const liceo = (request as any).institute?.id ?? (request.user as any)?.instituteId ?? '';
            const seccion = await request.tenantPrisma.classroom.findUnique({ where: { id: classroomId }, select: { shift: true } });
            calculatedHours = await horasDeLosBloques(liceo, seccion?.shift, weeklyBlocks);
        }

        const updated = await request.tenantPrisma.classroomSubject.update({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
            data: {
                ...(weeklyBlocks !== undefined && { weeklyBlocks }),
                ...(calculatedHours !== undefined && { hoursPerWeek: calculatedHours }),
            },
            include: {
                subject: true,
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });

        return reply.status(200).send({
            message: 'Configuración actualizada exitosamente',
            classroomSubject: updated,
        });
    } catch (error) {
        logger.error('Error al actualizar configuración de materia', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            subjectId: request.params.subjectId,
        });
        return reply.status(500).send({
            error: 'Error al actualizar configuración',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Asignar o cambiar profesor de una materia
 */
export async function assignTeacherToSubject(
    request: FastifyRequest<AssignTeacherToSubjectRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId: rawSubjectId } = request.params;
        const { teacherId, notes } = request.body;

        const subjectId = await resolveSubjectId(request.tenantPrisma, rawSubjectId);
        if (!subjectId) {
            return reply.status(404).send({ error: 'Materia no encontrada', code: 'SUBJECT_NOT_FOUND' });
        }

        // `teacherId: null` quita el profesor: la clase queda «sin profesor»
        // (Profesores → su ficha → Quitar). Su historial se cierra.
        if (teacherId === null) {
            const cs = await request.tenantPrisma.classroomSubject.findUnique({ where: { classroomId_subjectId: { classroomId, subjectId } } });
            if (!cs) return reply.status(404).send({ error: 'Materia no encontrada en esta sección', code: 'CLASSROOM_SUBJECT_NOT_FOUND' });
            const quitada = await request.tenantPrisma.$transaction(async (prisma) => {
                await prisma.subjectTeacherHistory.updateMany({ where: { classroomSubjectId: cs.id, isActive: true }, data: { isActive: false, endDate: new Date() } });
                return prisma.classroomSubject.update({ where: { id: cs.id }, data: { teacherId: null } });
            });
            return reply.status(200).send({ message: 'Profesor quitado', classroomSubject: quitada });
        }

        // Verificar que el profesor existe y está activo
        const teacher = await request.tenantPrisma.user.findFirst({
            where: {
                id: teacherId,
                role: 'TEACHER',
                isActive: true,
            },
        });

        if (!teacher) {
            return reply.status(404).send({
                error: 'Profesor no encontrado o inactivo',
                code: 'TEACHER_NOT_FOUND',
            });
        }

        // Verificar que la materia está asignada a la sección
        const classroomSubject = await request.tenantPrisma.classroomSubject.findUnique({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
        });

        if (!classroomSubject) {
            return reply.status(404).send({
                error: 'Materia no encontrada en esta sección',
                code: 'CLASSROOM_SUBJECT_NOT_FOUND',
            });
        }

        // Asignar un profesor ocupa sus horas en los bloques YA colocados de esta
        // materia. Antes no se miraba y el choque aparecía en el acto, sin pasar
        // por ninguna validación (así entraron parte de los choques heredados).
        if (classroomSubject.teacherId !== teacherId) {
            const clashes = await findTeacherAssignmentConflicts(
                request.tenantPrisma,
                [classroomSubject.id],
                teacherId
            );
            if (clashes.length > 0) {
                return reply.status(409).send({
                    error: `${teacher.firstName} ${teacher.lastName} ya tiene clase a esas horas: ${clashes[0].message}`,
                    code: 'SCHEDULE_CONFLICT',
                    conflicts: clashes,
                });
            }
        }

        // Usar transacción para actualizar profesor y crear historial
        const result = await request.tenantPrisma.$transaction(async (prisma) => {
            // Si había un profesor anterior, desactivar su registro en el historial
            if (classroomSubject.teacherId) {
                await prisma.subjectTeacherHistory.updateMany({
                    where: {
                        classroomSubjectId: classroomSubject.id,
                        isActive: true,
                    },
                    data: {
                        isActive: false,
                        endDate: new Date(),
                    },
                });
            }

            // Actualizar el profesor actual
            const updated = await prisma.classroomSubject.update({
                where: {
                    classroomId_subjectId: {
                        classroomId,
                        subjectId,
                    },
                },
                data: {
                    teacherId,
                },
                include: {
                    subject: true,
                    teacher: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            avatar: true,
                        },
                    },
                },
            });

            // Crear nuevo registro en el historial
            await prisma.subjectTeacherHistory.create({
                data: {
                    classroomSubjectId: classroomSubject.id,
                    teacherId,
                    isActive: true,
                    notes,
                },
            });

            return updated;
        });

        return reply.status(200).send({
            message: 'Profesor asignado exitosamente',
            classroomSubject: result,
        });
    } catch (error) {
        logger.error('Error al asignar profesor a materia', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            subjectId: request.params.subjectId,
            teacherId: request.body.teacherId,
        });
        return reply.status(500).send({
            error: 'Error al asignar profesor',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Obtener historial de profesores de una materia
 */
export async function getTeacherHistory(
    request: FastifyRequest<GetTeacherHistoryRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId } = request.params;

        const classroomSubject = await request.tenantPrisma.classroomSubject.findUnique({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
        });

        if (!classroomSubject) {
            return reply.status(404).send({
                error: 'Materia no encontrada en esta sección',
                code: 'CLASSROOM_SUBJECT_NOT_FOUND',
            });
        }

        const history = await request.tenantPrisma.subjectTeacherHistory.findMany({
            where: {
                classroomSubjectId: classroomSubject.id,
            },
            include: {
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                    },
                },
            },
            orderBy: {
                startDate: 'desc',
            },
        });

        return reply.status(200).send({
            history,
            total: history.length,
        });
    } catch (error) {
        logger.error('Error al obtener historial de profesores', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            subjectId: request.params.subjectId,
        });
        return reply.status(500).send({
            error: 'Error al obtener historial',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Remover una materia de una sección
 */
export async function removeSubjectFromClassroom(
    request: FastifyRequest<RemoveSubjectFromClassroomRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId } = request.params;

        const classroomSubject = await request.tenantPrisma.classroomSubject.findUnique({
            where: {
                classroomId_subjectId: {
                    classroomId,
                    subjectId,
                },
            },
        });

        if (!classroomSubject) {
            return reply.status(404).send({
                error: 'Materia no encontrada en esta sección',
                code: 'CLASSROOM_SUBJECT_NOT_FOUND',
            });
        }

        try {
            await noQuitarConTrabajo(request.tenantPrisma, subjectId, [classroomId]);
        } catch (e: any) {
            return reply.status(409).send({ error: e.message, code: e.code });
        }

        // Eliminar (esto también eliminará en cascada el historial y bloques de horario)
        await borrarGuardandoCopia(
            request.tenantPrisma,
            'classroomSubject',
            { classroomId, subjectId },
            quienBorra(request as any)
        );

        return reply.status(200).send({
            message: 'Materia removida exitosamente de la sección',
        });
    } catch (error) {
        logger.error('Error al remover materia de sección', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
            subjectId: request.params.subjectId,
        });
        return reply.status(500).send({
            error: 'Error al remover materia',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

interface GetAvailableSubjectsRequest {
    Params: {
        classroomId: string;
    };
}

/**
 * Obtener materias disponibles para asignar a una sección (no asignadas aún)
 */
export async function getAvailableSubjects(
    request: FastifyRequest<GetAvailableSubjectsRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;

        // Verificar que la sección existe
        const classroom = await request.tenantPrisma.classroom.findUnique({
            where: { id: classroomId },
            select: { id: true },
        });

        if (!classroom) {
            return reply.status(404).send({
                error: 'Sección no encontrada',
                code: 'CLASSROOM_NOT_FOUND',
            });
        }

        // Obtener IDs de materias ya asignadas
        const assignedSubjects = await request.tenantPrisma.classroomSubject.findMany({
            where: { classroomId },
            select: { subjectId: true },
        });

        const assignedSubjectIds = assignedSubjects.map(cs => cs.subjectId);

        // Obtener materias del instituto que NO están asignadas
        const availableSubjects = await request.tenantPrisma.subject.findMany({
            where: {
                id: {
                    notIn: assignedSubjectIds,
                },
            },
            select: {
                id: true,
                name: true,
                code: true,
                color: true,
                description: true,
            },
            orderBy: {
                name: 'asc',
            },
        });

        return reply.status(200).send({
            subjects: availableSubjects,
            total: availableSubjects.length,
        });
    } catch (error) {
        logger.error('Error al obtener materias disponibles', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al obtener materias disponibles',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

interface GetClassroomSubjectsStatsRequest {
    Params: {
        classroomId: string;
    };
    Querystring: {
        periodId?: string;
    };
}

/**
 * Obtener estadísticas de todas las materias asignadas a una sección
 */
export async function getClassroomSubjectsStats(
    request: FastifyRequest<GetClassroomSubjectsStatsRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const periodId = request.query?.periodId || undefined;

        // Obtener materias asignadas
        const classroomSubjectsWhere: any = { classroomId };
        if (request.user?.role === 'TEACHER') {
            classroomSubjectsWhere.teacherId = request.user.userId;
        }

        const classroomSubjects = await request.tenantPrisma.classroomSubject.findMany({
            where: classroomSubjectsWhere,
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        code: true,
                        slug: true,
                        evaluacion: true,
                    },
                },
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
            },
        });

        // Obtener estudiantes de la sección
        const enrollments = await request.tenantPrisma.studentClassroom.findMany({
            where: {
                classroomId,
                isActive: true,
            },
            select: {
                studentId: true,
            },
        });

        const studentIds = enrollments.map(e => e.studentId);

        let minPassing = 10;
        try {
            const instId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
            if (instId) {
                const config = await getAcademicConfig(instId);
                minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
            }
        } catch {
            minPassing = 10;
        }

        // Filtrar por fechas del periodo/lapso si fue especificado
        let periodDateFilter: any = {};
        if (periodId) {
            const period = await request.tenantPrisma.period.findUnique({
                where: { id: periodId },
                select: { startDate: true, endDate: true },
            });
            if (period) {
                periodDateFilter = {
                    gte: period.startDate,
                    lte: period.endDate,
                };
            }
        }

        // Calcular estadísticas para cada materia
        // CORRECCIÓN (jerarquía de agregación): el promedio de la materia es el
        // NIVEL 3 — promedio de los promedios NIVEL 2 por estudiante, excluyendo
        // a estudiantes sin notas (no cuentan como 0) e incluyendo notas de
        // ClassActivity.scores. Antes: promedio simple de AVG sobre la tabla
        // grades (ignoraba criterios ponderados y clases en vivo).
        /**
         * TODO EN BLOQUE Y CON LA CIFRA OFICIAL (20-oct-2026)
         *
         * Antes, por cada materia: su promedio, la asistencia de la sección (la
         * misma consulta una y otra vez), sus observaciones y, por cada alumno,
         * su promedio con la cuenta vieja (sin redondear como la boleta) para
         * saber si estaba en riesgo. Ahora la nota de cada alumno en cada
         * materia sale de UNA carga (`promediosDeLaSeccion`, la de la boleta);
         * en riesgo es quien tiene en esa materia una nota oficial por debajo
         * de la mínima, y la asistencia es la del resumen de la sección.
         */
        const subjectIds = classroomSubjects.map((cs) => cs.subjectId);
        const [notas, asistencia, observaciones] = await Promise.all([
            promediosDeLaSeccion(request.tenantPrisma, classroomId, periodId, subjectIds),
            studentIds.length > 0
                ? request.tenantPrisma.dailyAttendance.groupBy({
                      by: ['status'],
                      where: { studentId: { in: studentIds }, ...(periodDateFilter.gte ? { date: periodDateFilter } : {}) },
                      _count: { _all: true },
                  })
                : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
            studentIds.length > 0 && subjectIds.length > 0
                ? request.tenantPrisma.observation.groupBy({
                      by: ['subjectId'],
                      where: {
                          studentId: { in: studentIds },
                          subjectId: { in: subjectIds },
                          ...(periodDateFilter.gte ? { date: periodDateFilter } : {}),
                      },
                      _count: { _all: true },
                  })
                : Promise.resolve([] as Array<{ subjectId: string | null; _count: { _all: number } }>),
        ]);
        const registros = asistencia.reduce((n, f) => n + f._count._all, 0);
        const presentes = asistencia.filter((f) => f.status === 'PRESENT' || f.status === 'LATE').reduce((n, f) => n + f._count._all, 0);
        const attendance = registros > 0 ? Math.round((presentes * 100) / registros) : null;
        const obsDe = new Map(observaciones.map((o) => [o.subjectId, o._count._all]));

        const subjectsWithStats = classroomSubjects.map((cs) => {
            const deLaMateria = [...notas.values()].map((m) => m.get(cs.subjectId)).filter((n): n is number => typeof n === 'number');
            const average = deLaMateria.length > 0
                ? Math.round((deLaMateria.reduce((a, b) => a + b, 0) / deLaMateria.length) * 100) / 100
                : null;
            return {
                id: cs.subject.id,
                name: cs.subject.name,
                color: cs.subject.color,
                code: cs.subject.code,
                slug: cs.subject.slug,
                teacher: cs.teacher ? {
                    id: cs.teacher.id,
                    firstName: cs.teacher.firstName,
                    lastName: cs.teacher.lastName,
                    avatar: cs.teacher.avatar,
                } : null,
                hoursPerWeek: cs.hoursPerWeek || 0,
                weeklyBlocks: cs.weeklyBlocks || 0,
                stats: {
                    average,
                    attendance,
                    observations: obsDe.get(cs.subjectId) ?? 0,
                    atRiskStudents: deLaMateria.filter((n) => n < minPassing).length,
                },
            };
        });

        return reply.status(200).send({
            subjects: subjectsWithStats,
            total: subjectsWithStats.length,
        });
    } catch (error) {
        logger.error('Error al obtener estadísticas de materias', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al obtener estadísticas',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}
