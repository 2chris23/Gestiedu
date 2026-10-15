'use client';

import * as React from 'react';
import { Carril } from '@/components/ui/carril';
import { estadoDelMes, mesCorto, nombreDelMes, porcentaje } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * LOS MESES, EN UN CARRIL (2026-10-14)
 *
 * Eran doce tarjetas en cuatro filas, cada una con su barra, «0 % de
 * $17.970,00», «598 deben» y «Por venir»: media pantalla para decir poco
 * (Cristian: «entre menos texto mejor»). Ahora, una pastilla por mes, de lado:
 * el mes, un anillo con lo cobrado y, si hay vencidos, un globo rojo con
 * cuántos deben. El detalle sale al tocarlo. Empieza en el mes en curso.
 */

export interface MesEnElCarril {
    /** AAAA-MM */
    mes: string;
    esperado: number;
    cobrado: number;
    deben: number;
}

export function CarrilDeMeses({
    meses,
    hoy,
    elegido,
    alElegir,
}: {
    meses: MesEnElCarril[];
    hoy: string;
    elegido: string | null;
    alElegir: (mes: string) => void;
}) {
    const actual = Math.max(
        0,
        meses.findIndex((m) => estadoDelMes(m.mes, hoy) === 'actual')
    );
    // Que el mes en curso no quede pegado al borde: se ven los dos de antes.
    const inicio = Math.max(0, actual - 2);

    return (
        <Carril etiqueta="Los meses del ciclo" anchoDeCada="w-[76px]" hueco="gap-2" inicio={inicio} libre>
            {meses.map((m) => {
                const estado = estadoDelMes(m.mes, hoy);
                const pct = porcentaje(m.cobrado, m.esperado);
                const activo = elegido === m.mes;
                const futuro = estado === 'futuro';
                return (
                    <button
                        key={m.mes}
                        type="button"
                        onClick={() => alElegir(m.mes)}
                        aria-pressed={activo}
                        aria-label={`${nombreDelMes(m.mes)}: ${m.esperado > 0 ? `${pct} % cobrado` : 'sin cuotas'}${m.deben ? `, ${m.deben} deben` : ''}`}
                        className={cn(
                            'relative flex h-[92px] w-full flex-col items-center justify-center gap-1.5 rounded-[22px] transition-colors',
                            activo
                                ? 'bg-indigo-600 text-white'
                                : estado === 'actual'
                                  ? 'bg-white text-gray-900 ring-2 ring-indigo-500'
                                  : 'bg-white text-gray-900 ring-1 ring-gray-200',
                            futuro && !activo && 'bg-gray-50 text-gray-500'
                        )}
                    >
                        <Anillo pct={futuro || m.esperado <= 0 ? 0 : pct} claro={activo} />
                        {/* Enero lleva el año: ahí cambia. */}
                        <span className="text-sm font-semibold">
                            {mesCorto(m.mes)}
                            {m.mes.endsWith('-01') && <span className="font-normal opacity-80"> {m.mes.slice(2, 4)}</span>}
                        </span>
                        {m.deben > 0 && (
                            <span className="absolute right-1.5 top-1.5 min-w-[22px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-xs font-bold leading-none text-white">
                                {m.deben > 999 ? '999+' : m.deben}
                            </span>
                        )}
                    </button>
                );
            })}
        </Carril>
    );
}

/** Un anillo de 30 px que se llena con lo cobrado del mes. */
function Anillo({ pct, claro }: { pct: number; claro: boolean }) {
    const r = 12;
    const largo = 2 * Math.PI * r;
    return (
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="-rotate-90">
            <circle cx="15" cy="15" r={r} fill="none" strokeWidth="4" className={claro ? 'stroke-white/30' : 'stroke-gray-200'} />
            {pct > 0 && (
                <circle
                    cx="15"
                    cy="15"
                    r={r}
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(largo * Math.min(pct, 100)) / 100} ${largo}`}
                    className={claro ? 'stroke-white' : pct >= 100 ? 'stroke-emerald-500' : 'stroke-indigo-500'}
                />
            )}
        </svg>
    );
}

export default CarrilDeMeses;
