'use client';

import * as React from 'react';
import type { Moneda } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * CUÁNTO, EN QUÉ MONEDA Y A QUÉ TASA (2026-10-01)
 *
 * El mismo campo en fondos, gastos y pagos al personal: el monto, la moneda
 * (si el liceo acepta las dos) y, si no es la del liceo, la tasa del día. Debajo
 * dice en qué queda en la moneda del liceo, para que nadie tenga que sacar la
 * cuenta a mano.
 */

export const campo =
    'mt-1 w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export interface Dinero {
    monto: string;
    moneda: Moneda;
    tasa: string;
}

export function CampoDeDinero({
    valor,
    alCambiar,
    base,
    monedas,
    rotulo = 'Monto',
    ayuda,
}: {
    valor: Dinero;
    alCambiar: (d: Dinero) => void;
    base: Moneda;
    monedas: Moneda[];
    rotulo?: string;
    ayuda?: string;
}) {
    const t = Number(valor.tasa);
    const m = Number(valor.monto);
    const enBase = valor.moneda === base ? m : t > 0 ? (base === 'USD' ? m / t : m * t) : NaN;
    const fmt = (n: number, mon: Moneda) =>
        `${mon === 'USD' ? '$' : 'Bs '}${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
    return (
        <div className="space-y-3">
            {monedas.length > 1 && (
                <div className="flex gap-2" role="radiogroup" aria-label="Moneda">
                    {monedas.map((x) => (
                        <button
                            key={x}
                            type="button"
                            role="radio"
                            aria-checked={valor.moneda === x}
                            onClick={() => alCambiar({ ...valor, moneda: x })}
                            className={cn(
                                'min-h-[44px] rounded-lg border px-3 text-sm font-semibold',
                                valor.moneda === x ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800'
                            )}
                        >
                            {x === 'USD' ? 'Dólares' : 'Bolívares'}
                        </button>
                    ))}
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-800">
                    {rotulo} ({valor.moneda === 'USD' ? '$' : 'Bs'})
                    <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={valor.monto}
                        onChange={(e) => alCambiar({ ...valor, monto: e.target.value })}
                        className={campo}
                    />
                    {ayuda && <span className="mt-1 block text-xs text-gray-600">{ayuda}</span>}
                </label>
                {valor.moneda !== base && (
                    <label className="text-sm font-medium text-gray-800">
                        Tasa del día (Bs por $1)
                        <input
                            required
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            inputMode="decimal"
                            value={valor.tasa}
                            onChange={(e) => alCambiar({ ...valor, tasa: e.target.value })}
                            className={campo}
                        />
                    </label>
                )}
            </div>
            {valor.moneda !== base && Number.isFinite(enBase) && enBase > 0 && (
                <p className="text-xs text-gray-700">
                    Equivale a <strong>{fmt(enBase, base)}</strong>
                </p>
            )}
        </div>
    );
}

export default CampoDeDinero;
