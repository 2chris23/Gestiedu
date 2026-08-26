import { UserRole, AttendanceStatus } from '../utils/prisma-enums';
import { PrismaClient } from '@prisma/client';
import { RedisCache } from '../config/redis';
import { AppErrors, createError } from '../middleware/error.middleware';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';

interface ReportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  classroomId?: string;
  subjectId?: string;
  periodId?: string;
  gradeLevel?: number;
}

export class ReportsService {
  constructor() { }

  // Reporte académico general
  async getAcademicReport(prisma: PrismaClient,
    filters: ReportFilters,
    userId: string
  ) {
    // Verificar permisos
    const cacheKey = `report:academic:${JSON.stringify(filters)}`;
    const cached = await RedisCache.get(cacheKey);


    if (cached) {
      return cached;
    }

    const where: any = {

    };

    // Aplicar filtros
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    if (filters.classroomId) {
      where.classroomId = filters.classroomId;
    }

    if (filters.gradeLevel) {
      where.classroom = {
        grade: filters.gradeLevel
      };
    }

    const [students, teachers, classrooms, activities, grades, attendance] = await Promise.all([
      // Estudiantes
      prisma.user.count({
        where: {
          ...where,
          role: UserRole.STUDENT,
          isActive: true
        }
      }),
      // Profesores
      prisma.user.count({
        where: {
          role: UserRole.TEACHER,
          isActive: true
        }
      }),
      // Aulas
      prisma.classroom.count({
        where: {
          isActive: true,
          ...(filters.gradeLevel && { grade: filters.gradeLevel })
        }
      }),
      // Actividades
      prisma.activity.count({
        where: {
          ...where,
          isActive: true
        }
      }),
      // Calificaciones promedio
      prisma.grade.aggregate({
        where: {
          student: {

          },
          ...(filters.dateFrom || filters.dateTo ? {
            createdAt: {
              ...(filters.dateFrom && { gte: filters.dateFrom }),
              ...(filters.dateTo && { lte: filters.dateTo })
            }
          } : {})
        },
        _avg: { score: true },
        _count: { score: true }
      }),
      // Estadísticas de asistencia
      prisma.dailyAttendance.groupBy({
        by: ['status'],
        where: {
          classroom: {

          },
          ...(filters.dateFrom || filters.dateTo ? {
            date: {
              ...(filters.dateFrom && { gte: filters.dateFrom }),
              ...(filters.dateTo && { lte: filters.dateTo })
            }
          } : {})
        },
        _count: {
          status: true
        }
      })
    ]);

    const attendanceStats = attendance.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    const report = {
      period: {
        from: filters.dateFrom,
        to: filters.dateTo
      },
      summary: {
        totalStudents: students,
        totalTeachers: teachers,
        totalClassrooms: classrooms,
        totalActivities: activities
      },
      academic: {
        averageGrade: grades._avg.score ? Number(grades._avg.score.toFixed(2)) : null,
        totalGrades: grades._count.score
      },
      attendance: {
        present: attendanceStats[AttendanceStatus.PRESENT] || 0,
        absent: attendanceStats[AttendanceStatus.ABSENT] || 0,
        late: attendanceStats[AttendanceStatus.LATE] || 0,
        justified: attendanceStats[AttendanceStatus.EXCUSED] || 0,
        total: Object.values(attendanceStats).reduce((sum: number, count: number) => sum + count, 0)
      },
      generatedAt: new Date()
    };

    // Cachear por 15 minutos
    await RedisCache.set(cacheKey, report, 900);

    return report;
  }

