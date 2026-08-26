import { UserRole, ActivityType, AttendanceStatus, ActivityScope, DayOfWeek, Gender } from './/prisma-enums';
import { z } from 'zod';
import { VALIDATION_RULES, GRADE_SYSTEM } from './constants';

// =====================================================
// VALIDADORES BASE
// =====================================================

// Validador de ID de usuario (cédula)
export const userIdSchema = z.string()
  .min(VALIDATION_RULES.USER_ID_MIN_LENGTH, `ID debe tener al menos ${VALIDATION_RULES.USER_ID_MIN_LENGTH} caracteres`)
  .max(VALIDATION_RULES.USER_ID_MAX_LENGTH, `ID no puede tener más de ${VALIDATION_RULES.USER_ID_MAX_LENGTH} caracteres`)
  .regex(/^[a-zA-Z0-9\-]+$/, 'ID debe contener solo letras, números y guiones');

// Validador de email
export const emailSchema = z.string()
  .email('Email inválido')
  .max(VALIDATION_RULES.EMAIL_MAX_LENGTH, `Email no puede tener más de ${VALIDATION_RULES.EMAIL_MAX_LENGTH} caracteres`)
  .toLowerCase();

// Validador de contraseña
export const passwordSchema = z.string()
  .min(VALIDATION_RULES.PASSWORD_MIN_LENGTH, `Contraseña debe tener al menos ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} caracteres`)
  .max(VALIDATION_RULES.PASSWORD_MAX_LENGTH, `Contraseña no puede tener más de ${VALIDATION_RULES.PASSWORD_MAX_LENGTH} caracteres`);

// Validador de nombre
export const nameSchema = z.string()
  .min(VALIDATION_RULES.NAME_MIN_LENGTH, `Nombre debe tener al menos ${VALIDATION_RULES.NAME_MIN_LENGTH} caracteres`)
  .max(VALIDATION_RULES.NAME_MAX_LENGTH, `Nombre no puede tener más de ${VALIDATION_RULES.NAME_MAX_LENGTH} caracteres`)
  .regex(/^[a-zA-ZÁÉÍÓÚÑáéíóúñ\s]+$/, 'Nombre debe contener solo letras y espacios');

// Validador de teléfono
export const phoneSchema = z.string()
  .min(VALIDATION_RULES.PHONE_MIN_LENGTH, `Teléfono debe tener al menos ${VALIDATION_RULES.PHONE_MIN_LENGTH} dígitos`)
  .max(VALIDATION_RULES.PHONE_MAX_LENGTH, `Teléfono no puede tener más de ${VALIDATION_RULES.PHONE_MAX_LENGTH} dígitos`)
  .regex(/^[+]?[0-9\s\-()]+$/, 'Teléfono contiene caracteres inválidos')
  .optional();

// Validador de calificación
export const gradeSchema = z.number()
  .min(GRADE_SYSTEM.MIN_SCORE, `Calificación debe ser al menos ${GRADE_SYSTEM.MIN_SCORE}`)
  .max(GRADE_SYSTEM.MAX_SCORE, `Calificación no puede ser mayor a ${GRADE_SYSTEM.MAX_SCORE}`);

// Validador de fecha
export const dateSchema = z.string().datetime('Fecha debe estar en formato ISO 8601');

// Validador de paginación
export const paginationSchema = z.object({
  page: z.number().int().min(1, 'Página debe ser mayor a 0').default(1),
  limit: z.number().int().min(1, 'Límite debe ser mayor a 0').max(100, 'Límite no puede ser mayor a 100').default(10),
});

// =====================================================
// VALIDADORES DE ENTIDADES
// =====================================================

// Validador de usuario
export const createUserSchema = z.object({
  id: userIdSchema.optional(),
  email: emailSchema,
  password: passwordSchema.optional(),
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  birthDate: z.string().optional(),
  address: z.string().max(255, 'Dirección no puede tener más de 255 caracteres').optional(),
  gender: z.nativeEnum(Gender).optional(),
  role: z.nativeEnum(UserRole),
  avatar: z.string().url('Avatar debe ser una URL válida').optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ id: true, password: true });

export const updateUserPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual es requerida'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

