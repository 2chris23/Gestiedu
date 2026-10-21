/// <reference path="../../types/fastify.d.ts" />
import { resolveSubjectId } from '../classroomSubjects.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { findTeacherAssignmentConflicts } from '../../services/schedule-conflicts.service';

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
