import { UserRole } from './/prisma-enums';
import { ROLE_PERMISSIONS, ROLE_HIERARCHY } from './constants';
import { RequestUser } from '../types/fastify';

// =====================================================
// TIPOS PARA PERMISOS
// =====================================================

export type Permission =
  | 'users:create' | 'users:read' | 'users:update' | 'users:delete'
  | 'classrooms:create' | 'classrooms:read' | 'classrooms:update' | 'classrooms:delete'
  | 'activities:create' | 'activities:read' | 'activities:update' | 'activities:delete'
  | 'grades:create' | 'grades:read' | 'grades:update' | 'grades:delete'
  | 'attendance:create' | 'attendance:read' | 'attendance:update' | 'attendance:delete'
  | 'reports:read' | 'reports:export'
  | 'schedules:create' | 'schedules:read' | 'schedules:update' | 'schedules:delete'
  | 'students:read'
  | 'institute:read' | 'institute:update'
  | 'profile:read' | 'profile:update'
  | 'subjects:create' | 'subjects:read' | 'subjects:update' | 'subjects:delete';

export interface PermissionContext {
  userId?: string;
  classroomId?: string;
  studentId?: string;
  teacherId?: string;
  instituteId?: string;
  resourceOwnerId?: string;
}

// =====================================================
// FUNCIONES DE VERIFICACIÓN DE PERMISOS
// =====================================================

/**
 * Verificar si un usuario tiene un permiso específico
 * @param user - Usuario autenticado
 * @param permission - Permiso a verificar
 * @param context - Contexto adicional para verificaciones específicas
 * @returns true si tiene el permiso
 */
export function hasPermission(
  user: RequestUser,
  permission: Permission,
  context?: PermissionContext
): boolean {
  // Los administradores tienen todos los permisos dentro de su instituto
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  // Verificar si el rol tiene el permiso básico
  const rolePermissions = ROLE_PERMISSIONS[user.role] as readonly Permission[];
  if (!rolePermissions.includes(permission)) {
    return false;
  }

  // Verificaciones adicionales basadas en contexto
  return checkContextualPermissions(user, permission, context);
}

/**
 * Verificar permisos contextuales específicos
 */
function checkContextualPermissions(
  user: RequestUser,
  permission: Permission,
  context?: PermissionContext
): boolean {
  if (!context) return true;

  switch (user.role) {
    case UserRole.TEACHER:
      return checkTeacherPermissions(user, permission, context);

    case UserRole.STUDENT:
      return checkStudentPermissions(user, permission, context);

    case UserRole.TUTOR:
      return checkTutorPermissions(user, permission, context);

    default:
      return true;
  }
}

/**
 * Verificar permisos específicos de profesor
 */
function checkTeacherPermissions(
  user: RequestUser,
  permission: Permission,
  context: PermissionContext
): boolean {
  // Los profesores solo pueden operar en sus aulas asignadas
  if (permission.includes('classrooms:') && context.classroomId) {
    // Aquí necesitarías verificar si el profesor está asignado al aula
    // Por ahora retornamos true, pero en la implementación real
    // consultarías la base de datos
    return true;
  }

  // Los profesores solo pueden ver/editar sus propias actividades
  if (permission.includes('activities:') && context.resourceOwnerId) {
    return context.resourceOwnerId === user.userId;
  }

  // Los profesores solo pueden calificar en sus aulas
  if (permission.includes('grades:') && context.classroomId) {
    return true; // Verificar asignación de aula en implementación real
  }

  return true;
}

/**
 * Verificar permisos específicos de estudiante
 */
function checkStudentPermissions(
  user: RequestUser,
  permission: Permission,
  context: PermissionContext
): boolean {
  // Los estudiantes solo pueden ver sus propios datos
  if (permission.includes('grades:read') && context.studentId) {
    return context.studentId === user.userId;
  }

  if (permission.includes('attendance:read') && context.studentId) {
    return context.studentId === user.userId;
  }

  // Los estudiantes solo pueden actualizar su propio perfil
  if (permission.includes('profile:update') && context.userId) {
    return context.userId === user.userId;
  }

  return true;
}

/**
 * Verificar permisos específicos de tutor
 */
function checkTutorPermissions(
  user: RequestUser,
  permission: Permission,
  context: PermissionContext
): boolean {
  // Los tutores solo pueden ver datos de sus hijos asignados
  if (context.studentId) {
    // Aquí verificarías si el tutor tiene asignado ese estudiante
    // Por ahora retornamos true, pero en implementación real
    // consultarías la tabla student_tutors
    return true;
  }

  return true;
}

/**
 * Verificar si un usuario puede acceder a un recurso específico
 * @param user - Usuario autenticado
 * @param resourceType - Tipo de recurso
 * @param resourceId - ID del recurso
 * @param action - Acción a realizar
 * @returns true si puede acceder
 */
export function canAccessResource(
  user: RequestUser,
  resourceType: 'user' | 'classroom' | 'activity' | 'grade' | 'attendance',
  resourceId: string,
  action: 'read' | 'write' | 'delete'
): boolean {
  const permission = `${resourceType}s:${action === 'write' ? 'update' : action}` as Permission;

  const context: PermissionContext = {
    [`${resourceType}Id`]: resourceId,
  };

  return hasPermission(user, permission, context);
}

/**
 * Verificar si un usuario puede acceder a datos de otro usuario
 * @param currentUser - Usuario actual
 * @param targetUserId - ID del usuario objetivo
 * @param action - Acción a realizar
 * @returns true si puede acceder
 */
