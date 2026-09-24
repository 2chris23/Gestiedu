import { UserRole, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateGradeInput, UpdateGradeInput, GradeFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import { gradesService } from '../services/grades.service';
import { RequestUser } from '../types/fastify';
import { fueModificadoPorOtro, versionVista, AVISO_MODIFICADO_POR_OTRO } from '../utils/concurrencia';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { sanitizeHTML } from '../utils/sanitize'; // ✅ SECURITY: XSS protection
import { handlePrismaError } from '../utils/error-handler'; // ✅ SECURITY: Better error handling
import { assertClassroomScope, canSeeStudent } from '../services/authorization.service';
import { AppErrors } from '../middleware/error.middleware';

/**
 * ¿PUEDE ESTA PERSONA TOCAR ESTA NOTA?
 *
 * Poner una nota sí se comprobaba. **Cambiarla y borrarla, no**: las rutas
 * `PUT /api/grades/:id` y `DELETE /api/grades/:id` solo pedían ser profesor, y
 * ahí se acababa la pregunta. Con eso, cualquier profesor del liceo podía
 * cambiar —o borrar— la nota de cualquier alumno en cualquier materia, con solo
 * saber el identificador de la nota.
 *
 * Lo cazó `puertas-sin-cerradura` (PUERTA-06 y PUERTA-07): el profesor B borró
 * de verdad la nota que había puesto el profesor A en una clase que B no
 * imparte.
 *
 * La sección de una nota no está en la nota: está en su actividad. De ahí que
 * haya que traerla para poder preguntar.
 */
async function soloSiEsDeSuClase(request: FastifyRequest, gradeId: string) {
  const nota = await request.tenantPrisma.grade.findUnique({
    where: { id: gradeId },
    select: {
      subjectId: true,
      studentId: true,
      activity: { select: { classroomId: true } },
      student: {
        select: {
          studentClassrooms: {
            where: { isActive: true },
            take: 1,
            select: { classroomId: true },
          },
        },
      },
    },
  });
  if (!nota) return;

  const classroomId = nota.activity?.classroomId || nota.student?.studentClassrooms[0]?.classroomId;
  if (!classroomId) {
    const actor = request.user as any;
    if (actor?.role === UserRole.ADMIN) return;
    const actorId = actor?.userId ?? actor?.id;
    const imparte = await request.tenantPrisma.classroomSubject.count({
      where: { subjectId: nota.subjectId, teacherId: actorId },
    });
    if (imparte === 0) {
      throw AppErrors.Forbidden('Solo puedes modificar notas de materias que impartes');
    }
    return;
  }

  await assertClassroomScope(
    request.tenantPrisma,
    request.user as any,
    classroomId,
    { subjectId: nota.subjectId, accion: 'poner notas' }
  );
}

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

    // A quién le toca este cambio: al alumno y a sus representantes (ven lo
    // suyo), y al personal de la sección (ve los medidores). Al resto del
    // liceo no se le toca nada: sus datos no cambiaron.
    request.aQuienAfecta = {
      studentIds: [grade.student.id],
      classroomId: (grade as any)?.activity?.classroomId,
    };

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
      // El administrador ve todas; el profesor, solo las de sus clases.
      soloDelProfesor:
        (request.user as any)?.role === UserRole.ADMIN
          ? undefined
          : ((request.user as any)?.userId ?? (request.user as any)?.id ?? '__nadie__'),
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
            studentClassrooms: {
              where: { isActive: true },
              take: 1,
              select: {
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
            classroomId: true,
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

    // SEGURIDAD: Control de acceso para evitar IDOR (idor-single-grade-lookup)
    const actor = request.user as any;
    const actorId = actor?.userId ?? actor?.id;
    const role = actor?.role;

    if (role === UserRole.ADMIN) {
      // El administrador tiene visibilidad completa sobre las notas de su liceo
    } else if (role === UserRole.STUDENT) {
      if (grade.studentId !== actorId) {
        return reply.status(403).send({
          error: 'Solo puedes consultar tus propias calificaciones',
          code: 'FORBIDDEN',
        });
      }
    } else if (role === UserRole.TUTOR) {
      const relacionTutor = await request.tenantPrisma.studentTutor.count({
        where: { tutorId: actorId, studentId: grade.studentId },
      });
      if (relacionTutor === 0) {
        return reply.status(403).send({
          error: 'Solo puedes consultar calificaciones de tus representados',
          code: 'FORBIDDEN',
        });
      }
    } else if (role === UserRole.TEACHER) {
      const classroomId = grade.activity?.classroomId || grade.student?.studentClassrooms?.[0]?.classroom?.id;
      if (classroomId) {
        await assertClassroomScope(request.tenantPrisma, actor, classroomId, {
          subjectId: grade.subjectId,
          accion: 'ver notas',
        });
      } else {
        const canSee = await canSeeStudent(request.tenantPrisma, actor, grade.studentId);
        if (!canSee) {
          return reply.status(403).send({
            error: 'No tienes permiso para ver calificaciones de este estudiante',
            code: 'FORBIDDEN',
          });
        }
      }
    } else {
      return reply.status(403).send({
        error: 'No tienes permisos para ver esta calificación',
        code: 'FORBIDDEN',
      });
    }

    return reply.status(200).send({ grade });
  } catch (error) {
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'Acceso denegado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
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

    await soloSiEsDeSuClase(request, id);

    // DOS PERSONAS, LA MISMA NOTA
    //
    // Si la pantalla mandó la versión que tenía a la vista y la nota ya
    // cambió, otra persona guardó primero: se avisa en vez de borrarle el
    // trabajo en silencio. Quien no manda versión guarda como siempre.
    if (fueModificadoPorOtro(versionVista(request as any), existingGrade.updatedAt)) {
      return reply.status(409).send({
        ...AVISO_MODIFICADO_POR_OTRO,
        actual: { score: existingGrade.score, updatedAt: existingGrade.updatedAt },
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
    // Un "no puedes" no es un "se rompió": si se tragara aquí, el servidor
    // respondería 500 a algo que en realidad está prohibido, y quien lo lea
    // pensará que hay una avería.
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
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

    await soloSiEsDeSuClase(request, id);

    // Eliminar la calificación (con copia en la papelera)
    await borrarGuardandoCopia(request.tenantPrisma, 'grade', { id }, quienBorra(request as any));

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
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
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

    // TODAS O NINGUNA
    //
    // Cargar las notas de una sección es un solo gesto del profesor: pulsa
    // "guardar" una vez con 35 notas dentro. Antes se guardaban una a una y
    // sin transacción: si se caía la conexión en la nota 20, veinte quedaban
    // puestas, quince no, y el profesor se quedaba sin saber por dónde se
    // cortó. Ahora entran todas juntas o no entra ninguna, y se dice qué fila
    // es la que estorba.
    let createdGrades: any[] = [];
    const errors: any[] = [];

    try {
      /**
       * DE UNA EN UNA A TODAS DE GOLPE
       *
       * Aquí se recorrían las notas una por una llamando a `createGrade`, y
       * `createGrade` comprueba diez cosas contra la base **por cada nota**.
       * Seis de esas diez son las mismas para toda la tanda —la actividad, el
       * lapso, la materia, el profesor, que ese profesor imparta esa materia
       * ahí— y se preguntaban treinta veces seguidas.
       *
       * Medido: **266 ms** para las 29 notas de una sección, unas 300
       * consultas. Era lo más lento del sistema, y es lo que hace el profesor
       * después de cada clase.
       *
       * `createGradesBatch` comprueba exactamente lo mismo, con los mismos
       * mensajes y el mismo número de fila, pero preguntando una vez por cosa.
       * Sigue siendo todas o ninguna.
       */
      createdGrades = await request.tenantPrisma.$transaction(async (tx: any) =>
        gradesService.createGradesBatch(
          tx,
          grades.map((gradeData: any) => ({
            score: gradeData.score as any,
            comments: gradeData.comments,
            studentId: gradeData.studentId,
            activityId: gradeData.activityId,
            periodId: gradeData.periodId,
            subjectId: gradeData.subjectId,
            teacherId: (request.user as RequestUser)?.id,
          }))
        )
      );
    } catch (error) {
      const fila = (error as any)?.fila;
      return reply.status((error as any)?.statusCode ?? 400).send({
        error: (error as Error).message || 'No se pudieron guardar las calificaciones',
        code: (error as any)?.code ?? 'CARGA_RECHAZADA',
        fila,
        studentId: (error as any)?.studentId,
        detalle:
          fila !== undefined
            ? `No se guardó ninguna nota: la número ${fila + 1} no se pudo poner.`
            : 'No se guardó ninguna nota.',
      });
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

    // Una tanda de notas le toca a esos alumnos y a su sección, no al liceo.
    // Es el camino que más filas escribe de una vez: avisar a todos aquí es lo
    // más caro que puede hacer el sistema.
    request.aQuienAfecta = {
      studentIds: [...new Set(createdGrades.map((g: any) => g?.student?.id ?? g?.studentId).filter(Boolean))],
      classroomId: (createdGrades[0] as any)?.activity?.classroomId,
    };

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
