import { UserRole, ActivityType, AttendanceStatus, ActivityScope, DayOfWeek, Gender } from './/prisma-enums';

// =====================================================
// ROLES Y PERMISOS
// =====================================================

export type RoleES = 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE' | 'TUTOR';

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  PROFESOR: 'PROFESOR',
  ESTUDIANTE: 'ESTUDIANTE',
  TUTOR: 'TUTOR',
} as const satisfies Record<string, RoleES>;

// Mapeo ES -> Prisma
export function toPrismaUserRole(role: RoleES | string): UserRole {
  switch (role) {
    case 'ADMIN': return UserRole.ADMIN;
    case 'PROFESOR':
    case 'TEACHER': return UserRole.TEACHER;
    case 'ESTUDIANTE':
    case 'STUDENT': return UserRole.STUDENT;
    case 'TUTOR': return UserRole.TUTOR;
    default: return role as UserRole;
  }
}

// Mapeo Prisma -> ES
export function fromPrismaUserRole(role: UserRole): RoleES {
  switch (role) {
    case UserRole.ADMIN: return 'ADMIN';
    case UserRole.TEACHER: return 'PROFESOR';
    case UserRole.STUDENT: return 'ESTUDIANTE';
    case UserRole.TUTOR: return 'TUTOR';
  }
}

// Jerarquía de roles (de mayor a menor privilegio)
export const ROLE_HIERARCHY = [
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.TUTOR,
  UserRole.STUDENT,
] as const;

// Permisos por rol
export const ROLE_PERMISSIONS = {
  [UserRole.ADMIN]: [
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'subjects:create',
    'subjects:read',
    'subjects:update',
    'subjects:delete',
    'classrooms:create',
    'classrooms:read',
    'classrooms:update',
    'classrooms:delete',
    'activities:create',
    'activities:read',
    'activities:update',
    'activities:delete',
    'grades:create',
    'grades:read',
    'grades:update',
    'grades:delete',
    'attendance:create',
    'attendance:read',
    'attendance:update',
    'attendance:delete',
    'reports:read',
    'reports:export',
    'schedules:create',
    'schedules:read',
    'schedules:update',
    'schedules:delete',
    'institute:read',
    'institute:update',
  ],
  [UserRole.TEACHER]: [
    'subjects:read', // Ver materias
    'classrooms:read', // Solo aulas asignadas
    'activities:create', // Solo en aulas asignadas
    'activities:read', // Solo en aulas asignadas
    'activities:update', // Solo propias
    'activities:delete', // Solo propias
    'grades:create', // Solo en aulas asignadas
    'grades:read', // Solo en aulas asignadas
    'grades:update', // Solo propias
    'grades:delete', // Solo propias
    'attendance:create', // Solo en aulas asignadas
    'attendance:read', // Solo en aulas asignadas
    'attendance:update', // Solo propias
    'students:read', // Solo de aulas asignadas
    'reports:read', // Solo de aulas asignadas
    'schedules:read', // Solo de aulas asignadas
  ],
  [UserRole.STUDENT]: [
    'grades:read', // Solo propias
    'activities:read', // Solo de sus aulas
    'attendance:read', // Solo propia
    'classrooms:read', // Solo donde está inscrito
    'schedules:read', // Solo de sus aulas
    'profile:read',
    'profile:update',
  ],
  [UserRole.TUTOR]: [
    'grades:read', // Solo de hijos asignados
    'activities:read', // Solo de aulas de hijos
    'attendance:read', // Solo de hijos asignados
    'students:read', // Solo hijos asignados
    'reports:read', // Solo de hijos asignados
    'schedules:read', // Solo de aulas de hijos
  ],
} as const;

// =====================================================
// ACTIVIDADES Y CALENDARIO
// =====================================================

export const ACTIVITY_TYPES = {
  EXAMEN: ActivityType.EXAMEN,
  REVISION_CUADERNO: ActivityType.REVISION_CUADERNO,
  ENTREGA_TRABAJO: ActivityType.ENTREGA_TRABAJO,
  PROYECTO: ActivityType.PROYECTO,
  EXPOSICION: ActivityType.EXPOSICION,
  LABORATORIO: ActivityType.LABORATORIO,
  EVALUACION: ActivityType.EVALUACION,
  TAREA: ActivityType.TAREA,
} as const;

