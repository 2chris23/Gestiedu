import { logger } from './logger';

/**
 * QUE NO SE MUERA EN SILENCIO
 *
 * Esto es de Node, no del liceo: desde Node 15, **una sola promesa rechazada sin
 * `catch` mata el proceso entero**.
 *
 * No es hipotético. En cuanto se puso este manejador, lo primero que atrapó
 * fueron 22 promesas rechazadas seguidas bajo carga, todas del mismo sitio: el
 * aviso por socket a todo el liceo, agotando su tiempo contra Redis. Sin esto,
 * **cada una de las 22 habría bastado para tirar el servidor**.
 *
 * Dicho de otro modo: una llamada de fondo que falla —un aviso que no se pudo
 * enviar, una consulta que se quedó sin conexión— se llevaba por delante a las
 * 15.000 personas conectadas. Y sin dejar dicho qué pasó.
 *
 * Aquí se cierran las dos puertas:
 *
 * ─── PROMESA RECHAZADA: se anota y se sigue ──────────────────────────────────
 *
 * No se cierra el servidor. Una tarea de fondo que falla es un problema; tirar a
 * todo el liceo por eso es un problema mucho mayor. Queda anotado con detalle
 * para poder arreglarlo, y las clases siguen.
 *
 * ─── EXCEPCIÓN NO CAPTURADA: se anota y se cierra ────────────────────────────
 *
 * Aquí sí se cierra, y es a propósito: tras una excepción que nadie atrapó, el
 * estado del proceso puede estar a medias, y seguir sirviendo desde ahí es cómo
 * se guardan datos corruptos. Vale más cerrar y volver a arrancar limpio.
 *
 * **Eso obliga a que en el servidor haya alguien que lo levante de nuevo**
 * (pm2, systemd o Docker con reinicio automático). Sin eso, el liceo se queda
 * abajo hasta que alguien lo note. Está en `docs/DESPLIEGUE.md`.
 */

function describir(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return { mensaje: error.message, tipo: error.name, pila: error.stack };
    }
    try {
        return { mensaje: JSON.stringify(error) };
    } catch {
        return { mensaje: String(error) };
    }
}

/** Cuántas promesas rechazadas van, para que se note si es un goteo constante. */
let promesasRechazadas = 0;

export function queNoSeMueraEnSilencio(alCerrar?: () => void): void {
    process.on('unhandledRejection', (motivo: unknown) => {
        promesasRechazadas++;
        logger.error('Promesa rechazada sin atrapar — el servidor SIGUE en pie', {
            ...describir(motivo),
            vanAsi: promesasRechazadas,
        });
    });

    process.on('uncaughtException', (error: Error) => {
        logger.error('Excepción no atrapada — el servidor se cierra para arrancar limpio', {
            ...describir(error),
            promesasRechazadasAntes: promesasRechazadas,
        });

        try {
            alCerrar?.();
        } catch {
            // Si hasta el cierre falla, no hay nada más que hacer: lo importante
            // (el motivo) ya quedó anotado arriba.
        }

        // Se da un respiro para que la línea de registro llegue al disco antes de
        // irse. Sin esto, el motivo se pierde y volvemos a tener una muerte muda.
        setTimeout(() => process.exit(1), 250).unref();
    });
}
