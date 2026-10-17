'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColumnaDelPlan, SemanaDelPlan } from './PlanPorBloques';

/**
 * EL PLAN, SEMANA A SEMANA, COMO LOS MOVIMIENTOS
 *
 * Pedido por Cristian (16-oct-2026): el plan en la pantalla no tiene que
 * parecerse al papel (para eso está «Ver completo» y «Descargar»). Cada semana
 * es una fila fina —su número en un círculo, lo que se hace y las fechas, y a
 * la derecha los puntos— y al tocarla se abre con TODO lo suyo, un dato debajo
 * de otro (como el comprobante). Lo que abarca varias semanas (el tema
 * generador, el tejido) se repite en cada una: así cada semana se lee sola.
 */

/** El valor de una columna en una semana, también si viene de una celda unida de arriba. */
export function valorEnLaSemana(semanas: SemanaDelPlan[], i: number, clave: string): string {
    for (let j = i; j >= 0; j--) {
        const v = semanas[j]?.data[clave];
        const abarca = Number(semanas[j]?.colSpan?.[clave] ?? 1) || 1;
        const tiene = v !== undefined && v !== null && String(v).trim() !== '';
        if (j === i) {
            if (tiene) return String(v);
            continue;
        }
        if (j + abarca - 1 >= i) return tiene ? String(v) : '';
    }
    return '';
}

/** «21/09/2026» → «21/09»: el año ya se sabe y la línea no se corta. */
const sinAno = (f: string) => f.replace(/\/\d{4}$/, '');

const PRINCIPALES = ['actividadEval', 'label', 'title'];

export default function PlanEnFilas({
    semanas,
    columnas,
    fechasDe,
}: {
    semanas: SemanaDelPlan[];
    columnas: ColumnaDelPlan[];
    fechasDe: (numeroDeSemana: number) => { start: string; end: string } | null;
}) {
    const [abierta, setAbierta] = React.useState<number | null>(null);

    return (
        <ul aria-label="Semanas del plan" className="divide-y divide-gray-100 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
            {semanas.map((s, i) => {
                const principal = PRINCIPALES.map((k) => valorEnLaSemana(semanas, i, k)).find((v) => v.trim() !== '') ?? '';
                const pts = Number(s.data['puntos']);
                const conPuntos = Number.isFinite(pts) && pts > 0;
                const fechas = fechasDe(s.weekNumber);
                const tipo = valorEnLaSemana(semanas, i, 'tipoEvaluacion');
                const detalle = [fechas ? `${sinAno(fechas.start)} – ${sinAno(fechas.end)}` : null, tipo || null].filter(Boolean).join(' · ');
                const estaAbierta = abierta === i;
                const datos = columnas
                    .filter((c) => c.key !== 'puntos')
                    .map((c) => {
                        const v = valorEnLaSemana(semanas, i, c.key);
                        return [c.label, c.key === 'ponderacion' && v ? `${v} %` : v] as const;
                    })
                    .filter(([, v]) => v.trim() !== '' && v.trim() !== '0');
                return (
                    <li key={s.weekNumber}>
                        <button
                            type="button"
                            onClick={() => setAbierta(estaAbierta ? null : i)}
                            aria-expanded={estaAbierta}
                            className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                        >
                            <span
                                className={cn(
                                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                    conPuntos ? 'bg-indigo-600 text-white' : principal ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'
                                )}
                            >
                                S{s.weekNumber}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={cn('block truncate text-[15px]', principal ? 'text-gray-900' : 'italic text-gray-500')}>
                                    {principal || 'Sin escribir'}
                                </span>
                                {detalle && <span className="block truncate text-sm text-gray-600">{detalle}</span>}
                            </span>
                            {conPuntos && (
                                <span className="shrink-0 text-[15px] font-semibold tabular-nums text-indigo-700">
                                    {Math.round(pts * 100) / 100} pts
                                </span>
                            )}
                            <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-400 transition-transform', estaAbierta && 'rotate-180')} aria-hidden />
                        </button>
                        {estaAbierta && (
                            <dl className="space-y-3 bg-gray-50 px-4 pb-4 pt-3">
                                {datos.length === 0 ? (
                                    <p className="text-sm text-gray-600">Esta semana no tiene nada escrito.</p>
                                ) : (
                                    datos.map(([rotulo, v]) => (
                                        <div key={rotulo}>
                                            <dt className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{rotulo}</dt>
                                            <dd className="mt-0.5 whitespace-pre-line break-words text-[15px] text-gray-900">{v}</dd>
                                        </div>
                                    ))
                                )}
                            </dl>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
