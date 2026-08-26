// Re-export Prisma native enums + app-level enums
// Now that we use PostgreSQL, UserRole, Gender, AttendanceStatus, etc. are native Prisma enums

export {
    UserRole,
    Gender,
    AttendanceStatus,
    AcademicYearStatus,
    InstituteStatus,
    PlanType,
} from '@prisma/client';

// App-level enums (not in Prisma schema — used in business logic)

export enum ActivityType {
    EXAMEN = 'EXAMEN',
    REVISION_CUADERNO = 'REVISION_CUADERNO',
    ENTREGA_TRABAJO = 'ENTREGA_TRABAJO',
    PROYECTO = 'PROYECTO',
    EXPOSICION = 'EXPOSICION',
    LABORATORIO = 'LABORATORIO',
    EVALUACION = 'EVALUACION',
    TAREA = 'TAREA'
}

export enum ActivityScope {
    GLOBAL = 'GLOBAL',
    CLASSROOM = 'CLASSROOM',
    GRADE = 'GRADE'
}

export enum DayOfWeek {
    MONDAY = 'MONDAY',
    TUESDAY = 'TUESDAY',
    WEDNESDAY = 'WEDNESDAY',
    THURSDAY = 'THURSDAY',
    FRIDAY = 'FRIDAY',
    SATURDAY = 'SATURDAY',
    SUNDAY = 'SUNDAY',
    LUNES = 'LUNES',
    MARTES = 'MARTES',
    MIERCOLES = 'MIERCOLES',
    JUEVES = 'JUEVES',
    VIERNES = 'VIERNES',
    SABADO = 'SABADO',
    DOMINGO = 'DOMINGO'
}

export enum ActionType {
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    LOGIN = 'LOGIN',
    LOGOUT = 'LOGOUT',
    BULK_CREATE = 'BULK_CREATE',
    ASSIGN_GUIDE = 'ASSIGN_GUIDE',
    REMOVE_GUIDE = 'REMOVE_GUIDE',
    REACTIVATE = 'REACTIVATE'
}
