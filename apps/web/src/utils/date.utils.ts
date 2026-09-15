/**
 * Fechas de calendario en el cliente.
 *
 * Una fecha "YYYY-MM-DD" que manda o recibe el servidor representa un DÍA y se
 * guarda como medianoche UTC. "Hoy" en el navegador, en cambio, es la fecha
 * LOCAL del usuario. `toISOString()` devuelve la fecha UTC: en Venezuela
 * (UTC-4), a partir de las 8 de la noche ya es "mañana" en UTC, así que
 * `new Date().toISOString().split('T')[0]` daba el día siguiente — Clase en Vivo
 * abría la sesión de mañana y las clases de hoy salían como históricas.
 *
 * Regla: para "hoy" o para cualquier fecha construida en hora local, usar
 * `toLocalYMD`. `toISOString()` solo es correcto sobre fechas que ya vienen
 * en UTC (las que devuelve el servidor).
 */
export function toLocalYMD(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
