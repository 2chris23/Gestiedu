import { platformPrisma as prisma } from '../config/database';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
    generateSuperAdminTokenPair,
    verifySuperAdminRefreshToken
} from '../config/jwt';
import { logger } from '../utils/logger';

let resumenListo: Promise<string> | null = null;
/** Un resumen bcrypt que no abre nada, a 12 vueltas como los de verdad. */
function resumenDeMentira(): Promise<string> {
    if (!resumenListo) resumenListo = bcrypt.hash(randomBytes(24).toString('hex'), 12);
    return resumenListo;
}

export class SuperAdminAuthService {
    /**
     * Login del SuperAdmin
     */
    async login(email: string, password: string) {
        const superAdmin = await prisma.superAdmin.findUnique({
            where: { email }
        });

        // La contraseña, siempre y primero (sin cuenta, contra un resumen de
        // mentira): ni el reloj ni «desactivada» dicen qué correos existen.
        const isValidPassword = await bcrypt.compare(password, superAdmin?.password ?? (await resumenDeMentira()));
        if (!superAdmin || !isValidPassword) {
            throw { statusCode: 401, message: 'Credenciales inválidas' };
        }

        if (!superAdmin.isActive) {
            throw { statusCode: 403, message: 'Cuenta de SuperAdmin desactivada' };
        }

        // Generar token pair
        const tokenId = crypto.randomUUID();
        const tokens = generateSuperAdminTokenPair(
            {
                id: superAdmin.id,
                email: superAdmin.email,
                role: 'SUPERADMIN'
            },
            tokenId
        );

        // Guardar refresh token en DB
        await prisma.superAdminRefreshToken.create({
            data: {
                token: tokens.refreshToken,
                superAdminId: superAdmin.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
            }
        });

        // Actualizar lastLogin
        await prisma.superAdmin.update({
            where: { id: superAdmin.id },
            data: { lastLogin: new Date() }
        });

        logger.info('SuperAdmin login exitoso', { email: superAdmin.email });

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            user: {
                id: superAdmin.id,
                email: superAdmin.email,
                name: superAdmin.name,
                role: 'SUPERADMIN' as const
            }
        };
    }

    /**
     * Refresh token del SuperAdmin
     */
    async refreshToken(refreshToken: string) {
        // Verificar el refresh token JWT
        const decoded = verifySuperAdminRefreshToken(refreshToken);

        // Buscar el token en DB
        const storedToken = await prisma.superAdminRefreshToken.findUnique({
            where: { token: refreshToken },
            include: { superAdmin: true }
        });

        if (!storedToken || storedToken.expiresAt < new Date()) {
            // Limpiar token expirado si existe
            if (storedToken) {
                await prisma.superAdminRefreshToken.delete({ where: { id: storedToken.id } });
            }
            throw { statusCode: 401, message: 'Token de actualización inválido o expirado' };
        }

        // Eliminar el token usado (rotation)
        await prisma.superAdminRefreshToken.delete({ where: { id: storedToken.id } });

        // Generar nuevo token pair
        const tokenId = crypto.randomUUID();
        const tokens = generateSuperAdminTokenPair(
            {
                id: storedToken.superAdmin.id,
                email: storedToken.superAdmin.email,
                role: 'SUPERADMIN'
            },
            tokenId
        );

        // Guardar nuevo refresh token
        await prisma.superAdminRefreshToken.create({
            data: {
                token: tokens.refreshToken,
                superAdminId: storedToken.superAdmin.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
        });

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
            user: {
                id: storedToken.superAdmin.id,
                email: storedToken.superAdmin.email,
                name: storedToken.superAdmin.name,
                role: 'SUPERADMIN' as const,
            },
        };
    }

    /**
     * Logout — eliminar todos los refresh tokens del superadmin
     */
    async logout(superAdminId: string) {
        await prisma.superAdminRefreshToken.deleteMany({
            where: { superAdminId }
        });

        logger.info('SuperAdmin logout', { superAdminId });
    }

    /**
     * Obtener perfil del superadmin
     */
    async getProfile(superAdminId: string) {
        const superAdmin = await prisma.superAdmin.findUnique({
            where: { id: superAdminId },
            select: {
                id: true,
                email: true,
                name: true,
                lastLogin: true,
                createdAt: true
            }
        });

        if (!superAdmin) {
            throw { statusCode: 404, message: 'SuperAdmin no encontrado' };
        }

        return { ...superAdmin, role: 'SUPERADMIN' as const };
    }
}

export const superAdminAuthService = new SuperAdminAuthService();
