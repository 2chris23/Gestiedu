import { PrismaClient } from '@prisma/client';

/**
 * RECONVERSIÓN MONETARIA: EL BOLÍVAR PIERDE CEROS (RECONV-01…03, 2026-10-05)
 *
 * Venezuela le quitó ceros al bolívar en 2008 (3), 2018 (5) y 2021 (6). El día
 * que vuelva a pasar, cada monto guardado en bolívares queda en el cono viejo
 * y los nuevos en el nuevo: sumar «fondos disponibles» de un liceo que cobra
 * en bolívares mezclaría los dos y daría un número absurdo.
 *
 * Esto pasa TODO lo guardado en bolívares al cono nuevo, de una vez y en una
 * sola transacción (o todo o nada), como hace el BCV con los saldos:
 *
 *   · todo monto cuya moneda es VES, ÷ factor (a dos decimales, como el BCV);
 *   · toda tasa (bolívares por dólar), ÷ factor;
 *   · todo monto en la moneda BASE cuando la base es VES, ÷ factor (la base de
 *     cada fila se deduce de la propia fila: sin tasa, su moneda; con tasa,
 *     la otra). Lo que está en dólares no se toca.
 *
 * Primero se mira (por defecto no cambia nada) y dice cuántas filas tocaría;
 * con `aplicar` lo hace. Guion: `npm run reconvertir -- --liceo=<slug>
 * --factor=1000000 [--aplicar]`. Antes, un respaldo: no hay vuelta atrás más
 * que el respaldo (dividir y multiplicar no devuelve los céntimos perdidos).
 */

export interface InformeDeReconversion {
    factor: number;
    aplicado: boolean;
    filas: Record<string, number>;
    /** Tasas que en el cono nuevo quedarían en 0,0000 (se dejan en 0,0001). */
    tasasDiminutas: number;
}

/** La base de una fila con moneda y tasa: sin tasa, su moneda; con tasa, la otra. */
const BASE = (moneda: string, tasa: string) =>
    `(CASE WHEN ${tasa} IS NULL THEN ${moneda} WHEN ${moneda} = 'VES' THEN 'USD' ELSE 'VES' END)`;
const DIV = (col: string) => `round(${col} / $1::numeric, 2)`;
const TASA = (col: string) => `CASE WHEN ${col} IS NULL THEN NULL ELSE greatest(round(${col} / $1::numeric, 4), 0.0001) END`;