// Validador de instituto
export const createInstituteSchema = z.object({
  name: z.string()
    .min(VALIDATION_RULES.INSTITUTE_NAME_MIN_LENGTH, `Nombre debe tener al menos ${VALIDATION_RULES.INSTITUTE_NAME_MIN_LENGTH} caracteres`)
    .max(VALIDATION_RULES.INSTITUTE_NAME_MAX_LENGTH, `Nombre no puede tener más de ${VALIDATION_RULES.INSTITUTE_NAME_MAX_LENGTH} caracteres`),
  code: z.string()
    .min(VALIDATION_RULES.INSTITUTE_CODE_MIN_LENGTH, `Código debe tener al menos ${VALIDATION_RULES.INSTITUTE_CODE_MIN_LENGTH} caracteres`)
    .max(VALIDATION_RULES.INSTITUTE_CODE_MAX_LENGTH, `Código no puede tener más de ${VALIDATION_RULES.INSTITUTE_CODE_MAX_LENGTH} caracteres`)
    .regex(/^[A-Z0-9_-]+$/, 'Código debe contener solo letras mayúsculas, números, guiones y guiones bajos'),
  email: emailSchema,
  phone: phoneSchema,
  address: z.string().max(255, 'Dirección no puede tener más de 255 caracteres').optional(),
  logo: z.string().url('Logo debe ser una URL válida').optional(),
  colors: z.record(z.string()).optional(),
  subdomain: z.string().regex(/^[a-z0-9-]+$/, 'Subdominio debe contener solo letras minúsculas, números y guiones').optional(),
});

export const updateInstituteSchema = createInstituteSchema.partial().omit({ code: true });

// Validador de aula
export const createClassroomSchema = z.object({
  name: z.string()
    .min(VALIDATION_RULES.CLASSROOM_NAME_MIN_LENGTH, `Nombre debe tener al menos ${VALIDATION_RULES.CLASSROOM_NAME_MIN_LENGTH} caracteres`)
    .max(VALIDATION_RULES.CLASSROOM_NAME_MAX_LENGTH, `Nombre no puede tener más de ${VALIDATION_RULES.CLASSROOM_NAME_MAX_LENGTH} caracteres`),
  section: z.string()
    .max(VALIDATION_RULES.CLASSROOM_SECTION_MAX_LENGTH, `Sección no puede tener más de ${VALIDATION_RULES.CLASSROOM_SECTION_MAX_LENGTH} caracteres`)
    .regex(/^[A-Z0-9]+$/, 'Sección debe contener solo letras mayúsculas y números'),
  grade: z.number().int().min(1, 'Grado debe ser mayor a 0').max(12, 'Grado no puede ser mayor a 12'),
  capacity: z.number().int().min(1, 'Capacidad debe ser mayor a 0').max(50, 'Capacidad no puede ser mayor a 50').optional(),
  academicYearId: z.string().cuid('ID de año académico inválido'),
});

export const updateClassroomSchema = createClassroomSchema.partial();

// Validador de materia
export const createSubjectSchema = z.object({
  name: z.string()
    .min(VALIDATION_RULES.SUBJECT_NAME_MIN_LENGTH, `Nombre debe tener al menos ${VALIDATION_RULES.SUBJECT_NAME_MIN_LENGTH} caracteres`)
    .max(VALIDATION_RULES.SUBJECT_NAME_MAX_LENGTH, `Nombre no puede tener más de ${VALIDATION_RULES.SUBJECT_NAME_MAX_LENGTH} caracteres`),
  code: z.string()
    .min(VALIDATION_RULES.SUBJECT_CODE_MIN_LENGTH, `Código debe tener al menos ${VALIDATION_RULES.SUBJECT_CODE_MIN_LENGTH} caracteres`)
    .max(VALIDATION_RULES.SUBJECT_CODE_MAX_LENGTH, `Código no puede tener más de ${VALIDATION_RULES.SUBJECT_CODE_MAX_LENGTH} caracteres`)
    .regex(/^[A-Z0-9_-]+$/, 'Código debe contener solo letras mayúsculas, números, guiones y guiones bajos')
    .optional(),
  description: z.string().max(255, 'Descripción no puede tener más de 255 caracteres').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color debe ser un código hexadecimal válido').optional(),
});

export const updateSubjectSchema = createSubjectSchema.partial().omit({ code: true });