export const ACTIVITY_SCOPES = {
  GLOBAL: ActivityScope.GLOBAL,
  CLASSROOM: ActivityScope.CLASSROOM,
  GRADE: ActivityScope.GRADE,
} as const;

export const DAYS_OF_WEEK = {
  LUNES: DayOfWeek.LUNES,
  MARTES: DayOfWeek.MARTES,
  MIERCOLES: DayOfWeek.MIERCOLES,
  JUEVES: DayOfWeek.JUEVES,
  VIERNES: DayOfWeek.VIERNES,
  SABADO: DayOfWeek.SABADO,
  DOMINGO: DayOfWeek.DOMINGO,
} as const;

// Mapeo de días en español a números (0 = Domingo, 1 = Lunes, etc.)
export const DAY_NUMBER_MAP = {
  [DayOfWeek.DOMINGO]: 0,
  [DayOfWeek.LUNES]: 1,
  [DayOfWeek.MARTES]: 2,
  [DayOfWeek.MIERCOLES]: 3,
  [DayOfWeek.JUEVES]: 4,
  [DayOfWeek.VIERNES]: 5,
  [DayOfWeek.SABADO]: 6,
} as const;

// =====================================================
// ASISTENCIA
// =====================================================

export const ATTENDANCE_STATUSES = {
  PRESENTE: AttendanceStatus.PRESENT,
  AUSENTE: AttendanceStatus.ABSENT,
  TARDANZA: AttendanceStatus.LATE,
  JUSTIFICADA: AttendanceStatus.EXCUSED,
} as const;

// =====================================================
// CALIFICACIONES
// =====================================================

// Sistema de calificaciones de 0 a 20
export const GRADE_SYSTEM = {
  MIN_SCORE: 0,
  MAX_SCORE: 20,
  PASSING_SCORE: 10, // Nota mínima aprobatoria
  EXCELLENT_SCORE: 18, // Nota de excelencia
} as const;

// Escalas de calificación
export const GRADE_SCALES = {
  DEFICIENTE: { min: 0, max: 9, label: 'Deficiente' },
  REGULAR: { min: 10, max: 12, label: 'Regular' },
  BUENO: { min: 13, max: 15, label: 'Bueno' },
  MUY_BUENO: { min: 16, max: 17, label: 'Muy Bueno' },
  EXCELENTE: { min: 18, max: 20, label: 'Excelente' },
} as const;

// =====================================================
// GÉNERO
// =====================================================

export const GENDERS = {
  MASCULINO: Gender.MASCULINO,
  FEMENINO: Gender.FEMENINO,
  OTRO: Gender.OTRO,
} as const;

// =====================================================
// CONFIGURACIÓN DE PAGINACIÓN
// =====================================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;

// =====================================================
// VALIDACIONES
// =====================================================

export const VALIDATION_RULES = {
  // Usuario
  USER_ID_MIN_LENGTH: 7, // Cédula mínima
  USER_ID_MAX_LENGTH: 12, // Cédula máxima
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,

  // Email
  EMAIL_MAX_LENGTH: 255,

  // Teléfono
  PHONE_MIN_LENGTH: 10,
  PHONE_MAX_LENGTH: 15,

  // Actividades
  ACTIVITY_TITLE_MIN_LENGTH: 3,
  ACTIVITY_TITLE_MAX_LENGTH: 100,
  ACTIVITY_DESCRIPTION_MAX_LENGTH: 1000,

  // Aulas
  CLASSROOM_NAME_MIN_LENGTH: 2,
  CLASSROOM_NAME_MAX_LENGTH: 50,
  CLASSROOM_SECTION_MAX_LENGTH: 5,

  // Materias
  SUBJECT_NAME_MIN_LENGTH: 2,
  SUBJECT_NAME_MAX_LENGTH: 50,
  SUBJECT_CODE_MIN_LENGTH: 2,
  SUBJECT_CODE_MAX_LENGTH: 10,

  // Instituto
  INSTITUTE_NAME_MIN_LENGTH: 3,
  INSTITUTE_NAME_MAX_LENGTH: 100,
  INSTITUTE_CODE_MIN_LENGTH: 2,
  INSTITUTE_CODE_MAX_LENGTH: 20,
} as const;

