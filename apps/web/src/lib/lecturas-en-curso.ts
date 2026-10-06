/**
 * LO QUE SE ESTÁ PIDIENDO AHORA, Y LO QUE FALTÓ SIN CONEXIÓN
 *
 * Dos cuentas pequeñas, en `window` para que las lean el recorrido invisible
 * de la precarga (desde fuera del marco) y las pruebas PRECARGA-*:
 *
 *   · `__lecturasEnCurso`: peticiones a la red y respuestas guardándose. Una
 *     pantalla terminó de bajar lo suyo cuando esto se queda en 0 un rato.
 *   · `__lecturasSinGuardar`: lecturas que, sin servidor, no estaban en el
 *     teléfono. Si la precarga hizo su trabajo, ninguna.
 */

type ConCuentas = Window & { __lecturasEnCurso?: number; __lecturasSinGuardar?: string[] };

function ventana(): ConCuentas | null {
    return typeof window === 'undefined' ? null : (window as ConCuentas);
}

export function empiezaUnaLectura(): void {
    const w = ventana();
    if (w) w.__lecturasEnCurso = (w.__lecturasEnCurso ?? 0) + 1;
}

export function terminaUnaLectura(): void {
    const w = ventana();
    if (w) w.__lecturasEnCurso = Math.max(0, (w.__lecturasEnCurso ?? 1) - 1);
}

export function apuntarFalta(clave: string): void {
    const w = ventana();
    if (!w) return;
    const lista = (w.__lecturasSinGuardar ??= []);
    if (lista.length < 200 && !lista.includes(clave)) lista.push(clave);
}

/** Cuántas hay en curso en otra ventana (el marco del recorrido). */
export function enCursoEn(w: Window | null | undefined): number {
    return (w as ConCuentas | null | undefined)?.__lecturasEnCurso ?? 0;
}
