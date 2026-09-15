import { UserRole } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { ReportRequestDto } from '../dto/report.dto';
import { PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';

interface ReportRequest {
  Body: ReportRequestDto;
}

interface AttendanceReportRequest {
  Querystring: {
    classroomId?: string;
    studentId?: string;
    dateFrom?: string;
    dateTo?: string;
  } & PaginationInput;
}

interface GradeAnalyticsRequest {
  Querystring: {
    periodId?: string;
    subjectId?: string;
    classroomId?: string;
  };
}

/**
 * Controlador para generar un reporte de notas
 */
export async function generateGradeReport(
  request: FastifyRequest<ReportRequest>,
  reply: FastifyReply
) {
  try {
    const { studentId, periodId } = request.body;

    const grades = await request.tenantPrisma.grade.findMany({
      where: {
        studentId,
        periodId,
      },
      include: {
        subject: {
          select: {
            name: true,
          },
        },
        teacher: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (grades.length === 0) {
      return reply.status(404).send({
        error: 'No se encontraron calificaciones para el estudiante en este período',
        code: 'GRADES_NOT_FOUND',
      });
    }

    const report = grades.map((grade) => ({
      subject: grade.subject.name,
      score: grade.score,
      teacher: grade.teacher ? `${grade.teacher.firstName} ${grade.teacher.lastName}` : 'N/A',
    }));

    logger.info('Reporte de notas generado', { studentId, periodId });

    return reply.status(200).send({ report });
  } catch (error) {
    logger.error('Error al generar reporte de notas', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para generar reporte de asistencia
 */
export async function generateAttendanceReport(
  request: FastifyRequest<AttendanceReportRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 20,
      classroomId,
      studentId,
      dateFrom,
      dateTo
    } = request.query;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
    };

    // La asistencia guarda su propia sección. Antes se filtraba por un campo
    // `classroomId` del alumno que no existe, y el informe reventaba con 500
    // justo cuando se usaba como se usa: filtrando por sección.
    if (classroomId) {
      where.classroomId = classroomId;
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    const [attendances, total] = await Promise.all([
      request.tenantPrisma.dailyAttendance.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true,
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
        },
        orderBy: {
          date: 'desc',
        },
      }),
      request.tenantPrisma.dailyAttendance.count({ where }),
    ]);

    // Calcular estadísticas
    const stats = {
      total: attendances.length,
      present: attendances.filter(a => a.status === 'PRESENT').length,
      absent: attendances.filter(a => a.status === 'ABSENT').length,
      late: attendances.filter(a => a.status === 'LATE').length,
      excused: attendances.filter(a => a.status === 'EXCUSED').length,
    };

    const totalPages = Math.ceil(total / limit);

    logger.info('Reporte de asistencia generado', {
      classroomId,
      studentId,
      total: attendances.length
    });

    return reply.status(200).send({
      attendances,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error('Error al generar reporte de asistencia', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener analíticas de calificaciones
 */
export async function getGradeAnalytics(
  request: FastifyRequest<GradeAnalyticsRequest>,
  reply: FastifyReply
) {
  try {
    const { periodId, subjectId, classroomId } = request.query;

    // Verificar permisos
    const userRole = request.user?.role;
    if (userRole === UserRole.STUDENT) {
      return reply.status(403).send({
        error: 'No tienes permisos para ver analíticas generales',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Construir filtros
    const where: any = {
    };

    if (periodId) {
      where.periodId = periodId;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    // El alumno pertenece a una sección por su inscripción, no por un campo
    // suyo. Igual que arriba: así era un 500 seguro.
    if (classroomId) {
      where.student = { studentClassrooms: { some: { classroomId, isActive: true } } };
    }

    const grades = await request.tenantPrisma.grade.findMany({
      where,
      select: {
        score: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            studentClassrooms: {
              where: { isActive: true },
              take: 1,
              select: {
                classroom: {
                  select: {
                    name: true,
                    grade: true,
                  },
                },
              },
            },
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
          }
        }
      },
    });

    if (grades.length === 0) {
      return reply.status(404).send({
        error: 'No se encontraron calificaciones para los filtros especificados',
        code: 'GRADES_NOT_FOUND',
      });
    }

    // Calcular estadísticas
    const values = grades.map(g => g.score ?? 0);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const highest = Math.max(...values);
    const lowest = Math.min(...values);

    // Distribución por rangos
    const distribution = {
      excellent: values.filter(v => v >= 18).length, // 18-20
      good: values.filter(v => v >= 14 && v < 18).length, // 14-17
      regular: values.filter(v => v >= 11 && v < 14).length, // 11-13
      poor: values.filter(v => v < 11).length, // 0-10
    };

    // Análisis por materia (si no se filtró por materia específica)
    let subjectAnalysis = null;
    if (!subjectId) {
      const subjectGroups = grades.reduce((acc, grade) => {
        const subject = (grade as any).subject?.name || 'Materia';
        if (!acc[subject]) {
          acc[subject] = [];
        }
        acc[subject].push(grade.score ?? 0);
        return acc;
      }, {} as Record<string, number[]>);

      subjectAnalysis = Object.entries(subjectGroups).map(([subject, values]) => ({
        subject,
        average: values.reduce((sum, val) => sum + val, 0) / values.length,
        count: values.length,
        highest: Math.max(...values),
        lowest: Math.min(...values),
      }));
    }

    const analytics = {
      overview: {
        totalGrades: grades.length,
        average: Math.round(average * 100) / 100,
        highest,
        lowest,
      },
      distribution,
      subjectAnalysis,
    };

    logger.info('Analíticas de calificaciones generadas', {
      periodId,
      subjectId,
      classroomId,
      totalGrades: grades.length
    });

    return reply.status(200).send({ analytics });
  } catch (error) {
    logger.error('Error al generar analíticas de calificaciones', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para generar reporte consolidado de estudiante
 */
export async function generateStudentReport(
  request: FastifyRequest<{ Params: { studentId: string } }>,
  reply: FastifyReply
) {
  try {
    const { studentId } = request.params;

    // Obtener información del estudiante
    const student = await request.tenantPrisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        studentCode: true,
        birthDate: true,
        address: true,
        phone: true,
        isActive: true,
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
                teacher: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Obtener calificaciones recientes
    const recentGrades = await request.tenantPrisma.grade.findMany({
      where: {
        studentId,
      },
      include: {
        subject: {
          select: {
            name: true,
          },
        },
        activity: {
          select: {
            name: true,
            type: true,
          },
        },
        period: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    // Obtener estadísticas de asistencia
    const attendanceStats = await request.tenantPrisma.dailyAttendance.groupBy({
      by: ['status'],
      where: {
        studentId,
      },
      _count: {
        status: true,
      },
    });

    const attendanceSummary = attendanceStats.reduce((acc, stat) => {
      acc[stat.status.toLowerCase()] = stat._count.status;
      return acc;
    }, {} as Record<string, number>);

    // Calcular promedio general
    const gradeAverage = recentGrades.length > 0 ?
      recentGrades.reduce((sum, grade) => sum + (grade.score ?? 0), 0) / recentGrades.length :
      0;

    const report = {
      student,
      academic: {
        recentGrades,
        average: Math.round(gradeAverage * 100) / 100,
        totalGrades: recentGrades.length,
      },
      attendance: {
        summary: attendanceSummary,
        total: (Object.values(attendanceSummary) as number[]).reduce((sum, count) => sum + count, 0),
      },
      generatedAt: new Date(),
    };

    logger.info('Reporte consolidado de estudiante generado', { studentId });

    return reply.status(200).send({ report });
  } catch (error) {
    logger.error('Error al generar reporte de estudiante', { error, studentId: request.params.studentId });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
