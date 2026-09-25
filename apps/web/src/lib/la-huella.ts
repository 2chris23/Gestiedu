/**
 * ENTRAR CON LA HUELLA
 *
 * ─── LO QUE PASA DE VERDAD ──────────────────────────────────────────────────
 *
 * La huella **no entra al sistema**. La huella abre un cajón del propio
 * teléfono —el almacén de claves de Android, el que está respaldado por el
 * hardware— donde ese teléfono guardó una llave. Esa llave es la que se canjea
 * por una sesión, y la comprueba el servidor como comprueba todo lo demás.
 *
 * Por eso la regla de la casa se mantiene entera: **a este sistema no se entra
 * sin el correo y la contraseña**. La primera vez en un teléfono, siempre. La
 * huella es para VOLVER a entrar, y solo si su dueño lo pidió en ese teléfono.
 *
 * Ni la huella ni nada parecido sale del teléfono. El servidor no sabe que
 * existe: lo único que ve es una llave que él mismo emitió, que se cambia en
 * cada uso y que puede anular cuando quiera.
 *
 * ─── DÓNDE FUNCIONA ─────────────────────────────────────────────────────────
 *
 * Solo dentro de la app del liceo (la APK). Un navegador no tiene dónde
 * guardar algo así con la huella delante: lo que hay en un navegador se puede
 * leer sin huella ninguna, y guardar una llave ahí sería fingir seguridad. En
 * el navegador, ni se ofrece.
 */

const CAJON = 'gestiedu';

interface PluginDeHuella {
    isAvailable: () => Promise<{ isAvailable: boolean; biometryType?: number }>;
    verifyIdentity: (opciones: {
        reason?: string;
        title?: string;
        subtitle?: string;
        description?: string;
    }) => Promise<void>;
    setCredentials: (c: { username: string; password: string; server: string }) => Promise<void>;
    getCredentials: (c: { server: string }) => Promise<{ username: string; password: string }>;
    deleteCredentials: (c: { server: string }) => Promise<void>;
}

function elPlugin(): PluginDeHuella | null {
    if (typeof window === 'undefined') return null;
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
    const plugin = cap?.Plugins?.NativeBiometric as PluginDeHuella | undefined;
    return plugin?.isAvailable ? plugin : null;
}

/** El cajón es por liceo: un teléfono puede tener dos liceos y no se mezclan. */
const cajonDe = (liceo: string) => `${CAJON}:${liceo}`;

/** ¿Este teléfono tiene huella (o cara) configurada y se puede usar? */
export async function hayHuella(): Promise<boolean> {
    const plugin = elPlugin();
    if (!plugin) return false;
    try {
        const { isAvailable } = await plugin.isAvailable();
        return Boolean(isAvailable);
    } catch {
        return false;
    }
}

/** Guarda la llave de este teléfono detrás de la huella. */
export async function guardarLaLlave(liceo: string, correo: string, llave: string): Promise<boolean> {
    const plugin = elPlugin();
    if (!plugin || !liceo || !llave) return false;
    try {
        await plugin.setCredentials({ username: correo, password: llave, server: cajonDe(liceo) });
        return true;
    } catch {
        return false;
    }
}

/**
 * Pide la huella y devuelve lo guardado. `null` si no hay nada, si el teléfono
 * no la reconoce o si la persona cancela — en los tres casos se sigue como
 * siempre, con el correo y la contraseña.
 */
export async function abrirConLaHuella(liceo: string): Promise<{ correo: string; llave: string } | null> {
    const plugin = elPlugin();
    if (!plugin || !liceo) return null;

    try {
        // Primero lo que hay: si este teléfono no guardó nada, no se le pide
        // la huella a nadie para acabar diciendo que no hay nada.
        const guardado = await plugin.getCredentials({ server: cajonDe(liceo) });
        if (!guardado?.password) return null;

        await plugin.verifyIdentity({
            title: 'Entrar',
            subtitle: 'Usa tu huella para volver a entrar',
            description: 'Solo se abre en este teléfono.',
            reason: 'Volver a entrar sin escribir la contraseña',
        });

        return { correo: guardado.username, llave: guardado.password };
    } catch {
        return null;
    }
}

/** ¿Hay algo guardado en este teléfono para este liceo? */
export async function hayLlaveGuardada(liceo: string): Promise<boolean> {
    const plugin = elPlugin();
    if (!plugin || !liceo) return false;
    try {
        const guardado = await plugin.getCredentials({ server: cajonDe(liceo) });
        return Boolean(guardado?.password);
    } catch {
        return false;
    }
}

/** Lee la llave sin pedir la huella. Solo para poder anularla al salir. */
export async function laLlaveGuardada(liceo: string): Promise<string | null> {
    const plugin = elPlugin();
    if (!plugin || !liceo) return null;
    try {
        const guardado = await plugin.getCredentials({ server: cajonDe(liceo) });
        return guardado?.password || null;
    } catch {
        return null;
    }
}

/** Borra lo guardado en este teléfono. Se llama al salir y al apagar la opción. */
export async function olvidarLaLlave(liceo: string): Promise<void> {
    const plugin = elPlugin();
    if (!plugin || !liceo) return;
    try {
        await plugin.deleteCredentials({ server: cajonDe(liceo) });
    } catch {
        // Si no había nada, no hay nada que borrar.
    }
}
