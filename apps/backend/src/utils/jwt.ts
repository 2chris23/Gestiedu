import { UserRole } from './/prisma-enums';
// Re-exportar funciones JWT desde la configuración
export {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  getTokenExpiration,
  isTokenExpiringSoon,
  extractTokenFromHeader,
  generateTokenPair,
  jwtConfig,
  type JWTPayload,
  type RefreshTokenPayload,
} from '../config/jwt';

// Utilidades adicionales específicas para este archivo
import { JWTPayload, generateAccessToken, verifyAccessToken } from '../config/jwt';

// Legacy exports for backwards compatibility
export const generateToken = generateAccessToken;
export const verifyToken = verifyAccessToken;
export type VerifyPayloadType = JWTPayload;

/**
 * Verificar si un usuario tiene un rol específico
 */
export function hasRole(user: JWTPayload, role: UserRole): boolean {
  return user.role === role;
}

/**
 * Verificar si un usuario tiene uno de varios roles
 */
export function hasAnyRole(user: JWTPayload, roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

/**
 * Verificar si un usuario es administrador
 */
export function isAdmin(user: JWTPayload): boolean {
  return user.role === UserRole.ADMIN;
}

/**
 * Verificar si un usuario es profesor
 */
export function isTeacher(user: JWTPayload): boolean {
  return user.role === UserRole.TEACHER;
}

/**
 * Verificar si un usuario es estudiante
 */
export function isStudent(user: JWTPayload): boolean {
  return user.role === UserRole.STUDENT;
}

/**
 * Verificar si un usuario es tutor
 */
export function isTutor(user: JWTPayload): boolean {
  return user.role === UserRole.TUTOR;
}

/**
 * Verificar si un usuario pertenece a un instituto específico
 */
export function belongsToInstitute(user: JWTPayload, instituteId: string): boolean {
  return user.instituteId === instituteId;
}

/**
 * Crear un payload JWT básico
 */
export function createJWTPayload(
  id: string,
  email: string,
  role: UserRole,
  instituteId: string
): Omit<JWTPayload, 'iat' | 'exp'> {
  return {
    id,
    userId: id, // backward compatibility
    email,
    role,
    instituteId,
  };
}
