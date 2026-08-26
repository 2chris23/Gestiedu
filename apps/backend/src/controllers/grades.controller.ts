import { UserRole, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateGradeInput, UpdateGradeInput, GradeFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import { gradesService } from '../services/grades.service';
import { RequestUser } from '../types/fastify';
import { sanitizeHTML } from '../utils/sanitize'; // ✅ SECURITY: XSS protection
import { handlePrismaError } from '../utils/error-handler'; // ✅ SECURITY: Better error handling

interface CreateGradeRequest {
  Body: CreateGradeInput;
}

interface UpdateGradeRequest {
  Params: { id: string };
  Body: UpdateGradeInput;
}

interface GetGradeRequest {
  Params: { id: string };
}

interface GetGradesRequest {
  Querystring: GradeFiltersInput & PaginationInput;
}

interface DeleteGradeRequest {
  Params: { id: string };
}

interface BulkGradesRequest {
  Body: {
    grades: CreateGradeInput[];
  };
}

interface StudentGradesRequest {
  Params: { studentId: string };
  Querystring: {
    periodId?: string;
    subjectId?: string;
  };
}

/**
 * Controlador para crear una nueva calificación
 */
export async function createGrade(
  request: FastifyRequest<CreateGradeRequest>,
  reply: FastifyReply
) {
  try {
    const gradeData = request.body;
    const instituteId = (request.user as any).instituteId;

    // ✅ SECURITY: Sanitize comments to prevent XSS
    const sanitizedComments = gradeData.comments ? sanitizeHTML(gradeData.comments) : undefined;

    // Usar el servicio consolidado para crear la calificación
    const grade = await gradesService.createGrade(request.tenantPrisma, {
      score: gradeData.score,
      comments: sanitizedComments,
      studentId: gradeData.studentId,
      activityId: gradeData.activityId,
      periodId: gradeData.periodId,
      subjectId: gradeData.subjectId,
      teacherId: (request.user as RequestUser)?.id,
    });

    // Registrar el evento de auditoría
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.CREATE,
        entity: 'GRADE',
        entityType: 'GRADE',
        entityId: grade.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          studentId: grade.student.id,
          score: grade.score,
          instituteId,
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Nueva calificación creada', { gradeId: grade.id, studentId: grade.student.id });

    return reply.status(201).send({ grade });
  } catch (error) {
    logger.error('Error al crear calificación', { error });
    // SEGURIDAD: pasar errores de dominio (statusCode) antes del handler genérico
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'Error al crear calificación',
        code: (error as any).code,
      });
    }
    return handlePrismaError(error, request, reply);
  }
}

/**
 * Controlador para obtener todas las calificaciones
 */
