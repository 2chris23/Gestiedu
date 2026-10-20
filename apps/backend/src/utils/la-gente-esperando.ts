/**
 * ¿HAY GENTE ESPERANDO? (19-oct-2026)
 *
 * Lo que el servidor hace de fondo (armar los cubos de la descarga, la
 * pasada de la noche) tiene que apartarse cuando hay personas pidiendo cosas:
 * medido con 200 personas en 50 liceos recién creados, el armado de sus cubos
 * en el mismo proceso llevó el p95 de TODAS las pantallas a 6,7 s (hasta
 * `GET /time`, que no hace nada). Mirar solo el retraso del bucle no basta: el
 * trabajo de fondo también gasta conexiones de la base, que no se ven ahí.
 *
 * El medidor de rutas (`plugins/medidor-de-rutas.ts`) apunta aquí cada
 * petición de gente (no las internas de la descarga) al entrar y al salir.
 */
let enCurso = 0;

export function entraUnaPeticion(): void {
    enCurso++;
}

export function saleUnaPeticion(): void {
    enCurso = Math.max(0, enCurso - 1);
}

/** Peticiones de gente que este proceso está atendiendo ahora mismo. */
export function peticionesEnCurso(): number {
    return enCurso;
}
