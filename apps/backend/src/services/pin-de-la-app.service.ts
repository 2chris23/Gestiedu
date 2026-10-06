import { comparePassword, hashPassword } from '../utils/bcrypt';

/**
 * EL PIN DE LA APP (octubre 2026, decidido por Cristian)
 *
 * Si el teléfono no tiene huella, patrón, PIN ni contraseña, la pantalla de
 * bloqueo de la app pide un PIN de 4 números (`apps/web/src/lib/pin-de-la-app.ts`).
 *
 *   · Lo crea la persona **una sola vez** (si no tiene).
 *   · Después **solo un admin** lo cambia o lo resetea, desde el usuario de
 *     esa persona. Nadie cambia el suyo: si se le olvida, el admin lo resetea.
 *   · Se guarda su resumen (bcrypt). `pinVersion` sube con cada cambio del
 *     admin: el teléfono compara y tira su copia.
 *   · A los 10 fallos seguidos comprobándolo aquí, queda trabado (423) hasta
 *     que un admin lo resetee.
 *
 * Es la puerta de la casa, no la caja fuerte: con PIN o sin él, cada
 * petición pasa por los guardianes de siempre.
 */

export const LARGO_DEL_PIN = 4;
export const FALLOS_PARA_TRABAR = 10;

export class PinError extends Error {
    constructor(
        public statusCode: number,
        public code: string,
        message: string
    ) {
        super(message);
    }
}

export const esUnPinValido = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin);

export async function estadoDelPin(prisma: any, userId: string) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { pinDeLaApp: true, pinVersion: true, pinFallos: true } });
    if (!u) throw new PinError(404, 'USUARIO_NO_EXISTE', 'Ese usuario no existe');
    return { tienePin: Boolean(u.pinDeLaApp), version: u.pinVersion, trabado: u.pinFallos >= FALLOS_PARA_TRABAR };
}

/** La persona crea el suyo, solo si no tiene (cambiarlo es cosa del admin). */
export async function crearMiPin(prisma: any, userId: string, pin: unknown) {
    if (!esUnPinValido(pin)) throw new PinError(400, 'PIN_INVALIDO', 'El PIN son 4 números');
    const resumen = await hashPassword(pin);
    // Solo si sigue sin PIN: dos teléfonos a la vez no se pisan.
    const r = await prisma.user.updateMany({ where: { id: userId, pinDeLaApp: null }, data: { pinDeLaApp: resumen, pinFallos: 0 } });
    if (r.count === 0) throw new PinError(409, 'YA_TIENE_PIN', 'Ya tienes un PIN. Solo un administrador puede cambiarlo.');
    return estadoDelPin(prisma, userId);
}

/** Comprueba el PIN (con conexión): cuenta los fallos y traba a los 10. */
export async function comprobarMiPin(prisma: any, userId: string, pin: unknown) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { pinDeLaApp: true, pinVersion: true, pinFallos: true } });
    if (!u?.pinDeLaApp) throw new PinError(404, 'SIN_PIN', 'No tienes PIN todavía');
    if (u.pinFallos >= FALLOS_PARA_TRABAR) throw new PinError(423, 'PIN_TRABADO', 'Demasiados intentos. Pide a un administrador que lo resetee.');
    const ok = esUnPinValido(pin) && (await comparePassword(pin, u.pinDeLaApp));
    if (!ok) {
        await prisma.user.update({ where: { id: userId }, data: { pinFallos: { increment: 1 } } });
        return { ok: false, version: u.pinVersion };
    }
    if (u.pinFallos) await prisma.user.update({ where: { id: userId }, data: { pinFallos: 0 } });
    return { ok: true, version: u.pinVersion };
}

/** El admin lo pone (cambiar) o lo quita (`pin` null: resetear). Sube la versión. */
export async function ponerElPinDe(prisma: any, userId: string, pin: unknown | null) {
    if (pin !== null && !esUnPinValido(pin)) throw new PinError(400, 'PIN_INVALIDO', 'El PIN son 4 números');
    const existe = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existe) throw new PinError(404, 'USUARIO_NO_EXISTE', 'Ese usuario no existe');
    await prisma.user.update({
        where: { id: userId },
        data: { pinDeLaApp: pin === null ? null : await hashPassword(pin as string), pinVersion: { increment: 1 }, pinFallos: 0 },
    });
    return estadoDelPin(prisma, userId);
}
