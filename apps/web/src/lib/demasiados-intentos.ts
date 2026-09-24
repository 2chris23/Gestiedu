/**
 * «DEMASIADOS INTENTOS», DICHO PARA EL LICEO
 *
 * Cuando se intenta entrar muchas veces seguidas, el servidor de datos frena
 * con un 429. Su respuesta trae `error: 'Too Many Requests'` —el nombre del
 * código, en inglés— y `/api/auth/login` pasaba `error` antes que `message`.
 * En la pantalla de entrar salía «Too Many Requests» encima del correo (visto
 * en APAGADO-01 después de una tanda completa de e2e).
 *
 * Aquí se escribe el aviso en español, con la espera que dice el servidor en
 * `Retry-After`. Sin ella, o si no se entiende, se pide un minuto: es la
 * ventana del contador de entradas del servidor (`userRateLimit`, 60 s).
 *
 * El frenazo en sí no se toca: lo decide el servidor de datos.
 */

/**
 * Cuántos segundos hay que esperar según `Retry-After`.
 *
 * HTTP permite dos formas: un número de segundos (`60`) o una fecha
 * (`Wed, 24 Sep 2026 10:00:00 GMT`). El servidor de datos manda la primera; la
 * segunda puede llegar de un repartidor puesto delante.
 */
export function segundosDeEspera(retryAfter: string | null | undefined, ahora = Date.now()): number | null {
    const valor = retryAfter?.trim();
    if (!valor) return null;

    if (/^\d+$/.test(valor)) {
        const segundos = Number(valor);
        return segundos > 0 ? segundos : null;
    }

    const cuando = Date.parse(valor);
    if (Number.isNaN(cuando)) return null;
    const segundos = Math.ceil((cuando - ahora) / 1000);
    return segundos > 0 ? segundos : null;
}

/**
 * El aviso que ve quien intenta entrar.
 *
 * Se redondea hacia arriba: mejor esperar unos segundos de más que volver a
 * probar antes de tiempo y toparse otra vez con el mismo aviso.
 */
export function avisoDeDemasiadosIntentos(segundos: number | null): string {
    let espera = 'un minuto';
    if (segundos && segundos > 0) {
        if (segundos < 60) {
            espera = segundos === 1 ? 'un segundo' : `${segundos} segundos`;
        } else {
            const minutos = Math.ceil(segundos / 60);
            espera = minutos === 1 ? 'un minuto' : `${minutos} minutos`;
        }
    }
    return `Demasiados intentos. Espera ${espera} y vuelve a probar.`;
}
