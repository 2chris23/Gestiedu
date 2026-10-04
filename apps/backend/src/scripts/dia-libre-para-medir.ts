import { Client } from 'pg';

/**
 * DÓNDE ESCRIBEN LAS MEDICIONES (2026-10-04)
 *
 * El servidor no deja guardar una clase de una fecha FUTURA (FUTURE_DATE): las
 * mediciones escribían en 2027 y cada guardado era un 400 que nadie veía. Se
 * busca un domingo PASADO del año en curso sin nada guardado ese día (y quien
 * mide lo limpia al terminar). Si el día pedido ya tiene algo, no se mide: lo
 * de verdad no se toca.
 */
export async function unDiaLibre(db: Client, pedida = ''): Promise<string> {
    const libre = async (dia: string) => {
        const r = await db.query(
            `SELECT (SELECT count(*) FROM class_sessions WHERE date::date = $1::date) + (SELECT count(*) FROM daily_attendance WHERE date::date = $1::date) AS n`,
            [dia]
        );
        return Number(r.rows[0].n) === 0;
    };
    if (pedida) {
        if (!(await libre(pedida))) throw new Error(`El ${pedida} ya tiene clases guardadas: no se mide ahí.`);
        return pedida;
    }
    const ano = (await db.query(`SELECT "startDate"::date::text AS desde FROM academic_years WHERE status = 'ACTIVE' ORDER BY "startDate" DESC LIMIT 1`)).rows[0];
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 7) % 7 || 7)); // el último domingo
    for (let i = 0; i < 30; i++, d.setUTCDate(d.getUTCDate() - 7)) {
        const dia = d.toISOString().slice(0, 10);
        if (ano && dia < ano.desde) break;
        if (await libre(dia)) return dia;
    }
    throw new Error('No hay un domingo libre en el año en curso donde escribir.');
}
