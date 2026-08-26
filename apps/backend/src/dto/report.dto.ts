import { Static, Type } from '@sinclair/typebox'

// DTO para solicitar reportes
export const ReportRequestSchema = Type.Object({
  studentId: Type.String({ minLength: 1 }),
  periodId: Type.String({ minLength: 1 }),
  subjectId: Type.Optional(Type.String({ minLength: 1 })),
  dateFrom: Type.Optional(Type.String({ format: 'date' })),
  dateTo: Type.Optional(Type.String({ format: 'date' })),
})

export type ReportRequestDto = Static<typeof ReportRequestSchema>

// DTO para filtros de reportes de asistencia
export const AttendanceReportFiltersSchema = Type.Object({
  classroomId: Type.Optional(Type.String({ minLength: 1 })),
  studentId: Type.Optional(Type.String({ minLength: 1 })),
  teacherId: Type.Optional(Type.String({ minLength: 1 })),
  subjectId: Type.Optional(Type.String({ minLength: 1 })),
  status: Type.Optional(Type.Union([
    Type.Literal('PRESENT'),
    Type.Literal('ABSENT'),
    Type.Literal('LATE'),
    Type.Literal('EXCUSED')
  ])),
  dateFrom: Type.Optional(Type.String({ format: 'date' })),
  dateTo: Type.Optional(Type.String({ format: 'date' })),
})

export type AttendanceReportFiltersDto = Static<typeof AttendanceReportFiltersSchema>

// DTO para análisis de calificaciones
export const GradeAnalyticsFiltersSchema = Type.Object({
  periodId: Type.Optional(Type.String({ minLength: 1 })),
  subjectId: Type.Optional(Type.String({ minLength: 1 })),
  classroomId: Type.Optional(Type.String({ minLength: 1 })),
  teacherId: Type.Optional(Type.String({ minLength: 1 })),
  minScore: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
  maxScore: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
})

export type GradeAnalyticsFiltersDto = Static<typeof GradeAnalyticsFiltersSchema>

// DTO para reporte consolidado de estudiante
export const StudentReportFiltersSchema = Type.Object({
  includeGrades: Type.Optional(Type.Boolean()),
  includeAttendance: Type.Optional(Type.Boolean()),
  includeActivities: Type.Optional(Type.Boolean()),
  periodId: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
})

export type StudentReportFiltersDto = Static<typeof StudentReportFiltersSchema>
