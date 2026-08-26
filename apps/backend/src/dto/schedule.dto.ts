import { Static, Type } from '@sinclair/typebox'

// DTO para crear horarios
export const CreateScheduleSchema = Type.Object({
  classroomId: Type.String({ minLength: 1 }),
  teacherId: Type.String({ minLength: 1 }),
  subjectId: Type.String({ minLength: 1 }),
  dayOfWeek: Type.Union([
    Type.Literal('MONDAY'),
    Type.Literal('TUESDAY'),
    Type.Literal('WEDNESDAY'),
    Type.Literal('THURSDAY'),
    Type.Literal('FRIDAY'),
    Type.Literal('SATURDAY'),
    Type.Literal('SUNDAY')
  ]),
  startTime: Type.String({ pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }), // HH:MM format
  endTime: Type.String({ pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }), // HH:MM format
  room: Type.Optional(Type.String({ maxLength: 50 })),
  notes: Type.Optional(Type.String({ maxLength: 500 })),
})

export type CreateScheduleDto = Static<typeof CreateScheduleSchema>

// DTO para actualizar horarios
export const UpdateScheduleSchema = Type.Partial(CreateScheduleSchema)

export type UpdateScheduleDto = Static<typeof UpdateScheduleSchema>

// DTO para filtros de horarios
export const ScheduleFiltersSchema = Type.Object({
  classroomId: Type.Optional(Type.String({ minLength: 1 })),
  teacherId: Type.Optional(Type.String({ minLength: 1 })),
  subjectId: Type.Optional(Type.String({ minLength: 1 })),
  instituteId: Type.Optional(Type.String({ minLength: 1 })),
  grade: Type.Optional(Type.Number({ minimum: 1, maximum: 12 })),
  dayOfWeek: Type.Optional(Type.Union([
    Type.Literal('MONDAY'),
    Type.Literal('TUESDAY'),
    Type.Literal('WEDNESDAY'),
    Type.Literal('THURSDAY'),
    Type.Literal('FRIDAY'),
    Type.Literal('SATURDAY'),
    Type.Literal('SUNDAY')
  ])),
  timeFrom: Type.Optional(Type.String({ pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' })),
  timeTo: Type.Optional(Type.String({ pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' })),
  search: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
})

export type ScheduleFiltersDto = Static<typeof ScheduleFiltersSchema>

// DTO básico para horarios
export const ScheduleSchema = Type.Object({
  id: Type.String(),
  classroomId: Type.String(),
  teacherId: Type.String(),
  subjectId: Type.String(),
  dayOfWeek: Type.String(),
  startTime: Type.String(),
  endTime: Type.String(),
  room: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

export type ScheduleDto = Static<typeof ScheduleSchema>
