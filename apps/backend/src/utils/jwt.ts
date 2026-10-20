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
import { JWTPayload, generateAccessToken } from '../config/jwt';

// Legacy exports for backwards compatibility
export const generateToken = generateAccessToken;export type VerifyPayloadType = JWTPayload;

/**
 * Verificar si un usuario tiene un rol específico
 */
export function hasRole(user: JWTPayload, role: UserRole): boolean {
  return user.role === role;
}


/**
 * Verificar si un usuario es administrador
 */
export function isAdmin(user: JWTPayload): boolean {
  return user.role === UserRole.ADMIN;
}





