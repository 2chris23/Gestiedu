'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { estadoDelMes, mesCorto, nombreDelMes, porcentaje } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * LOS 12 MESES DEL CICLO (2026-10-01)
 *
 * Cristian pidió ver los pagos «más como un calendario». Arriba, una baldosa
 * por mes: lo cobrado frente a lo que se esperaba (barra y porcentaje, con
 * palabras: el color solo no dice nada a quien no distingue el rojo del
 * verde) y cuántos deben. Al tocar una, se abre ese mes en días (`MesEnDias`).
 *
 * En el teléfono son 3 por fila; en la tableta, 4; en el ordenador, 6.
 */

export interface MesEnElCalendario {
    /** AAAA-MM */
    mes: string;
    /** Lo que se esperaba cobrar ese mes, en la moneda del liceo. */
    esperado: number;
    cobrado: number;
    /** Cuántos estudiantes tienen una cuota de ese mes vencida. */
    deben: number;
}

export function CalendarioDelCiclo({
    meses,
    hoy,
    elegido,
    alElegir,
    dinero,
}: {
    meses: MesEnElCalendario[];
    hoy: string;
    elegido: string | null;
    alElegir: (mes: string) => void;
    /** Cómo se escribe una cantidad (`$1.234,50`). */
    dinero: (n: number) => string;
}) {
    return (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6" aria-label="Los meses del ciclo escolar">
            {meses.map((m) => {
                const estado = estadoDelMes(m.mes, hoy);
                const pct = porcentaje(m.cobrado, m.esperado);
                const activo = elegido === m.mes;
                const sinCuotas = m.esperado <= 0;
                return (
                    <li key={m.mes}>
                        <button
                            type="button"
                            onClick={() => alElegir(m.mes)}
                            aria-pressed={activo}
                            aria-label={`${nombreDelMes(m.mes)}: ${sinCuotas ? 'sin cuotas' : `${pct} % cobrado`}${m.deben ? `, ${m.deben} deben` : ''}. Ver el mes en días`}
                            className={cn(
                                'flex h-full min-h-[96px] w-full flex-col gap-1.5 rounded-2xl border p-2.5 text-left transition-colors',
                                activo
                                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                                    : estado === 'actual'
                                      ? 'border-indigo-300 bg-white hover:bg-indigo-50/50'
                                      : 'border-gray-200 bg-white hover:bg-gray-50',
                                estado === 'futuro' && !activo && 'bg-gray-50/70'
                            )}
                        >
                            <span className="flex items-baseline justify-between gap-1">
                                <span className="text-base font-bold text-gray-900">{mesCorto(m.mes)}</span>
                                <span className="text-xs text-gray-600">{estado === 'actual' ? 'Este mes' : m.mes.slice(0, 4)}</span>
                            </span>
                            {sinCuotas ? (
                                <span className="text-xs text-gray-600">Sin cuotas</span>
                            ) : (
                                <>
                                    <span className="h-2 w-full overflow-hidden rounded-full bg-gray-200" aria-hidden>
                                        <span
                                            className={cn('block h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : estado === 'futuro' ? 'bg-gray-400' : 'bg-indigo-500')}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </span>
                                    <span className="text-xs font-semibold tabular-nums text-gray-800">
                                        {pct} % <span className="font-normal text-gray-600">de {dinero(m.esperado)}</span>
                                    </span>
                                    {m.deben > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-800">
                                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                            {m.deben} {m.deben === 1 ? 'debe' : 'deben'}
                                        </span>
                                    ) : pct >= 100 ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                            Todo cobrado
                                        </span>
                                    ) : estado === 'pasado' ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                            Nadie debe
                                        </span>
                                    ) : (
                                        // El mes en curso todavía no ha vencido (o tiene gracia): no es
                                        // «nadie debe», es «falta por cobrar».
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                                            <Clock3 className="h-3.5 w-3.5" aria-hidden />
                                            {estado === 'actual' ? 'Por cobrar' : 'Por venir'}
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

export default CalendarioDelCiclo;