  // Reporte de calificaciones por aula
  async getClassroomGradesReport(
    prisma: PrismaClient,
    classroomId: string,
    periodId?: string,
    userId?: string
  ) {
    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        grade: true,
        section: true,
        isActive: true
      }
    });

    if (!classroom || !classroom.isActive) {
      throw createError(404, 'Aula no encontrada o inactiva', 'CLASSROOM_NOT_FOUND');
    }

    // Verificar permisos
    if (userId) {
    }

    const cacheKey = `report:classroom:grades:${classroomId}:${periodId || 'all'}`;
    const cached = await RedisCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const where: any = {
      activity: {
        classroomId
      }
    };

    if (periodId) {
      where.periodId = periodId;
    }

    const [grades, students] = await Promise.all([
      prisma.grade.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true
            }
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          activity: {
            select: {
              id: true,
              title: true,
              type: true,
              weight: true
            }
          }
        },
        orderBy: [
          { student: { lastName: 'asc' } },
          { student: { firstName: 'asc' } },
          { subject: { name: 'asc' } }
        ]
      }),
      prisma.user.findMany({
        where: {
          classroomId,
          role: UserRole.STUDENT,
          isActive: true
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentCode: true
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ]
      })
    ]);

    // Agrupar calificaciones por estudiante y materia
    const gradesByStudent = grades.reduce((acc, grade) => {
      if (!acc[grade.studentId]) {
        acc[grade.studentId] = {
          student: grade.student,
          subjects: {}
        };
      }

      if (!acc[grade.studentId].subjects[grade.subjectId]) {
        acc[grade.studentId].subjects[grade.subjectId] = {
          subject: grade.subject,
          grades: [],
          average: 0
        };
      }

      acc[grade.studentId].subjects[grade.subjectId].grades.push({
        id: grade.id,
        score: grade.score,
        activity: grade.activity,
        createdAt: grade.createdAt
      });

      return acc;
    }, {} as Record<string, any>);

    // Calcular promedios
    Object.keys(gradesByStudent).forEach(studentId => {
      Object.keys(gradesByStudent[studentId].subjects).forEach(subjectId => {
        const subjectGrades = gradesByStudent[studentId].subjects[subjectId].grades;
        const average = subjectGrades.reduce((sum: number, g: any) => sum + g.score, 0) / subjectGrades.length;
        gradesByStudent[studentId].subjects[subjectId].average = Number(average.toFixed(2));
      });
    });

    const report = {
      classroom,
      period: periodId,
      studentsCount: students.length,
      gradesCount: grades.length,
      students: Object.values(gradesByStudent),
      studentsWithoutGrades: students.filter(s => !gradesByStudent[s.id]),
      generatedAt: new Date()
    };

    // Cachear por 10 minutos
    await RedisCache.set(cacheKey, report, 600);

    return report;
  }

  // Reporte de asistencia por aula
  async getClassroomAttendanceReport(
    prisma: PrismaClient,
    classroomId: string,
    dateFrom?: Date,
    dateTo?: Date,
    userId?: string
  ) {
    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        grade: true,
        section: true,
        isActive: true
      }
    });

    if (!classroom || !classroom.isActive) {
      throw createError(404, 'Aula no encontrada o inactiva', 'CLASSROOM_NOT_FOUND');
    }

    // Verificar permisos
    if (userId) {
    }

    const cacheKey = `report:classroom:attendance:${classroomId}:${dateFrom?.toISOString() || 'all'}:${dateTo?.toISOString() || 'all'}`;
    const cached = await RedisCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;

    const [attendanceRecords, students] = await Promise.all([
      prisma.dailyAttendance.findMany({
        where: {
          classroomId,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true
            }
          }
        },
        orderBy: [
          { date: 'desc' },
          { student: { lastName: 'asc' } }
        ]
      }),
      prisma.user.findMany({
        where: {
          classroomId,
          role: UserRole.STUDENT,
          isActive: true
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentCode: true
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' }
        ]
      })
    ]);

    // Estadísticas por estudiante
    const attendanceByStudent = attendanceRecords.reduce((acc, record) => {
      if (!acc[record.studentId]) {
        acc[record.studentId] = {
          student: record.student,
          records: [],
          stats: {
            present: 0,
            absent: 0,
            late: 0,
            justified: 0,
            total: 0,
            attendanceRate: 0
          }
        };
      }

      acc[record.studentId].records.push({
        date: record.date,
        status: record.status,
        comments: record.comments
      });

      acc[record.studentId].stats[record.status.toLowerCase()]++;
      acc[record.studentId].stats.total++;

      return acc;
    }, {} as Record<string, any>);

    // Calcular porcentajes de asistencia
    Object.keys(attendanceByStudent).forEach(studentId => {
      const stats = attendanceByStudent[studentId].stats;
      const attendedDays = stats.present + stats.late + stats.justified;
      stats.attendanceRate = stats.total > 0
        ? Number((attendedDays / stats.total * 100).toFixed(2))
        : 0;
    });

    // Estadísticas generales
    const totalRecords = attendanceRecords.length;
    const overallStats = {
      present: attendanceRecords.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent: attendanceRecords.filter(r => r.status === AttendanceStatus.ABSENT).length,
      late: attendanceRecords.filter(r => r.status === AttendanceStatus.LATE).length,
      justified: attendanceRecords.filter(r => r.status === AttendanceStatus.EXCUSED).length,
      total: totalRecords
    };

    const report = {
      classroom,
      period: {
        from: dateFrom,
        to: dateTo
      },
      studentsCount: students.length,
      recordsCount: totalRecords,
      overallStats,
      students: Object.values(attendanceByStudent),
      studentsWithoutRecords: students.filter(s => !attendanceByStudent[s.id]),
      generatedAt: new Date()
    };

    // Cachear por 10 minutos
    await RedisCache.set(cacheKey, report, 600);

    return report;
  }

  // Reporte de rendimiento por estudiante
  async getStudentPerformanceReport(
    prisma: PrismaClient,
    studentId: string,
    periodId?: string,
    userId?: string
  ) {
    // Verificar que el estudiante existe
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentCode: true,
        classroomId: true,
        role: true,
        isActive: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        }
      }
    });

    if (!student || !student.isActive || student.role !== UserRole.STUDENT) {
      throw createError(404, 'Estudiante no encontrado o inactivo', 'STUDENT_NOT_FOUND');
    }

    // Verificar permisos
    if (userId) {
    }

    const cacheKey = `report:student:performance:${studentId}:${periodId || 'all'}`;
    const cached = await RedisCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const where: any = {
      studentId
    };

    if (periodId) {
      where.periodId = periodId;
    }

    const [grades, attendance] = await Promise.all([
      prisma.grade.findMany({
        where,
        include: {
          subject: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          activity: {
            select: {
              id: true,
              title: true,
              type: true,
              maxGrade: true,
              weight: true
            }
          },
          period: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { subject: { name: 'asc' } },
          { createdAt: 'desc' }
        ]
      }),
      prisma.dailyAttendance.findMany({
        where: {
          studentId,
          ...(periodId && {
            // Aquí se podría agregar filtro por período si es necesario
          })
        },
        orderBy: { date: 'desc' },
        take: 50 // Últimos 50 registros de asistencia
      })
    ]);

    // Agrupar calificaciones por materia
    const gradesBySubject = grades.reduce((acc, grade) => {
      if (!acc[grade.subjectId]) {
        acc[grade.subjectId] = {
          subject: grade.subject,
          grades: [],
          average: 0,
          bestGrade: 0,
          worstGrade: 20
        };
      }

      acc[grade.subjectId].grades.push({
        id: grade.id,
        score: grade.score,
        activity: grade.activity,
        period: grade.period,
        createdAt: grade.createdAt
      });

      return acc;
    }, {} as Record<string, any>);

    // Calcular estadísticas por materia
    Object.keys(gradesBySubject).forEach(subjectId => {
      const subjectData = gradesBySubject[subjectId];
      const values = subjectData.grades.map((g: any) => g.score);

      subjectData.average = Number((values.reduce((sum: number, v: number) => sum + v, 0) / values.length).toFixed(2));
      subjectData.bestGrade = Math.max(...values);
      subjectData.worstGrade = Math.min(...values);
    });

    // Estadísticas de asistencia
    const attendanceStats = {
      present: attendance.filter(a => a.status === AttendanceStatus.PRESENT).length,
      absent: attendance.filter(a => a.status === AttendanceStatus.ABSENT).length,
      late: attendance.filter(a => a.status === AttendanceStatus.LATE).length,
      justified: attendance.filter(a => a.status === AttendanceStatus.EXCUSED).length,
      total: attendance.length,
      attendanceRate: 0
    };

    const attendedDays = attendanceStats.present + attendanceStats.late + attendanceStats.justified;
    attendanceStats.attendanceRate = attendanceStats.total > 0
      ? Number((attendedDays / attendanceStats.total * 100).toFixed(2))
      : 0;

    // Promedio general
    const allGradeValues = grades.map(g => g.score).filter((s): s is number => s !== null);
    const overallAverage = allGradeValues.length > 0
      ? Number((allGradeValues.reduce((sum, v) => sum + v, 0) / allGradeValues.length).toFixed(2))
      : 0;

    const report = {
      student: {
        ...student,
        classroom: student.classroom
      },
      period: periodId,
      academic: {
        overallAverage,
        totalGrades: grades.length,
        subjectsCount: Object.keys(gradesBySubject).length,
        subjects: Object.values(gradesBySubject)
      },
      attendance: attendanceStats,
      recentAttendance: attendance.slice(0, 10), // Últimos 10 registros
      generatedAt: new Date()
    };

    // Cachear por 10 minutos
    await RedisCache.set(cacheKey, report, 600);

    return report;
  }

  // Exportar reporte a Excel
  async exportToExcel(
    prisma: PrismaClient,
    reportType: string,
    reportData: any,
    filename: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Reporte');

    // Configurar estilos
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '4F46E5' } },
      alignment: { horizontal: 'center' }
    };

    switch (reportType) {
      case 'academic':
        this.generateAcademicExcel(worksheet, reportData, headerStyle);
        break;
      case 'grades':
        this.generateGradesExcel(worksheet, reportData, headerStyle);
        break;
      case 'attendance':
        this.generateAttendanceExcel(worksheet, reportData, headerStyle);
        break;
      case 'student':
        this.generateStudentExcel(worksheet, reportData, headerStyle);
        break;
      default:
        throw createError(400, 'Tipo de reporte no soportado', 'INVALID_REPORT_TYPE');
    }

    return await workbook.xlsx.writeBuffer() as unknown as Buffer;
  }

  // Métodos auxiliares para generar Excel
  private generateAcademicExcel(worksheet: any, data: any, headerStyle: any) {
    worksheet.addRow(['REPORTE ACADÉMICO GENERAL']);
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.addRow([]);

    // Resumen
    worksheet.addRow(['RESUMEN GENERAL']);
    worksheet.getRow(3).font = { bold: true };
    worksheet.addRow(['Total Estudiantes', data.summary.totalStudents]);
    worksheet.addRow(['Total Profesores', data.summary.totalTeachers]);
    worksheet.addRow(['Total Aulas', data.summary.totalClassrooms]);
    worksheet.addRow(['Total Actividades', data.summary.totalActivities]);
    worksheet.addRow([]);

    // Académico
    worksheet.addRow(['ESTADÍSTICAS ACADÉMICAS']);
    worksheet.getRow(9).font = { bold: true };
    worksheet.addRow(['Promedio General', data.academic.averageGrade]);
    worksheet.addRow(['Total Calificaciones', data.academic.totalGrades]);
    worksheet.addRow([]);

    // Asistencia
    worksheet.addRow(['ESTADÍSTICAS DE ASISTENCIA']);
    worksheet.getRow(13).font = { bold: true };
    worksheet.addRow(['Presente', data.attendance.present]);
    worksheet.addRow(['Ausente', data.attendance.absent]);
    worksheet.addRow(['Tardanza', data.attendance.late]);
    worksheet.addRow(['Justificada', data.attendance.justified]);
    worksheet.addRow(['Total', data.attendance.total]);
  }

  private generateGradesExcel(worksheet: any, data: any, headerStyle: any) {
    worksheet.addRow([`REPORTE DE CALIFICACIONES - ${data.classroom.name}`]);
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.addRow([]);

    // Headers
    const headers = ['Estudiante', 'Código', 'Materia', 'Promedio', 'Calificaciones'];
    worksheet.addRow(headers);
    worksheet.getRow(3).eachCell((cell: any) => {
      Object.assign(cell, headerStyle);
    });

    // Datos
    data.students.forEach((studentData: any) => {
      Object.values(studentData.subjects).forEach((subjectData: any) => {
        const grades = subjectData.grades.map((g: any) => g.score).join(', ');
        worksheet.addRow([
          `${studentData.student.firstName} ${studentData.student.lastName}`,
          studentData.student.studentCode,
          subjectData.subject.name,
          subjectData.average,
          grades
        ]);
      });
    });

    worksheet.columns.forEach((column: any) => {
      column.width = 15;
    });
  }

  private generateAttendanceExcel(worksheet: any, data: any, headerStyle: any) {
    worksheet.addRow([`REPORTE DE ASISTENCIA - ${data.classroom.name}`]);
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.addRow([]);

    // Headers
    const headers = ['Estudiante', 'Código', 'Presente', 'Ausente', 'Tardanza', 'Justificada', '% Asistencia'];
    worksheet.addRow(headers);
    worksheet.getRow(3).eachCell((cell: any) => {
      Object.assign(cell, headerStyle);
    });

    // Datos
    data.students.forEach((studentData: any) => {
      worksheet.addRow([
        `${studentData.student.firstName} ${studentData.student.lastName}`,
        studentData.student.studentCode,
        studentData.stats.present,
        studentData.stats.absent,
        studentData.stats.late,
        studentData.stats.justified,
        `${studentData.stats.attendanceRate}%`
      ]);
    });

    worksheet.columns.forEach((column: any) => {
      column.width = 12;
    });
  }

  private generateStudentExcel(worksheet: any, data: any, headerStyle: any) {
    worksheet.addRow([`REPORTE DE RENDIMIENTO - ${data.student.firstName} ${data.student.lastName}`]);
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.addRow([]);

    // Información del estudiante
    worksheet.addRow(['INFORMACIÓN DEL ESTUDIANTE']);
    worksheet.getRow(3).font = { bold: true };
    worksheet.addRow(['Código', data.student.studentCode]);
    worksheet.addRow(['Aula', data.student.classroom?.name || 'No asignada']);
    worksheet.addRow(['Promedio General', data.academic.overallAverage]);
    worksheet.addRow([]);

    // Calificaciones por materia
    worksheet.addRow(['CALIFICACIONES POR MATERIA']);
    worksheet.getRow(8).font = { bold: true };
    const headers = ['Materia', 'Promedio', 'Mejor Nota', 'Peor Nota', 'Total Notas'];
    worksheet.addRow(headers);
    worksheet.getRow(9).eachCell((cell: any) => {
      Object.assign(cell, headerStyle);
    });

    data.academic.subjects.forEach((subject: any) => {
      worksheet.addRow([
        subject.subject.name,
        subject.average,
        subject.bestGrade,
        subject.worstGrade,
        subject.grades.length
      ]);
    });

    worksheet.columns.forEach((column: any) => {
      column.width = 15;
    });
  }

  // Verificar permisos de acceso a reportes

}