// Validador de actividad
export const createActivitySchema = z.object({
  title: z.string()
    .min(VALIDATION_RULES.ACTIVITY_TITLE_MIN_LENGTH, `Título debe tener al menos ${VALIDATION_RULES.ACTIVITY_TITLE_MIN_LENGTH} caracteres`)
    .max(VALIDATION_RULES.ACTIVITY_TITLE_MAX_LENGTH, `Título no puede tener más de ${VALIDATION_RULES.ACTIVITY_TITLE_MAX_LENGTH} caracteres`),
  description: z.string()
    .max(VALIDATION_RULES.ACTIVITY_DESCRIPTION_MAX_LENGTH, `Descripción no puede tener más de ${VALIDATION_RULES.ACTIVITY_DESCRIPTION_MAX_LENGTH} caracteres`)
    .optional(),
  type: z.nativeEnum(ActivityType),
  scope: z.nativeEnum(ActivityScope),
  startDate: z.string().datetime('Fecha de inicio debe estar en formato ISO 8601'),
  endDate: z.string().datetime('Fecha de fin debe estar en formato ISO 8601').optional(),
  dueDate: z.string().datetime('Fecha límite debe estar en formato ISO 8601').optional(),
  maxGrade: z.number().min(1, 'Calificación máxima debe ser mayor a 0').max(20, 'Calificación máxima no puede ser mayor a 20').default(20),
  weight: z.number().min(0.1, 'Peso debe ser mayor a 0').max(10, 'Peso no puede ser mayor a 10').default(1),
  isVisible: z.boolean().default(true),
  periodId: z.string().cuid('ID de período inválido').optional(),
  subjectId: z.string().cuid('ID de materia inválido').optional(),
  classroomId: z.string().cuid('ID de aula inválido').optional(),
}).refine(
  data => {
    if (data.endDate && data.startDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'Fecha de fin debe ser posterior a fecha de inicio',
    path: ['endDate'],
  }
).refine(
  data => {
    if (data.dueDate && data.startDate) {
      return new Date(data.dueDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'Fecha límite debe ser posterior a fecha de inicio',
    path: ['dueDate'],
  }
);

export const updateActivitySchema = z.object({
  title: z.string().min(3, 'Título debe tener al menos 3 caracteres').max(100, 'Título no puede tener más de 100 caracteres').optional(),
  description: z.string().max(500, 'Descripción no puede tener más de 500 caracteres').optional(),
  type: z.nativeEnum(ActivityType).optional(),
  scope: z.nativeEnum(ActivityScope).optional(),
  startDate: z.string().datetime('Fecha de inicio debe estar en formato ISO 8601').optional(),
  endDate: z.string().datetime('Fecha de fin debe estar en formato ISO 8601').optional(),
  dueDate: z.string().datetime('Fecha límite debe estar en formato ISO 8601').optional(),
  maxGrade: z.number().min(1, 'Calificación máxima debe ser mayor a 0').max(20, 'Calificación máxima no puede ser mayor a 20').optional(),
  weight: z.number().min(0.1, 'Peso debe ser mayor a 0').max(10, 'Peso no puede ser mayor a 10').optional(),
  isVisible: z.boolean().optional(),
  periodId: z.string().cuid('ID de período inválido').optional(),
  subjectId: z.string().cuid('ID de materia inválido').optional(),
  classroomId: z.string().cuid('ID de aula inválido').optional(),
});

// Validador de calificación
export const createGradeSchema = z.object({
  score: gradeSchema,
  comments: z.string().max(500, 'Comentarios no pueden tener más de 500 caracteres').optional(),
  studentId: z.string().min(1, 'ID de estudiante es requerido'),
  activityId: z.string().cuid('ID de actividad inválido'),
  periodId: z.string().cuid('ID de período inválido'),
  subjectId: z.string().cuid('ID de materia inválido'),
});

export const updateGradeSchema = createGradeSchema.partial().omit({ studentId: true, activityId: true });

// Validador de asistencia
export const createAttendanceSchema = z.object({
  date: z.string().datetime('Fecha debe estar en formato ISO 8601'),
  status: z.nativeEnum(AttendanceStatus),
  comments: z.string().max(255, 'Comentarios no pueden tener más de 255 caracteres').optional(),
  studentId: z.string().min(1, 'ID de estudiante es requerido'),
  subjectId: z.string().min(1, 'ID de materia es requerido'),
  classroomId: z.string().cuid('ID de aula inválido'),
  periodId: z.string().cuid('ID de período inválido').optional(),
});

export const updateAttendanceSchema = createAttendanceSchema.partial().omit({ studentId: true, classroomId: true, date: true });

// Validador de horario
export const createScheduleSchema = z.object({
  dayOfWeek: z.nativeEnum(DayOfWeek),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Hora de inicio debe estar en formato HH:mm'),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Hora de fin debe estar en formato HH:mm'),
  classroomId: z.string().cuid('ID de aula inválido'),
  subjectId: z.string().cuid('ID de materia inválido'),
  teacherId: z.string().optional(),
}).refine(
  data => {
    const startTime = data.startTime.split(':').map(Number);
    const endTime = data.endTime.split(':').map(Number);
    const startMinutes = startTime[0] * 60 + startTime[1];
    const endMinutes = endTime[0] * 60 + endTime[1];
    return endMinutes > startMinutes;
  },
  {
    message: 'Hora de fin debe ser posterior a hora de inicio',
    path: ['endTime'],
  }
);

export const updateScheduleSchema = z.object({
  dayOfWeek: z.nativeEnum(DayOfWeek).optional(),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Hora de inicio debe estar en formato HH:MM').optional(),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Hora de fin debe estar en formato HH:MM').optional(),
  classroomId: z.string().cuid('ID de aula inválido').optional(),
  subjectId: z.string().cuid('ID de materia inválido').optional(),
  teacherId: z.string().min(1, 'ID de profesor es requerido').optional(),
  periodId: z.string().cuid('ID de período inválido').optional(),
});

// Validador de año académico
export const createAcademicYearSchema = z.object({
  name: z.string().min(3, 'Nombre debe tener al menos 3 caracteres').max(20, 'Nombre no puede tener más de 20 caracteres'),
  startDate: z.string().datetime('Fecha de inicio debe estar en formato ISO 8601'),
  endDate: z.string().datetime('Fecha de fin debe estar en formato ISO 8601'),
  isActive: z.boolean().default(false),
}).refine(
  data => new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'Fecha de fin debe ser posterior a fecha de inicio',
    path: ['endDate'],
  }
);

