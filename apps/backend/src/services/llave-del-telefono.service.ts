import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AppErrors } from '../middleware/error.middleware';

/**
 * LA LLAVE QUE GUARDA UN TELÉFONO PARA VOLVER A ENTRAR
 *
 * ─── QUÉ ES, Y QUÉ NO ES ────────────────────────────────────────────────────
 *
 * **No es otra forma de entrar: es otra forma de VOLVER a entrar.** La primera
 * vez en un teléfono se entra siempre con el correo y la contraseña. Solo
 * después, y solo si su dueño lo pide, ese teléfono se guarda una llave para
 * no tener que escribir la contraseña cada mañana.
 *
 * La huella no entra aquí: la huella abre el cajón del teléfono —el almacén de
 * claves de Android, respaldado por el hardware— donde está guardada la llave.
 * Ni la huella ni nada parecido viaja al servidor.
 *
 * ─── POR QUÉ NO SE REUTILIZA LA LLAVE DE VOLVER A ENTRAR ────────────────────
 *
 * Porque esa se cambia en cada uso y vive en una cookie que la página no puede
 * leer (`httpOnly`), y eso está bien y no se toca. Guardar una copia obligaría
 * a enseñársela a la página cada vez que rota. Esta es una llave aparte, con
 * un solo propósito, que se puede anular sin tocar la sesión.
 *
 * ─── LO QUE LA HACE SEGURA ──────────────────────────────────────────────────
 *
 *  1. **Se guarda solo el resumen.** Quien se lleve la base de datos no se
 *     lleva ninguna llave: solo el SHA-256, y de ahí no se vuelve atrás.
 *  2. **Se cambia en cada uso.** Una copia robada deja de valer en cuanto su
 *     dueño abre la app. Y si la copia se usa primero, la del dueño deja de
 *     valer y tiene que escribir la contraseña: es la señal de que algo pasa.
 *  3. **Caduca sola** a los `DIAS_DE_VIDA` días, y se anula al cerrar sesión.
 *  4. **Es de un solo liceo**, como todo: vive en la base de ese liceo.
 */

/** Lo que dura una llave sin usarse. Después, contraseña otra vez. */
export const DIAS_DE_VIDA = 60;

/** 32 bytes al azar. No es un JWT: no dice nada, solo abre. */
const LARGO_EN_BYTES = 32;

const resumen = (llave: string) => createHash('sha256').update(llave).digest('hex');

export interface LlaveNueva {
    /** La llave en claro. Se devuelve UNA vez y no se vuelve a saber. */
    llave: string;
    expiresAt: Date;
}

/**
 * Crea una llave para este teléfono. Quien llama ya ha comprobado que hay
 * sesión: esto no valida credenciales.
 */
export async function crearLlaveDelTelefono(
    userId: string,
    etiqueta: string | null,
    db: PrismaClient
): Promise<LlaveNueva> {
    const llave = randomBytes(LARGO_EN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + DIAS_DE_VIDA * 24 * 60 * 60 * 1000);

    await db.deviceKey.create({
        data: {
            userId,
            tokenHash: resumen(llave),
            label: etiqueta?.slice(0, 120) ?? null,
            expiresAt,
        },
    });

    return { llave, expiresAt };
}

/**
 * Canjea la llave de un teléfono por una sesión.
 *
 * Devuelve a quién pertenece y **una llave nueva**: la que se acaba de usar
 * queda anulada en el mismo movimiento. Si no vale —no existe, está anulada o
 * caducó— se responde lo mismo que a una contraseña mala, sin decir cuál de
 * las tres cosas es.
 */
export async function canjearLlaveDelTelefono(
    llave: string,
    db: PrismaClient,
    etiqueta?: string | null
): Promise<{ userId: string; llaveNueva: LlaveNueva }> {
    if (!llave || typeof llave !== 'string') {
        throw AppErrors.InvalidCredentials();
    }

    const guardada = await db.deviceKey.findUnique({ where: { tokenHash: resumen(llave) } });

    if (!guardada || guardada.revokedAt || guardada.expiresAt.getTime() <= Date.now()) {
        throw AppErrors.InvalidCredentials();
    }

    // La cuenta puede haberse desactivado o archivado desde la última vez.
    const persona = await db.user.findUnique({
        where: { id: guardada.userId },
        select: { id: true, isActive: true, status: true },
    });

    if (!persona || !persona.isActive || (persona as { status?: string }).status === 'ARCHIVED') {
        // La llave de una cuenta apagada no vuelve a abrir nada.
        await db.deviceKey.update({ where: { id: guardada.id }, data: { revokedAt: new Date() } });
        throw AppErrors.InvalidCredentials();
    }

    // Se anula la usada y se entrega otra: una copia robada muere aquí.
    await db.deviceKey.update({
        where: { id: guardada.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const llaveNueva = await crearLlaveDelTelefono(guardada.userId, etiqueta ?? guardada.label, db);

    return { userId: guardada.userId, llaveNueva };
}

/**
 * Anula las llaves de esa persona. Al cerrar sesión se llama para este
 * teléfono; sin llave, para todos —que es lo que hay que poder hacer cuando se
 * pierde un móvil—.
 */
export async function anularLlavesDelTelefono(
    userId: string,
    db: PrismaClient,
    llave?: string | null
): Promise<number> {
    if (llave) {
        const { count } = await db.deviceKey.updateMany({
            where: { userId, tokenHash: resumen(llave), revokedAt: null },
            data: { revokedAt: new Date() },
        });
        return count;
    }

    const { count } = await db.deviceKey.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return count;
}