export async function getGrades(
  request: FastifyRequest<GetGradesRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 10,
      studentId,
      activityId,
      periodId,
      subjectId,
      classroomId,
      teacherId,
      minScore,
      maxScore,
      dateFrom,
      dateTo,
    } = request.query;

    // Usar el servicio consolidado para obtener las calificaciones
    const result = await gradesService.getGrades(request.tenantPrisma, {
      page,
      limit,
      studentId,
      activityId,
      periodId,
      subjectId,
      classroomId,
      teacherId,
      minScore,
      maxScore,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    return reply.status(200).send({
      ...result,
      pagination: {
        ...result.pagination,
        totalPages: result.pagination.pages,
        hasNext: result.pagination.page < result.pagination.pages,
        hasPrev: result.pagination.page > 1,
      },
    });
  } catch (error) {
    logger.error('Error al obtener calificaciones', { error });

    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener una calificación por ID
 */
export async function getGrade(
  request: FastifyRequest<GetGradeRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    const grade = await request.tenantPrisma.grade.findFirst({
      where: {
        id,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            email: true,
            classroom: {
              select: {
                id: true,
                name: true,
                grade: true,
                section: true,
              },
            },
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        activity: {
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            weight: true,
            dueDate: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    if (!grade) {
      return reply.status(404).send({
        error: 'Calificación no encontrada',
        code: 'GRADE_NOT_FOUND',
      });
    }

    return reply.status(200).send({ grade });
  } catch (error) {
    logger.error('Error al obtener calificación', { error, gradeId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para actualizar una calificación
 */
export async function updateGrade(
  request: FastifyRequest<UpdateGradeRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const updateData = request.body;

    // Verificar que la calificación existe
    const existingGrade = await request.tenantPrisma.grade.findFirst({
      where: {
        id,
      },
    });

    if (!existingGrade) {
      return reply.status(404).send({
        error: 'Calificación no encontrada',
        code: 'GRADE_NOT_FOUND',
      });
    }

    // ✅ SECURITY: Sanitize comments to prevent XSS
    const sanitizedComments = updateData.comments ? sanitizeHTML(updateData.comments) : undefined;

    // Actualizar la calificación usando el servicio (mapea value->score)
    const grade = await gradesService.updateGrade(request.tenantPrisma, id, {
      ...(updateData.score !== undefined ? { score: updateData.score } : {}),
      comments: sanitizedComments,
    });

    // Registrar el evento de actualización
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'GRADE',
        entityType: 'GRADE',
        entityId: grade.id,
        metadata: ({
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          changes: {
            ...(updateData.score !== undefined ? { score: updateData.score } : {}),
            ...(updateData.comments !== undefined ? { comments: updateData.comments } : {}),
          },
          previousScore: existingGrade.score,
          newScore: grade.score,
        }),
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Calificación actualizada', { gradeId: grade.id });

    return reply.status(200).send({ grade });
  } catch (error) {
    logger.error('Error al actualizar calificación', { error, gradeId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para eliminar una calificación
 */
export async function deleteGrade(
  request: FastifyRequest<DeleteGradeRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Verificar que la calificación existe
    const existingGrade = await request.tenantPrisma.grade.findFirst({
      where: {
        id,
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        activity: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!existingGrade) {
      return reply.status(404).send({
        error: 'Calificación no encontrada',
        code: 'GRADE_NOT_FOUND',
      });
    }

    // Eliminar la calificación
    await request.tenantPrisma.grade.delete({
      where: { id },
    });

    // Registrar el evento de eliminación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.DELETE,
        entity: 'GRADE',
        entityType: 'GRADE',
        entityId: id,
        metadata: ({
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          studentName: `${existingGrade.student.firstName} ${existingGrade.student.lastName}`,
          activityName: existingGrade.activity.name,
          deletedScore: (existingGrade as any).score,
        }),
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Calificación eliminada', { gradeId: id });

    return reply.status(200).send({
      message: 'Calificación eliminada correctamente',
    });
  } catch (error) {
    logger.error('Error al eliminar calificación', { error, gradeId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para crear calificaciones en lote
 */
export async function bulkCreateGrades(
  request: FastifyRequest<BulkGradesRequest>,
  reply: FastifyReply
) {
  try {
    const { grades } = request.body;

    if (!grades || grades.length === 0) {
      return reply.status(400).send({
        error: 'No se proporcionaron calificaciones',
        code: 'NO_GRADES_PROVIDED',
      });
    }

    const createdGrades = [];
    const errors = [];

    for (let i = 0; i < grades.length; i++) {
      try {
        const gradeData = grades[i];

        // Verificar duplicados
        const existingGrade = await request.tenantPrisma.grade.findFirst({
          where: {
            studentId: gradeData.studentId,
            activityId: gradeData.activityId,
            subjectId: gradeData.subjectId,
            periodId: gradeData.periodId,
          },
        });

        if (existingGrade) {
          errors.push({
            index: i,
            error: 'Ya existe una calificación para esta actividad',
            studentId: gradeData.studentId,
          });
          continue;
        }

        // Crear la calificación usando el servicio (mapea value->score)
        const grade = await gradesService.createGrade(request.tenantPrisma, {
          score: gradeData.score as any,
          comments: gradeData.comments,
          studentId: gradeData.studentId,
          activityId: gradeData.activityId,
          periodId: gradeData.periodId,
          subjectId: gradeData.subjectId,
          teacherId: (request.user as RequestUser)?.id,
        });

        createdGrades.push(grade);
      } catch (error) {
        errors.push({
          index: i,
          error: 'Error al crear calificación',
          details: (error as Error).message,
        });
      }
    }

    // Registrar el evento de creación en lote
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.BULK_CREATE,
        entity: 'GRADE',
        entityType: 'GRADE',
        entityId: 'bulk',
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          totalGrades: grades.length,
          createdCount: createdGrades.length,
          errorCount: errors.length,
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info(
      'Calificaciones creadas en lote',
      { totalGrades: grades.length, createdCount: createdGrades.length, errorCount: errors.length }
    );

    return reply.status(201).send({
      message: 'Proceso de calificaciones en lote completado',
      created: createdGrades,
      errors,
      summary: {
        total: grades.length,
        created: createdGrades.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    logger.error('Error al crear calificaciones en lote', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener calificaciones de un estudiante
 */
export async function getStudentGrades(
  request: FastifyRequest<StudentGradesRequest>,
  reply: FastifyReply
) {
  try {
    const { studentId } = request.params;
    const { periodId, subjectId } = request.query;

    // Verificar que el estudiante existe en esta tenant DB
    // No filtramos por instituteId porque en la tenant DB esa columna es null
    // (la FK a institutes está en la platform DB). El aislamiento es inherente
    // por el hecho de que usamos la conexión de la tenant DB correcta.
    const student = await request.tenantPrisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Construir filtros
    const where: any = {
      studentId,
    };

    if (periodId) {
      where.periodId = periodId;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    // Obtener calificaciones del estudiante
    const grades = await request.tenantPrisma.grade.findMany({
      where,
      include: {
        activity: {
          select: {
            id: true,
            name: true,
            type: true,
            weight: true,
            dueDate: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { subject: { name: 'asc' } },
        { createdAt: 'desc' },
      ],
    });

    // Calcular estadísticas
    const stats = {
      totalGrades: grades.length,
      averageGrade: grades.length > 0 ?
        grades.reduce((sum, grade) => sum + (grade as any).score, 0) / grades.length : 0,
      highestGrade: grades.length > 0 ? Math.max(...grades.map(g => (g as any).score)) : 0,
      lowestGrade: grades.length > 0 ? Math.min(...grades.map(g => (g as any).score)) : 0,
      passingGrades: grades.filter(g => (g as any).score >= 10).length,
      failingGrades: grades.filter(g => (g as any).score < 10).length,
    };

    // Agrupar por materia
    const gradesBySubject = grades.reduce((acc, grade) => {
      const subjectName = grade.subject.name;
      if (!acc[subjectName]) {
        acc[subjectName] = {
          subject: grade.subject,
          grades: [],
          average: 0,
        };
      }
      acc[subjectName].grades.push(grade);
      return acc;
    }, {} as Record<string, any>);

    // Calcular promedio por materia
    Object.keys(gradesBySubject).forEach(subjectName => {
      const subjectGrades = gradesBySubject[subjectName].grades;
      gradesBySubject[subjectName].average =
        subjectGrades.reduce((sum: number, grade: any) => sum + (grade as any).score, 0) / subjectGrades.length;
    });

    return reply.status(200).send({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentCode: student.studentCode,
      },
      grades,
      stats,
      gradesBySubject,
    });
  } catch (error) {
    logger.error('Error al obtener calificaciones del estudiante', { error, studentId: request.params.studentId });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