export async function reconvertirBolivares(
    prisma: PrismaClient,
    factor: number,
    { aplicar = false }: { aplicar?: boolean } = {}
): Promise<InformeDeReconversion> {
    if (!Number.isFinite(factor) || factor < 10 || !Number.isInteger(Math.log10(factor))) {
        throw new Error('El factor es una potencia de 10 (1000, 100000, 1000000…)');
    }
    const f = String(factor);

    // Cada paso: [nombre, cuántas filas toca (SQL), el cambio (SQL)]. Las hijas
    // (repartos de un pago) van ANTES que su pago: su base se lee del pago sin
    // tocar. Y en cada UPDATE las columnas se calculan con los valores viejos.
    const pasos: Array<[string, string, string]> = [
        [
            'payment_allocations',
            `SELECT count(*)::int n FROM payment_allocations a JOIN payments p ON p.id = a."paymentId" WHERE ${BASE('p.currency', 'p."exchangeRate"')} = 'VES' AND $1::numeric > 0`,
            `UPDATE payment_allocations a SET "amountBase" = ${DIV('a."amountBase"')} FROM payments p WHERE p.id = a."paymentId" AND ${BASE('p.currency', 'p."exchangeRate"')} = 'VES'`,
        ],
        [
            'payments',
            `SELECT count(*)::int n FROM payments WHERE (currency = 'VES' OR "exchangeRate" IS NOT NULL) AND $1::numeric > 0`,
            `UPDATE payments SET
                amount = CASE WHEN currency = 'VES' THEN ${DIV('amount')} ELSE amount END,
                "amountBase" = CASE WHEN ${BASE('currency', '"exchangeRate"')} = 'VES' THEN ${DIV('"amountBase"')} ELSE "amountBase" END,
                "exchangeRate" = ${TASA('"exchangeRate"')}
             WHERE currency = 'VES' OR "exchangeRate" IS NOT NULL`,
        ],
        [
            'asignaciones_al_personal',
            `SELECT count(*)::int n FROM asignaciones_al_personal a JOIN pagos_al_personal p ON p.id = a."pagoId" WHERE ${BASE('p.moneda', 'p.tasa')} = 'VES' AND $1::numeric > 0`,
            `UPDATE asignaciones_al_personal a SET "montoBase" = ${DIV('a."montoBase"')} FROM pagos_al_personal p WHERE p.id = a."pagoId" AND ${BASE('p.moneda', 'p.tasa')} = 'VES'`,
        ],
        ...['pagos_al_personal', 'fondos_del_liceo', 'gastos'].map(
            (t): [string, string, string] => [
                t,
                `SELECT count(*)::int n FROM ${t} WHERE (moneda = 'VES' OR tasa IS NOT NULL) AND $1::numeric > 0`,
                `UPDATE ${t} SET
                    monto = CASE WHEN moneda = 'VES' THEN ${DIV('monto')} ELSE monto END,
                    "montoBase" = CASE WHEN ${BASE('moneda', 'tasa')} = 'VES' THEN ${DIV('"montoBase"')} ELSE "montoBase" END,
                    tasa = ${TASA('tasa')}
                 WHERE moneda = 'VES' OR tasa IS NOT NULL`,
            ]
        ),
        [
            'pagos_reportados',
            `SELECT count(*)::int n FROM pagos_reportados WHERE (moneda = 'VES' OR tasa IS NOT NULL) AND $1::numeric > 0`,
            `UPDATE pagos_reportados SET monto = CASE WHEN moneda = 'VES' THEN ${DIV('monto')} ELSE monto END, tasa = ${TASA('tasa')}
             WHERE moneda = 'VES' OR tasa IS NOT NULL`,
        ],
        // La configuración: montos en su moneda base; la mora solo si es FIJA (la de % no es dinero).
        ...['payment_settings', 'ajustes_de_pagos_del_ciclo'].map(
            (t): [string, string, string] => [
                t,
                `SELECT count(*)::int n FROM ${t} WHERE "baseCurrency" = 'VES' AND $1::numeric > 0`,
                `UPDATE ${t} SET "feeAmount" = ${DIV('"feeAmount"')}, "enrollmentAmount" = ${DIV('"enrollmentAmount"')},
                    "moraValor" = CASE WHEN "moraTipo" = 'FIJA' THEN ${DIV('"moraValor"')} ELSE "moraValor" END
                 WHERE "baseCurrency" = 'VES'`,
            ]
        ),
        // La nómina va en la moneda base del liceo.
        [
            'acuerdos_de_pago',
            `SELECT count(*)::int n FROM acuerdos_de_pago WHERE (SELECT "baseCurrency" FROM payment_settings LIMIT 1) = 'VES' AND $1::numeric > 0`,
            `UPDATE acuerdos_de_pago SET monto = ${DIV('monto')},
                "bonoVacacional" = CASE WHEN "bonoVacacional" IS NULL THEN NULL ELSE ${DIV('"bonoVacacional"')} END
             WHERE (SELECT "baseCurrency" FROM payment_settings LIMIT 1) = 'VES'`,
        ],
        [
            'ajustes_de_nomina',
            `SELECT count(*)::int n FROM ajustes_de_nomina WHERE (SELECT "baseCurrency" FROM payment_settings LIMIT 1) = 'VES' AND $1::numeric > 0`,
            `UPDATE ajustes_de_nomina SET "bonoVacacional" = ${DIV('"bonoVacacional"')}
             WHERE (SELECT "baseCurrency" FROM payment_settings LIMIT 1) = 'VES'`,
        ],
    ];

    return prisma.$transaction(
        async (tx) => {
            // Que no espere candados ajenos colgando al liceo (como MIGRA-01).
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '10s'`);
            const filas: Record<string, number> = {};
            let tasasDiminutas = 0;
            for (const t of ['payments', 'fondos_del_liceo', 'gastos', 'pagos_al_personal', 'pagos_reportados']) {
                const col = t === 'payments' ? '"exchangeRate"' : 'tasa';
                const [r] = await tx.$queryRawUnsafe<Array<{ n: number }>>(
                    `SELECT count(*)::int n FROM ${t} WHERE ${col} IS NOT NULL AND round(${col} / $1::numeric, 4) = 0`,
                    f
                );
                tasasDiminutas += r.n;
            }
            for (const [tabla, contar, cambiar] of pasos) {
                const [r] = await tx.$queryRawUnsafe<Array<{ n: number }>>(contar, f);
                filas[tabla] = r.n;
                if (aplicar && r.n > 0) await tx.$executeRawUnsafe(cambiar, f);
            }
            return { factor, aplicado: aplicar, filas, tasasDiminutas };
        },
        { timeout: 120_000 }
    );
}