// =====================================================
// SESIONES
// =====================================================

// Configuración de sesión
// TTL en segundos + timeout de inactividad en milisegundos
export const SESSION_CONFIG = {
  // Sesión persistente (mantener sesión): 30 días
  PERSISTENT_SESSION_TTL: 30 * 24 * 60 * 60,
  // Sesión normal sin "mantener sesión": 7 días fijos, sin sliding
  // (alineado con JWT_REFRESH_EXPIRES_IN '7d' — el refresh token JWT expira
  // a los 7 días; el registro en BD coincide en esa ventana).
  NORMAL_SESSION_TTL: 7 * 24 * 60 * 60,
  // Tiempo de inactividad antes de cerrar sesión (en milisegundos)
  INACTIVITY_TIMEOUT: 3 * 60 * 1000,
} as const;

// =====================================================
// MENSAJES DE ERROR
// =====================================================

export const ERROR_MESSAGES = {
  // Autenticación
  INVALID_CREDENTIALS: 'Credenciales inválidas',
  TOKEN_EXPIRED: 'Token expirado',
  TOKEN_INVALID: 'Token inválido',
  UNAUTHORIZED: 'No autorizado',
  UNAUTHORIZED_ACCESS: 'Acceso no autorizado',
  FORBIDDEN: 'Acceso denegado',

  // Usuarios
  USER_NOT_FOUND: 'Usuario no encontrado',
  USER_ALREADY_EXISTS: 'El usuario ya existe',
  USER_INACTIVE: 'Usuario inactivo',

  // Validación
  REQUIRED_FIELD: 'Campo requerido',
  INVALID_EMAIL: 'Email inválido',
  INVALID_PHONE: 'Teléfono inválido',
  INVALID_DATE: 'Fecha inválida',
  INVALID_GRADE: 'Calificación inválida (debe estar entre 0 y 20)',

  // Base de datos
  DATABASE_ERROR: 'Error en la base de datos',
  RECORD_NOT_FOUND: 'Registro no encontrado',
  DUPLICATE_ENTRY: 'Entrada duplicada',

  // Servidor
  INTERNAL_SERVER_ERROR: 'Error interno del servidor',
  SERVICE_UNAVAILABLE: 'Servicio no disponible',

  // Multi-tenant
  INVALID_TENANT: 'Instituto inválido',
  TENANT_NOT_FOUND: 'Instituto no encontrado',
} as const;

// =====================================================
// MENSAJES DE ÉXITO
// =====================================================

export const SUCCESS_MESSAGES = {
  // CRUD
  CREATE_SUCCESS: 'Creado exitosamente',
  UPDATE_SUCCESS: 'Actualizado exitosamente',
  DELETE_SUCCESS: 'Eliminado exitosamente',
  FETCH_SUCCESS: 'Datos obtenidos exitosamente',

  // Autenticación
  LOGIN_SUCCESS: 'Inicio de sesión exitoso',
  LOGOUT_SUCCESS: 'Cierre de sesión exitoso',
  PASSWORD_CHANGED: 'Contraseña cambiada exitosamente',

  // Operaciones
  OPERATION_SUCCESS: 'Operación completada exitosamente',
  EMAIL_SENT: 'Email enviado exitosamente',
} as const;

// =====================================================
// CONFIGURACIÓN DE ARCHIVOS
// =====================================================

export const FILE_CONFIG = {
  // Tamaños máximos (en bytes)
  MAX_AVATAR_SIZE: 2 * 1024 * 1024, // 2MB
  MAX_DOCUMENT_SIZE: 10 * 1024 * 1024, // 10MB

  // Tipos de archivos permitidos
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],

  // Directorios
  UPLOAD_DIRS: {
    AVATARS: 'uploads/avatars',
    DOCUMENTS: 'uploads/documents',
    BACKUPS: 'uploads/backups',
    TEMP: 'uploads/temp',
  },
} as const;