export const updateAcademicYearSchema = z.object({
  name: z.string().min(3, 'Nombre debe tener al menos 3 caracteres').max(20, 'Nombre no puede tener más de 20 caracteres').optional(),
  startDate: z.string().datetime('Fecha de inicio debe estar en formato ISO 8601').optional(),
  endDate: z.string().datetime('Fecha de fin debe estar en formato ISO 8601').optional(),
  isActive: z.boolean().optional(),
});

// Validador de período
export const createPeriodSchema = z.object({
  name: z.string().min(3, 'Nombre debe tener al menos 3 caracteres').max(50, 'Nombre no puede tener más de 50 caracteres'),
  startDate: z.string().datetime('Fecha de inicio debe estar en formato ISO 8601'),
  endDate: z.string().datetime('Fecha de fin debe estar en formato ISO 8601'),
  isActive: z.boolean().default(false),
  academicYearId: z.string().cuid('ID de año académico inválido'),
}).refine(
  data => new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'Fecha de fin debe ser posterior a fecha de inicio',
    path: ['endDate'],
  }
);

export const updatePeriodSchema = z.object({
  name: z.string().min(3, 'Nombre debe tener al menos 3 caracteres').max(50, 'Nombre no puede tener más de 50 caracteres').optional(),
  startDate: z.string().datetime('Fecha de inicio debe estar en formato ISO 8601').optional(),
  endDate: z.string().datetime('Fecha de fin debe estar en formato ISO 8601').optional(),
  isActive: z.boolean().optional(),
  academicYearId: z.string().cuid('ID de año académico inválido').optional(),
});

// =====================================================
// VALIDADORES DE AUTENTICACIÓN
// =====================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Contraseña es requerida'),
  keepSession: z.boolean().default(false),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Token de actualización es requerido'),
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export const confirmResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token es requerido'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

// =====================================================
// VALIDADORES DE CONSULTAS
// =====================================================

