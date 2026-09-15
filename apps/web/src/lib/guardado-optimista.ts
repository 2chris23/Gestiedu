/**
 * GUARDADO OPTIMISTA — SE VE AL INSTANTE, PERO NO SE PIERDE NADA
 *
 * La idea viene de donde se usa todos los días: cuando le das "me gusta" en
 * Instagram, el corazón se pone rojo **antes** de que el servidor conteste. Si
 * algo sale mal, se deshace. El usuario nunca mira un botón esperando.
 *
 * Aquí hace falta porque se midió: bajo carga, guardar tardaba segundos. Un
 * profesor pone la nota y se queda mirando la pantalla. Eso no se arregla
 * haciendo el servidor infinitamente rápido; se arregla no obligándole a
 * esperar.
 *
 * ─── DÓNDE NOS SEPARAMOS DE INSTAGRAM ────────────────────────────────────────
 *
 * Un "me gusta" que se pierde no le importa a nadie. **Una nota que se pierde,
 * sí.** Y en este proyecto ya está dicho: un botón que dice que hizo algo sin
 * haberlo hecho es peor que un aviso claro.
 *
 * Por eso aquí el optimismo tiene red:
 *
 *   1. La nota aparece al instante (optimista).
 *   2. Si el servidor confirma, se olvida el asunto.
 *   3. **Si falla, la pantalla vuelve atrás Y la nota queda guardada en el
 *      dispositivo**, con su hora y a qué actividad pertenece. No se pierde
 *      aunque se cierre el navegador o se caiga la conexión.
 *
 * Lo guardado vive en el navegador de quien lo escribió: no viaja a ningún
 * sitio ni lo ve nadie más.
 */

const LLAVE = 'gestiedu:guardados-pendientes';

export interface GuardadoPendiente {
    /** Identifica el intento para poder olvidarlo cuando se logre guardar. */
    id: string;
    /** Qué se estaba guardando, en lenguaje de la institución. */
    que: string;
    /** El cuerpo exacto que hay que reenviar. */
    carga: unknown;
    /** A dónde hay que reenviarlo. */
    ruta: string;
    /** Cuándo se intentó, para poder decírselo a la persona. */
    cuando: number;
    /** Lo que dijo el servidor, si dijo algo. */
    motivo?: string;
}

function leer(): GuardadoPendiente[] {
    if (typeof window === 'undefined') return [];
    try {
        const crudo = window.localStorage.getItem(LLAVE);
        if (!crudo) return [];
        const lista = JSON.parse(crudo);
        return Array.isArray(lista) ? lista : [];
    } catch {
        // Ventana privada, almacenamiento bloqueado, contenido corrupto… Da igual
        // el motivo: sin lista no se puede hacer nada, pero tampoco se rompe la
        // pantalla por eso.
        return [];
    }
}

function escribir(lista: GuardadoPendiente[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LLAVE, JSON.stringify(lista));
    } catch {
        // Si no se puede guardar, al menos el aviso de error ya se le dio a la
        // persona: sabe que tiene que repetirlo.
    }
}

/** Apunta un guardado que no salió, para no perderlo. */
export function recordarPendiente(p: GuardadoPendiente): void {
    const lista = leer().filter((x) => x.id !== p.id);
    lista.push(p);
    escribir(lista);
}

/** Lo borra de la lista: ya se guardó de verdad. */
export function olvidarPendiente(id: string): void {
    escribir(leer().filter((x) => x.id !== id));
}

/** Lo que quedó sin guardar, de lo más viejo a lo más nuevo. */
export function guardadosPendientes(): GuardadoPendiente[] {
    return leer().sort((a, b) => a.cuando - b.cuando);
}

export function hayPendientes(): boolean {
    return leer().length > 0;
}
