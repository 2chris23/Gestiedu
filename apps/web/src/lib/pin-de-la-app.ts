import api from '@/lib/axios';

/**
 * EL PIN DE LA APP (teléfonos sin ningún bloqueo de pantalla)
 *
 * Si el teléfono no tiene huella, patrón, PIN ni contraseña, la pantalla de
 * bloqueo no tiene a quién preguntar. Entonces, un PIN de 4 números de la
 * app (decidido por Cristian):
 *
 *   · Lo crea la persona la primera vez. Después **solo un administrador** lo
 *     cambia o lo borra, desde el usuario de esa persona; si se le olvida, el
 *     admin lo resetea y la próxima vez crea uno nuevo.
 *   · El servidor guarda su resumen (bcrypt), nunca el PIN.
 *   · **Sin conexión también vale**: al crearlo o comprobarlo con conexión,
 *     el teléfono guarda SU propia derivación (PBKDF2, 210 000 vueltas, con
 *     sal) y compara con ella. Si el admin lo reseteó (`version`), al volver
 *     la conexión se tira y se pide de nuevo.
 *   · Intentos: a los 5 fallos, esperas que crecen; a los 10, solo queda
 *     cerrar sesión y entrar con la contraseña.
 */

export const LARGO_DEL_PIN = 4;
const VUELTAS = 210_000;
const LLAVE = 'gestiedu:pin-de-la-app';
const LLAVE_FALLOS = 'gestiedu:pin-fallos';
export const FALLOS_ANTES_DE_ESPERAR = 5;
export const FALLOS_PARA_CERRAR = 10;

interface Local {
    dueno: string;
    version: number;
    sal: string;
    derivado: string;
}

const aBase64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const deBase64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function derivar(pin: string, sal: Uint8Array): Promise<string> {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: VUELTAS }, base, 256);
    return aBase64(bits);
}

function leerLocal(dueno: string): Local | null {
    try {
        const l = JSON.parse(localStorage.getItem(LLAVE) || 'null') as Local | null;
        return l && l.dueno === dueno ? l : null;
    } catch {
        return null;
    }
}

async function guardarLocal(dueno: string, version: number, pin: string): Promise<void> {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const local: Local = { dueno, version, sal: aBase64(sal), derivado: await derivar(pin, sal) };
    try {
        localStorage.setItem(LLAVE, JSON.stringify(local));
    } catch {
        /* sin almacén: se comprobará con el servidor */
    }
}

export function olvidarElPinDelTelefono(): void {
    try {
        localStorage.removeItem(LLAVE);
        localStorage.removeItem(LLAVE_FALLOS);
    } catch {
        /* nada */
    }
}

export const esUnPinValido = (pin: string) => new RegExp(`^\\d{${LARGO_DEL_PIN}}$`).test(pin);

// ── Los intentos ───────────────────────────────────────────────────────────

interface Fallos {
    dueno: string;
    cuantos: number;
    esperarHasta: number;
}

function leerFallos(dueno: string): Fallos {
    try {
        const f = JSON.parse(localStorage.getItem(LLAVE_FALLOS) || 'null') as Fallos | null;
        if (f && f.dueno === dueno) return f;
    } catch {
        /* nada */
    }
    return { dueno, cuantos: 0, esperarHasta: 0 };
}

/** 30 s, 1 min, 2 min, 5 min, 15 min… */
export function esperaTrasFallos(cuantos: number): number {
    if (cuantos < FALLOS_ANTES_DE_ESPERAR) return 0;
    const pasos = [30, 60, 120, 300, 900];
    return pasos[Math.min(cuantos - FALLOS_ANTES_DE_ESPERAR, pasos.length - 1)] * 1000;
}

function apuntarFallo(dueno: string): Fallos {
    const f = leerFallos(dueno);
    f.cuantos += 1;
    f.esperarHasta = Date.now() + esperaTrasFallos(f.cuantos);
    try {
        localStorage.setItem(LLAVE_FALLOS, JSON.stringify(f));
    } catch {
        /* nada */
    }
    return f;
}

function borrarFallos() {
    try {
        localStorage.removeItem(LLAVE_FALLOS);
    } catch {
        /* nada */
    }
}

export function comoVanLosFallos(dueno: string): { cuantos: number; esperarHasta: number; bloqueado: boolean } {
    const f = leerFallos(dueno);
    return { cuantos: f.cuantos, esperarHasta: f.esperarHasta, bloqueado: f.cuantos >= FALLOS_PARA_CERRAR };
}

// ── Lo que hace la pantalla ────────────────────────────────────────────────

export type QueToca = 'comprobar' | 'crear' | 'necesita-conexion';

/** ¿Hay que pedir el PIN, crearlo, o hace falta conexión para saberlo? */
export async function queToca(dueno: string): Promise<QueToca> {
    const local = leerLocal(dueno);
    try {
        const { data } = await api.get('/auth/pin');
        // Un admin lo reseteó o lo cambió: lo de este teléfono ya no vale.
        if (local && (!data?.tienePin || data.version !== local.version)) olvidarElPinDelTelefono();
        return data?.tienePin ? 'comprobar' : 'crear';
    } catch {
        return local ? 'comprobar' : 'necesita-conexion';
    }
}

export type ResultadoDelPin = 'ok' | 'mal' | 'esperar' | 'bloqueado' | 'sin-conexion' | 'ya-tiene';

/** Comprueba el PIN: con lo de este teléfono si lo hay; si no, con el servidor (y lo guarda). */
export async function comprobarElPin(dueno: string, pin: string): Promise<ResultadoDelPin> {
    const fallos = leerFallos(dueno);
    if (fallos.cuantos >= FALLOS_PARA_CERRAR) return 'bloqueado';
    if (Date.now() < fallos.esperarHasta) return 'esperar';

    const local = leerLocal(dueno);
    if (local) {
        if ((await derivar(pin, deBase64(local.sal))) === local.derivado) {
            borrarFallos();
            return 'ok';
        }
        const f = apuntarFallo(dueno);
        return f.cuantos >= FALLOS_PARA_CERRAR ? 'bloqueado' : 'mal';
    }
    try {
        const { data } = await api.post('/auth/pin/comprobar', { pin });
        if (data?.ok) {
            await guardarLocal(dueno, Number(data.version) || 0, pin);
            borrarFallos();
            return 'ok';
        }
        const f = apuntarFallo(dueno);
        return f.cuantos >= FALLOS_PARA_CERRAR ? 'bloqueado' : 'mal';
    } catch (e) {
        const estado = (e as { response?: { status?: number } })?.response?.status;
        if (estado === 423) return 'bloqueado';
        if (estado === 401 || estado === 400) {
            const f = apuntarFallo(dueno);
            return f.cuantos >= FALLOS_PARA_CERRAR ? 'bloqueado' : 'mal';
        }
        return 'sin-conexion';
    }
}

/** La primera vez: se crea (solo si no tenía) y se guarda en este teléfono. */
export async function crearElPin(dueno: string, pin: string): Promise<ResultadoDelPin> {
    if (!esUnPinValido(pin)) return 'mal';
    try {
        const { data } = await api.post('/auth/pin', { pin });
        await guardarLocal(dueno, Number(data?.version) || 0, pin);
        borrarFallos();
        return 'ok';
    } catch (e) {
        const estado = (e as { response?: { status?: number } })?.response?.status;
        if (estado === 409) return 'ya-tiene';
        return 'sin-conexion';
    }
}