// =====================================================
// CONFIGURACIÓN DE NOTIFICACIONES
// =====================================================

export const NOTIFICATION_TYPES = {
  GRADE_CREATED: 'grade_created',
  GRADE_UPDATED: 'grade_updated',
  ACTIVITY_CREATED: 'activity_created',
  ACTIVITY_DUE_SOON: 'activity_due_soon',
  ATTENDANCE_MARKED: 'attendance_marked',
  USER_CREATED: 'user_created',
  PASSWORD_CHANGED: 'password_changed',
  SYSTEM_MAINTENANCE: 'system_maintenance',
} as const;

// =====================================================
// CONFIGURACIÓN DE SESIONES
// =====================================================


// =====================================================
// CONFIGURACIÓN DE CACHE
// =====================================================

export const CACHE_KEYS = {
  USER: (id: string) => `user:${id}`,
  USER_PERMISSIONS: (id: string) => `user:permissions:${id}`,
  CLASSROOM_STUDENTS: (id: string) => `classroom:students:${id}`,
  CLASSROOM_TEACHERS: (id: string) => `classroom:teachers:${id}`,
  GRADE_AVERAGES: (studentId: string, period: string) => `grades:averages:${studentId}:${period}`,
  ATTENDANCE_STATS: (studentId: string, period: string) => `attendance:stats:${studentId}:${period}`,
  INSTITUTE_CONFIG: (id: string) => `institute:config:${id}`,
} as const;

export const CACHE_TTL = {
  SHORT: 5 * 60, // 5 minutos
  MEDIUM: 15 * 60, // 15 minutos
  LONG: 60 * 60, // 1 hora
  VERY_LONG: 24 * 60 * 60, // 24 horas
} as const;

// =====================================================
// HORARIOS Y FECHAS
// =====================================================

export const TIME_FORMAT = {
  TIME_24H: 'HH:mm',
  TIME_12H: 'hh:mm A',
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DATE_DISPLAY: 'DD/MM/YYYY',
  DATETIME_DISPLAY: 'DD/MM/YYYY HH:mm',
} as const;

// Horarios típicos escolares
export const SCHOOL_SCHEDULE = {
  MORNING_START: '07:00',
  MORNING_END: '12:00',
  AFTERNOON_START: '13:00',
  AFTERNOON_END: '18:00',
  CLASS_DURATION: 45, // minutos
  BREAK_DURATION: 15, // minutos
} as const;

// Legacy exports for backward compatibility
export const ROLES = USER_ROLES;
export const PERMISSIONS = {
  SUBJECTS: {
    READ: 'subjects:read',
    CREATE: 'subjects:create',
    UPDATE: 'subjects:update',
    DELETE: 'subjects:delete',
  },
  USERS: {
    READ: 'users:read',
    CREATE: 'users:create',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
  },
  GRADES: {
    READ: 'grades:read',
    CREATE: 'grades:create',
    UPDATE: 'grades:update',
    DELETE: 'grades:delete',
  },
  ATTENDANCE: {
    READ: 'attendance:read',
    CREATE: 'attendance:create',
    UPDATE: 'attendance:update',
    DELETE: 'attendance:delete',
  },
  CLASSROOMS: {
    READ: 'classrooms:read',
    CREATE: 'classrooms:create',
    UPDATE: 'classrooms:update',
    DELETE: 'classrooms:delete',
  },
  ACTIVITIES: {
    READ: 'activities:read',
    CREATE: 'activities:create',
    UPDATE: 'activities:update',
    DELETE: 'activities:delete',
  },
};

export default {
  USER_ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  ACTIVITY_TYPES,
  ACTIVITY_SCOPES,
  DAYS_OF_WEEK,
  DAY_NUMBER_MAP,
  ATTENDANCE_STATUSES,
  GRADE_SYSTEM,
  GRADE_SCALES,
  GENDERS,
  PAGINATION,
  VALIDATION_RULES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  FILE_CONFIG,
  NOTIFICATION_TYPES,
  SESSION_CONFIG,
  CACHE_KEYS,
  CACHE_TTL,
  TIME_FORMAT,
  SCHOOL_SCHEDULE,
};
