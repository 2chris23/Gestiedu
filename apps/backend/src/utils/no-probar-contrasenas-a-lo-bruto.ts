import { RedisCache } from '../config/redis';

/**
 * QUE NO SE PUEDAN PROBAR CONTRASEÑAS UNA DETRÁS DE OTRA
 *
 * El sistema exige contraseñas de 8 caracteres y las guarda con bcrypt a 12
 * vueltas. Eso protege la contraseña **si alguien se lleva la base de datos**.
 * No protege de lo otro: alguien probando contraseñas contra la pantalla de
 * entrar hasta acertar.
 *
 * Contra eso había un único guardia, el contador de peticiones, y **cuenta por
 * dirección de internet, no por cuenta**. Se probó (BRUTO-01): quince
 * contraseñas contra el mismo profesor, cada una desde una dirección distinta
 * —lo que tiene cualquiera con un móvil y el wifi de casa—, y **las quince
 * pasaron**. Ninguna frenada. Y la buena seguía entrando después.
 *
 * Esto lleva la cuenta **por cuenta**, no por dirección: da igual desde dónde
 * venga el intento.
 *
 * ─── LO QUE ESTO CUESTA, DICHO CLARO ─────────────────────────────────────────
 *
 * Quien sepa el correo de un profesor puede dejarlo fuera 15 minutos fallando
 * diez veces a propósito. Es el precio conocido de esta defensa y lo pagan
 * todos los sistemas que la tienen (Windows usa los mismos números: diez
 * intentos, quince minutos).
 *
 * Se elige pagarlo porque lo otro es peor: sin esto, quien tenga unas cuantas
 * direcciones prueba contraseñas sin límite hasta entrar, y entonces no está
 * fuera un profesor quince minutos — están dentro las notas de todo el liceo.
 *
 * El cierre **se abre solo** a los quince minutos. No hay que llamar a nadie.
 *
 * ─── POR QUÉ TAMBIÉN SE BLOQUEA LA CONTRASEÑA BUENA ──────────────────────────
 *
 * Mientras la cuenta está cerrada no entra nadie, ni con la contraseña
 * correcta. Si la correcta entrara, el cierre no serviría para nada: al que está
 * probando le bastaría con seguir hasta dar con ella. Lo vigila BRUTO-02.
 */

/** Cuántos fallos seguidos se aguantan antes de cerrar la cuenta. */
export const FALLOS_QUE_SE_AGUANTAN = 10;

/** Cuánto dura el cierre, y también la memoria de los fallos. */
export const MINUTOS_CERRADA = 15;

const SEGUNDOS = MINUTOS_CERRADA * 60;

/**
 * El nombre del contador de una cuenta.
 *
 * Lleva el liceo delante porque **el correo se puede repetir entre liceos**: sin
 * eso, fallar contra alguien del Liceo A cerraría también la cuenta de quien
 * tuviera ese correo en el Liceo B.
 *
 * El correo se normaliza (sin espacios, en minúsculas) porque si no, probar con
 * `Ana@liceo.ve` y `ana@liceo.ve` contaría como dos cuentas distintas y se
 * podrían duplicar los intentos con solo cambiar una mayúscula.
 */
function contadorDe(instituteId: string, correo: string): string {
    return `login-fallos:${instituteId}:${String(correo).trim().toLowerCase()}`;
}

export interface EstadoDeLaCuenta {
    cerrada: boolean;
    fallos: number;
    /** Cuántos intentos le quedan antes de que se cierre. */
    quedan: number;
}

/** ¿Está cerrada esta cuenta ahora mismo? */
export async function comoEstaLaCuenta(
    instituteId: string | undefined,
    correo: string | undefined
): Promise<EstadoDeLaCuenta> {
    if (!instituteId || !correo) return { cerrada: false, fallos: 0, quedan: FALLOS_QUE_SE_AGUANTAN };

    const fallos = (await RedisCache.get<number>(contadorDe(instituteId, correo))) ?? 0;
    return {
        cerrada: fallos >= FALLOS_QUE_SE_AGUANTAN,
        fallos,
        quedan: Math.max(0, FALLOS_QUE_SE_AGUANTAN - fallos),
    };
}

/**
 * Apuntar un intento fallido.
 *
 * La ventana **no** se reinicia con cada fallo: se cuenta desde el primero. Si
 * se reiniciara, quien probara contraseñas a ritmo lento mantendría la ventana
 * abierta para siempre sin llegar nunca al tope.
 */
export async function apuntarFallo(
    instituteId: string | undefined,
    correo: string | undefined
): Promise<void> {
    if (!instituteId || !correo) return;
    const clave = contadorDe(instituteId, correo);

    const antes = (await RedisCache.get<number>(clave)) ?? 0;
    // El primero pone el reloj en marcha; los siguientes solo suman, para que la
    // ventana no se renueve sola.
    if (antes === 0) await RedisCache.set(clave, 1, SEGUNDOS);
    else await RedisCache.increment(clave, 1);
}

/** Alguien entró bien: se le borra la cuenta de fallos. */
export async function olvidarFallos(
    instituteId: string | undefined,
    correo: string | undefined
): Promise<void> {
    if (!instituteId || !correo) return;
    await RedisCache.delete(contadorDe(instituteId, correo));
}

/**
 * Lo que se le responde a una cuenta cerrada.
 *
 * **No dice si la cuenta existe.** Si a una cuenta real se le respondiera
 * "cerrada" y a una inventada "credenciales incorrectas", quien esté probando
 * sabría con un solo intento qué correos son de verdad, que es la mitad del
 * trabajo. Lo vigila BRUTO-03.
 */
export function respuestaDeCuentaCerrada() {
    return {
        error: `Demasiados intentos. Vuelve a intentarlo en ${MINUTOS_CERRADA} minutos.`,
        message: `Demasiados intentos. Vuelve a intentarlo en ${MINUTOS_CERRADA} minutos.`,
        code: 'DEMASIADOS_INTENTOS',
        minutos: MINUTOS_CERRADA,
    };
}
