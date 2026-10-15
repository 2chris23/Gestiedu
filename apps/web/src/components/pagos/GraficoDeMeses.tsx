'use client';

import * as React from 'react';
import { estadoDelMes, mesCorto, nombreDelMes, porcentaje } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * LOS MESES, COMO UN GRÁFICO (2026-10-15)
 *
 * Primero fueron doce tarjetas con texto; luego un carril de pastillas que se
 * arrastraba de lado. Cristian: «más profesional y atractivo». Ahora, los doce
 * meses de un vistazo, sin arrastrar (dos filas de seis, para que cada mes
 * mida lo que un dedo): cada barra es lo que se esperaba cobrar ese mes, en
 * verde lo cobrado y en rojo lo que se quedó sin cobrar de los meses ya
 * vencidos (ámbar el de ahora; los que vienen, grises). El mes en curso lleva
 * su punto; el elegido, su fondo. En palabras, en la etiqueta del lector.
 */

export interface MesDelGrafico {
    /** AAAA-MM */
    mes: string;
    esperado: number;
    cobrado: number;
    deben: number;
}

export function GraficoDeMeses({
    meses,
    hoy,
    elegido,
    alElegir,
}: {
    meses: MesDelGrafico[];
    hoy: string;
    elegido: string | null;
    alElegir: (mes: string) => void;
}) {
    return (
        <div className="rounded-[24px] bg-white p-2 ring-1 ring-gray-200">
        <ol className="grid grid-cols-6 gap-1" aria-label="Los meses del ciclo">
            {meses.map((m) => {
                const estado = estadoDelMes(m.mes, hoy);
                const pct = m.esperado > 0 ? porcentaje(m.cobrado, m.esperado) : 0;
                const activo = elegido === m.mes;
                const futuro = estado === 'futuro';
                return (
                    <li key={m.mes}>
                        <button
                            type="button"
                            onClick={() => alElegir(m.mes)}
                            aria-pressed={activo}
                            aria-label={`${nombreDelMes(m.mes)}: ${m.esperado > 0 ? `${pct} % cobrado` : 'sin cuotas'}${m.deben ? `, ${m.deben} deben` : ''}`}
                            className={cn(
                                'flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 pb-2 pt-1.5 transition-colors',
                                activo ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'active:bg-gray-50'
                            )}
                        >
                            {/* La barra entera es lo que se esperaba del mes: verde lo cobrado y,
                                en los meses que ya vencieron, rojo lo que falta (ámbar el de ahora). */}
                            <span className={cn('relative flex h-16 w-4 flex-col-reverse overflow-hidden rounded-full', futuro ? 'bg-gray-100' : 'bg-gray-100')} aria-hidden>
                                <span className="w-full bg-emerald-500" style={{ height: `${Math.min(100, pct)}%` }} />
                                {!futuro && m.esperado > 0 && (
                                    <span className={cn('w-full', estado === 'actual' ? 'bg-amber-400' : 'bg-red-500')} style={{ height: `${100 - Math.min(100, pct)}%` }} />
                                )}
                            </span>
                            <span
                                className={cn(
                                    'text-xs',
                                    estado === 'actual' ? 'font-bold text-indigo-700' : futuro ? 'text-gray-500' : 'font-medium text-gray-800',
                                    activo && 'font-bold text-indigo-800'
                                )}
                            >
                                {mesCorto(m.mes)}
                            </span>
                            <span className={cn('-mt-1 h-1 w-1 rounded-full', estado === 'actual' ? 'bg-indigo-600' : 'bg-transparent')} aria-hidden />
                        </button>
                    </li>
                );
            })}
        </ol>
        <p className="flex justify-center gap-4 pb-1 pt-2 text-xs text-gray-600" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Cobrado</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Sin cobrar</span>
        </p>
        </div>
    );
}

export default GraficoDeMeses;