export const getUsersQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
  classroomId: z.string().optional(),
  isActive: z.boolean().optional(),
  sortBy: z.enum(['firstName', 'lastName', 'email', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const getActivitiesQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  type: z.nativeEnum(ActivityType).optional(),
  scope: z.nativeEnum(ActivityScope).optional(),
  subjectId: z.string().cuid().optional(),
  classroomId: z.string().cuid().optional(),
  periodId: z.string().cuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['title', 'startDate', 'dueDate', 'createdAt']).default('startDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const getGradesQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  studentId: z.string().optional(),
  subjectId: z.string().cuid().optional(),
  periodId: z.string().cuid().optional(),
  activityId: z.string().cuid().optional(),
  classroomId: z.string().optional(),
  teacherId: z.string().optional(),
  minScore: z.number().min(0).max(20).optional(),
  maxScore: z.number().min(0).max(20).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['score', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// =====================================================
// FUNCIONES AUXILIARES DE VALIDACIÓN
// =====================================================

/**
 * Validar email de manera simple
 */
export function isValidEmail(email: string): boolean {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validar calificación
 */
export function isValidGrade(score: number): boolean {
  try {
    gradeSchema.parse(score);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validar formato de fecha ISO
 */
export function isValidISODate(date: string): boolean {
  try {
    dateSchema.parse(date);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validar ID de usuario (cédula)
 */
export function isValidUserId(id: string): boolean {
  try {
    userIdSchema.parse(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizar string removiendo caracteres peligrosos
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>"'&]/g, '') // Remover caracteres HTML peligrosos
    .trim(); // Remover espacios al inicio y final
}

/**
 * Validar y parsear parámetros de paginación
 */
export function validatePagination(query: any): { page: number; limit: number; offset: number } {
  const parsed = paginationSchema.parse({
    page: query.page ? parseInt(query.page, 10) : 1,
    limit: query.limit ? parseInt(query.limit, 10) : 10,
  });

  return {
    page: parsed.page,
    limit: parsed.limit,
    offset: (parsed.page - 1) * parsed.limit,
  };
}

// =====================================================
// ENUMS (migrados desde notification.dto.ts)
// =====================================================

export enum NotificationType {
  ACADEMIC = 'ACADEMIC',
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  SYSTEM = 'SYSTEM',
  REMINDER = 'REMINDER',
  ALERT = 'ALERT'
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

// =====================================================
// TIPOS INFERIDOS (reemplazan class-validator DTOs)
// =====================================================

// Auth
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ConfirmResetPasswordInput = z.infer<typeof confirmResetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof updateUserPasswordSchema>;

// Users
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserFiltersInput = z.infer<typeof getUsersQuerySchema>;

// Pagination
export type PaginationInput = z.infer<typeof paginationSchema>;

// Institute
export type CreateInstituteInput = z.infer<typeof createInstituteSchema>;
export type UpdateInstituteInput = z.infer<typeof updateInstituteSchema>;

// Classroom
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;

// Subject
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

// Activity
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type ActivityFiltersInput = z.infer<typeof getActivitiesQuerySchema>;

// Grade
export type CreateGradeInput = z.infer<typeof createGradeSchema>;
export type UpdateGradeInput = z.infer<typeof updateGradeSchema>;
export type GradeFiltersInput = z.infer<typeof getGradesQuerySchema>;

// Attendance
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;

// Schedule
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

// Academic Year
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

// Period
export type CreatePeriodInput = z.infer<typeof createPeriodSchema>;
export type UpdatePeriodInput = z.infer<typeof updatePeriodSchema>;

export default {
  // Schemas de creación
  createUserSchema,
  createInstituteSchema,
  createClassroomSchema,
  createSubjectSchema,
  createActivitySchema,
  createGradeSchema,
  createAttendanceSchema,
  createScheduleSchema,
  createAcademicYearSchema,
  createPeriodSchema,

  // Schemas de actualización
  updateUserSchema,
  updateInstituteSchema,
  updateClassroomSchema,
  updateSubjectSchema,
  updateActivitySchema,
  updateGradeSchema,
  updateAttendanceSchema,
  updateScheduleSchema,
  updateAcademicYearSchema,
  updatePeriodSchema,

  // Schemas de autenticación
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  confirmResetPasswordSchema,
  updateUserPasswordSchema,

  // Schemas de consultas
  getUsersQuerySchema,
  getActivitiesQuerySchema,
  getGradesQuerySchema,

  // Validadores base
  userIdSchema,
  emailSchema,
  passwordSchema,
  nameSchema,
  phoneSchema,
  gradeSchema,
  dateSchema,
  paginationSchema,

  // Funciones auxiliares
  isValidEmail,
  isValidGrade,
  isValidISODate,
  isValidUserId,
  sanitizeString,
  validatePagination,
};

