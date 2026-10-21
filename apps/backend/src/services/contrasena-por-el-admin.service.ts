import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/bcrypt';
import { validatePassword } from '../utils/password-validator';
import { authService } from './auth.service';
import { anularLlavesDelTelefono } from './llave-del-telefono.service';

/**
 * EL ADMIN LE PONE UNA CONTRASEÑA NUEVA A ALGUIEN (octubre 2026)
 *
 * Cristian: «poder cambiarle la contraseña a los usuarios por si alguien la
 * pierde, pero solo el admin». Antes el formulario de editar usuario tenía un
 * campo «contraseña» que el servidor descartaba callado (`updateUserSchema`
 * la quita): el admin creía que la había cambiado y no cambiaba nada.
 *
 * Al cambiarla, se cierran TODAS las sesiones de esa persona y se anulan las
 * llaves de la huella de sus teléfonos: si la perdió porque alguien se la
 * sacó, ese alguien sale en el acto. Su contraseña propia (con la actual) la
 * cambia cada uno en «Mi cuenta»; el admin no se la cambia a sí mismo por
 * aquí, porque aquí no se pide la actual.
 */

export class ContrasenaError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string
    ) {
        super(message);
    }
}

export async function ponerContrasenaNueva(
    db: PrismaClient,
    { usuarioId, adminId, contrasena }: { usuarioId: string; adminId: string; contrasena: string }
): Promise<{ sesionesCerradas: boolean }> {
    if (usuarioId === adminId) {
        throw new ContrasenaError(400, 'USA_MI_CUENTA', 'Tu propia contraseña se cambia en «Mi cuenta», con la actual.');
    }
    const revision = validatePassword(contrasena);
    if (!revision.valid) {
        throw new ContrasenaError(400, 'CONTRASENA_DEBIL', revision.errors.join('. '));
    }

    const usuario = await db.user.findUnique({ where: { id: usuarioId }, select: { id: true } });
    if (!usuario) throw new ContrasenaError(404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado');

    await db.user.update({ where: { id: usuarioId }, data: { password: await hashPassword(contrasena) } });

    // Fuera de todas partes: sus sesiones y la huella de sus teléfonos.
    await authService.logoutAllSessions(usuarioId, db);
    await anularLlavesDelTelefono(usuarioId, db);
    return { sesionesCerradas: true };
}
