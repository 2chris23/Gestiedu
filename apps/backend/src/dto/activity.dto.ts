import { Static, Type } from '@sinclair/typebox'

// DTO para crear actividades
export const CreateActivitySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  type: Type.Union([
    Type.Literal('EXAM'),
    Type.Literal('ASSIGNMENT'),
    Type.Literal('PROJECT'),
    Type.Literal('QUIZ'),
    Type.Literal('PRESENTATION'),
    Type.Literal('PRACTICAL'),
    Type.Literal('OTHER')
  ]),
  subjectId: Type.String({ minLength: 1 }),
  classroomId: Type.String({ minLength: 1 }),
  periodId: Type.String({ minLength: 1 }),
  weight: Type.Number({ minimum: 0, maximum: 100 }),
  maxScore: Type.Number({ minimum: 1, maximum: 20 }),
  dueDate: Type.Optional(Type.String({ format: 'date-time' })),
  instructions: Type.Optional(Type.String({ maxLength: 2000 })),
  isActive: Type.Optional(Type.Boolean()),
})

export type CreateActivityDto = Static<typeof CreateActivitySchema>

// DTO para actualizar actividades
export const UpdateActivitySchema = Type.Partial(CreateActivitySchema)

export type UpdateActivityDto = Static<typeof UpdateActivitySchema>

// DTO para filtros de actividades
export const ActivityFiltersSchema = Type.Object({
  subjectId: Type.Optional(Type.String({ minLength: 1 })),
  classroomId: Type.Optional(Type.String({ minLength: 1 })),
  periodId: Type.Optional(Type.String({ minLength: 1 })),
  teacherId: Type.Optional(Type.String({ minLength: 1 })),
  type: Type.Optional(Type.Union([
    Type.Literal('EXAM'),
    Type.Literal('ASSIGNMENT'),
    Type.Literal('PROJECT'),
    Type.Literal('QUIZ'),
    Type.Literal('PRESENTATION'),
    Type.Literal('PRACTICAL'),
    Type.Literal('OTHER')
  ])),
  isActive: Type.Optional(Type.Boolean()),
  dueDateFrom: Type.Optional(Type.String({ format: 'date-time' })),
  dueDateTo: Type.Optional(Type.String({ format: 'date-time' })),
  search: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  minWeight: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  maxWeight: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
})

export type ActivityFiltersDto = Static<typeof ActivityFiltersSchema>

// DTO básico para actividades
export const ActivitySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  type: Type.String(),
  subjectId: Type.String(),
  classroomId: Type.String(),
  periodId: Type.String(),
  weight: Type.Number(),
  maxScore: Type.Number(),
  dueDate: Type.Optional(Type.String({ format: 'date-time' })),
  instructions: Type.Optional(Type.String()),
  isActive: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

export type ActivityDto = Static<typeof ActivitySchema>

// DTO para clonar actividades
export const CloneActivitySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  classroomId: Type.Optional(Type.String({ minLength: 1 })),
  periodId: Type.Optional(Type.String({ minLength: 1 })),
  dueDate: Type.Optional(Type.String({ format: 'date-time' })),
  includeInstructions: Type.Optional(Type.Boolean()),
})

export type CloneActivityDto = Static<typeof CloneActivitySchema>