export function canAccessUserData(
  currentUser: RequestUser,
  targetUserId: string,
  action: 'read' | 'write' = 'read'
): boolean {
  // Los usuarios siempre pueden acceder a sus propios datos
  if (currentUser.userId === targetUserId) {
    return true;
  }

  // Los administradores pueden acceder a todos los datos del instituto
  if (currentUser.role === UserRole.ADMIN) {
    return true;
  }

  // Los profesores pueden ver datos de estudiantes en sus aulas
  if (currentUser.role === UserRole.TEACHER && action === 'read') {
    // Verificar si el estudiante está en alguna aula del profesor
    return true; // Implementar verificación real
  }

  // Los tutores pueden ver datos de sus hijos
  if (currentUser.role === UserRole.TUTOR && action === 'read') {
    // Verificar relación tutor-estudiante
    return true; // Implementar verificación real
  }

  return false;
}

/**
 * Verificar jerarquía de roles
 * @param userRole - Rol del usuario
 * @param requiredRole - Rol requerido
 * @returns true si el usuario tiene un rol igual o superior
 */
export function hasRoleOrHigher(userRole: UserRole, requiredRole: UserRole): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  // Un índice menor significa mayor jerarquía
  return userRoleIndex <= requiredRoleIndex;
}

/**
 * Verificar si un usuario puede realizar una acción en un aula específica
 * @param user - Usuario autenticado
 * @param classroomId - ID del aula
 * @param action - Acción a realizar
 * @returns true si puede realizar la acción
 */
export function canAccessClassroom(
  user: RequestUser,
  classroomId: string,
  action: 'read' | 'write' | 'manage' = 'read'
): boolean {
  // Los administradores pueden hacer todo
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  // Los profesores pueden acceder a sus aulas asignadas
  if (user.role === UserRole.TEACHER) {
    // Verificar asignación en implementación real
    return true;
  }

  // Los estudiantes solo pueden ver sus propias aulas
  if (user.role === UserRole.STUDENT && action === 'read') {
    // Verificar inscripción en implementación real
    return true;
  }

  // Los tutores pueden ver aulas de sus hijos
  if (user.role === UserRole.TUTOR && action === 'read') {
    // Verificar a través de relación tutor-estudiante
    return true;
  }

  return false;
}

/**
 * Verificar si el usuario pertenece al instituto único (single tenant)
 * En el modelo single tenant, todos los usuarios pertenecen al mismo instituto
 * @param user - Usuario autenticado
 * @returns true siempre (single tenant)
 */
export function canAccessInstitute(
  user: RequestUser
): boolean {
  // En single tenant, todos los usuarios tienen acceso al instituto único
  return user.instituteId === 'institute';
}

/**
 * Verificar si un usuario puede crear recursos
 * @param user - Usuario autenticado
 * @param resourceType - Tipo de recurso a crear
 * @returns true si puede crear el recurso
 */
export function canCreateResource(
  user: RequestUser,
  resourceType: 'user' | 'classroom' | 'activity' | 'grade' | 'attendance' | 'subject'
): boolean {
  const permission = `${resourceType}s:create` as Permission;
  return hasPermission(user, permission);
}

/**
 * Verificar si un usuario puede eliminar un recurso
 * @param user - Usuario autenticado
 * @param resourceType - Tipo de recurso
 * @param resourceOwnerId - ID del propietario del recurso
 * @returns true si puede eliminar
 */
export function canDeleteResource(
  user: RequestUser,
  resourceType: 'user' | 'classroom' | 'activity' | 'grade' | 'attendance',
  resourceOwnerId?: string
): boolean {
  // Los administradores pueden eliminar todo en su instituto
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  const permission = `${resourceType}s:delete` as Permission;

  // Verificar permiso básico
  if (!hasPermission(user, permission)) {
    return false;
  }

  // Los usuarios solo pueden eliminar sus propios recursos
  if (resourceOwnerId) {
    return resourceOwnerId === user.userId;
  }

  return true;
}

/**
 * Filtrar lista de permisos según el rol del usuario
 * @param userRole - Rol del usuario
 * @returns Lista de permisos del usuario
 */
export function getUserPermissions(userRole: UserRole): Permission[] {
  // Return a mutable copy to avoid readonly assignment issues
  return [...ROLE_PERMISSIONS[userRole]] as Permission[];
}

/**
 * Verificar múltiples permisos a la vez
 * @param user - Usuario autenticado
 * @param permissions - Lista de permisos a verificar
 * @param requireAll - Si true, requiere todos los permisos. Si false, requiere al menos uno
 * @returns true si cumple con los permisos
 */
export function hasPermissions(
  user: RequestUser,
  permissions: Permission[],
  requireAll: boolean = true
): boolean {
  if (requireAll) {
    return permissions.every(permission => hasPermission(user, permission));
  } else {
    return permissions.some(permission => hasPermission(user, permission));
  }
}

/**
 * Crear contexto de permisos para una operación
 * @param params - Parámetros para el contexto
 * @returns Contexto de permisos
 */
export function createPermissionContext(params: Partial<PermissionContext>): PermissionContext {
  return {
    userId: params.userId,
    classroomId: params.classroomId,
    studentId: params.studentId,
    teacherId: params.teacherId,
    instituteId: params.instituteId,
    resourceOwnerId: params.resourceOwnerId,
  };
}

export default {
  hasPermission,
  canAccessResource,
  canAccessUserData,
  hasRoleOrHigher,
  canAccessClassroom,
  canAccessInstitute,
  canCreateResource,
  canDeleteResource,
  getUserPermissions,
  hasPermissions,
  createPermissionContext,
};
