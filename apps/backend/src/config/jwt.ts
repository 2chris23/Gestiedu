import { UserRole } from '../utils/prisma-enums';
import * as jwt from 'jsonwebtoken';
import { config } from './environment';

// =====================================================
// Tipos para JWT de Instituto (usuarios normales)
// =====================================================

export interface JWTPayload {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  instituteId: string | null;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

// =====================================================
// Tipos para JWT de SuperAdmin
// =====================================================

export interface SuperAdminJWTPayload {
  id: string;
  email: string;
  role: 'SUPERADMIN';
  // Para impersonación: si el superadmin está accediendo como admin de un instituto
  impersonating?: {
    instituteId: string;
    adminId: string;
  };
  iat?: number;
  exp?: number;
}

export interface SuperAdminRefreshPayload {
  superAdminId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

// =====================================================
// Configuración JWT — Instituto (usuarios normales)
// =====================================================

export const jwtConfig = {
  secret: config.jwt.secret,
  expiresIn: config.jwt.expiresIn,
  refreshExpiresIn: config.jwt.refreshExpiresIn,
  algorithm: 'HS256' as const,
  issuer: 'gestion-escolar-api',
  audience: 'gestion-escolar-client',
};

// =====================================================
// Configuración JWT — SuperAdmin (separada)
// =====================================================

export const superAdminJwtConfig = {
  secret: config.superadmin.jwtSecret,
  expiresIn: '30m', // Sesión más corta para seguridad
  refreshExpiresIn: '7d',
  algorithm: 'HS256' as const,
  issuer: 'gestion-escolar-superadmin',
  audience: 'gestion-escolar-superadmin-client',
};

// =====================================================
// Funciones JWT — Instituto
// =====================================================

export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return (jwt.sign as any)(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
    algorithm: jwtConfig.algorithm,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  });
}

export function generateRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp'>): string {
  return (jwt.sign as any)(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.refreshExpiresIn,
    algorithm: jwtConfig.algorithm,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
  });
}

export function verifyAccessToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm],
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    }) as JWTPayload;
  } catch (error) {
    throw new Error('Token de acceso inválido');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm],
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    }) as RefreshTokenPayload;
  } catch (error) {
    throw new Error('Token de actualización inválido');
  }
}

export function generateTokenPair(userPayload: Omit<JWTPayload, 'iat' | 'exp'>, tokenId: string) {
  const accessToken = generateAccessToken(userPayload);
  const refreshToken = generateRefreshToken({
    userId: userPayload.userId,
    tokenId,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: jwtConfig.expiresIn,
    tokenType: 'Bearer',
  };
}

// =====================================================
// Funciones JWT — SuperAdmin
// =====================================================

export function generateSuperAdminAccessToken(payload: Omit<SuperAdminJWTPayload, 'iat' | 'exp'>): string {
  return (jwt.sign as any)(payload, superAdminJwtConfig.secret, {
    expiresIn: superAdminJwtConfig.expiresIn,
    algorithm: superAdminJwtConfig.algorithm,
    issuer: superAdminJwtConfig.issuer,
    audience: superAdminJwtConfig.audience,
  });
}

export function generateSuperAdminRefreshToken(payload: Omit<SuperAdminRefreshPayload, 'iat' | 'exp'>): string {
  return (jwt.sign as any)(payload, superAdminJwtConfig.secret, {
    expiresIn: superAdminJwtConfig.refreshExpiresIn,
    algorithm: superAdminJwtConfig.algorithm,
    issuer: superAdminJwtConfig.issuer,
    audience: superAdminJwtConfig.audience,
  });
}

export function verifySuperAdminAccessToken(token: string): SuperAdminJWTPayload {
  try {
    return jwt.verify(token, superAdminJwtConfig.secret, {
      algorithms: [superAdminJwtConfig.algorithm],
      issuer: superAdminJwtConfig.issuer,
      audience: superAdminJwtConfig.audience,
    }) as SuperAdminJWTPayload;
  } catch (error) {
    throw new Error('Token de superadmin inválido');
  }
}

export function verifySuperAdminRefreshToken(token: string): SuperAdminRefreshPayload {
  try {
    return jwt.verify(token, superAdminJwtConfig.secret, {
      algorithms: [superAdminJwtConfig.algorithm],
      issuer: superAdminJwtConfig.issuer,
      audience: superAdminJwtConfig.audience,
    }) as SuperAdminRefreshPayload;
  } catch (error) {
    throw new Error('Token de actualización de superadmin inválido');
  }
}

export function generateSuperAdminTokenPair(
  payload: Omit<SuperAdminJWTPayload, 'iat' | 'exp'>,
  tokenId: string
) {
  const accessToken = generateSuperAdminAccessToken(payload);
  const refreshToken = generateSuperAdminRefreshToken({
    superAdminId: payload.id,
    tokenId,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: superAdminJwtConfig.expiresIn,
    tokenType: 'Bearer',
  };
}

// =====================================================
// Funciones de utilidad compartidas
// =====================================================

export function decodeToken(token: string): JWTPayload | RefreshTokenPayload | SuperAdminJWTPayload | null {
  try {
    return jwt.decode(token) as any;
  } catch (error) {
    return null;
  }
}

export function getTokenExpiration(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
}

export function isTokenExpiringSoon(token: string, minutesBefore: number = 5): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true;
  }

  const now = new Date();
  const threshold = new Date(now.getTime() + (minutesBefore * 60 * 1000));

  return expiration <= threshold;
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

export default jwtConfig;
