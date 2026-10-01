'use client';

import * as React from 'react';
import { AlertTriangle, CalendarClock, Coins, Loader2, X } from 'lucide-react';
import { DIAS_DE_LA_SEMANA, nombreDelMes, rejillaDelMes } from '@/lib/calendario-del-ciclo';
import { useMesDePagos, type DiaDePagos } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * UN MES EN DÍAS (2026-10-01)
 *
 * Lo que se abre al tocar un mes del calendario del ciclo: cada día con lo que
 * vence (reloj) y lo que se cobró (monedas). Al tocar un día, debajo, quién
 * tiene cuota ese día y quién pagó. Y al final, todos los que deben de ese mes.
 *
 * En el teléfono cada día es un botón de 44 px; las marcas llevan número, no
 * solo color.
 */

export interface DeudorDelMes {
    id: string;
    nombre: string;
    seccion: string;
}

export function MesEnDias({
    ciclo,
    mes,
    dinero,
    deudores,
    alAbrirAlumno,
    alCerrar,
}: {
    ciclo: string | null;
    mes: string;
    dinero: (n: number | string) => string;
    /** Quienes tienen una cuota de este mes vencida (del resumen del ciclo). */
    deudores: DeudorDelMes[];
    alAbrirAlumno: (id: string) => void;
    alCerrar: () => void;
}) {
    const { data, isLoading } = useMesDePagos(ciclo, mes);
    const porDia = React.useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
    const [dia, setDia] = React.useState<string | null>(null);
    React.useEffect(() => setDia(null), [mes]);
    const hoy = data?.today ?? '';
    const elegido = dia ? porDia.get(dia) : undefined;

    return (
        <section className="rounded-2xl border border-indigo-200 bg-white p-3 sm:p-4" aria-labelledby="mes-en-dias">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h3 id="mes-en-dias" className="text-lg font-bold text-gray-900">
                    {nombreDelMes(mes)}
                </h3>
                <button
                    type="button"
                    onClick={alCerrar}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                    <X className="h-4 w-4" aria-hidden />
                    Cerrar el mes
                </button>
            </div>

            <p className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5 text-amber-700" aria-hidden /> vencen cuotas
                </span>
                <span className="inline-flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-emerald-700" aria-hidden /> se cobró
                </span>
            </p>

            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando el mes" />
                </div>
            ) : (
                <div role="grid" aria-label={`Días de ${nombreDelMes(mes)}`} className="max-w-2xl">
                    <div className="grid grid-cols-7 gap-1" role="row">
                        {DIAS_DE_LA_SEMANA.map((d) => (
                            <span key={d} role="columnheader" className="py-1 text-center text-xs font-semibold text-gray-600">
                                {d}
                            </span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {rejillaDelMes(mes).map((fecha, i) => {
                            if (!fecha) return <span key={`h${i}`} aria-hidden />;
                            const d = porDia.get(fecha);
                            const vence = d?.due ?? 0;
                            const cobros = d?.payments.length ?? 0;
                            const esHoy = fecha === hoy;
                            return (
                                <button
                                    key={fecha}
                                    type="button"
                                    role="gridcell"
                                    onClick={() => setDia(fecha === dia ? null : fecha)}
                                    aria-pressed={fecha === dia}
                                    aria-label={`${Number(fecha.slice(8))}${vence ? `, vencen ${vence} cuotas` : ''}${cobros ? `, ${cobros} pagos` : ''}`}
                                    className={cn(
                                        'flex min-h-[52px] flex-col items-center justify-start gap-0.5 rounded-xl border px-0.5 pt-1 text-sm',
                                        fecha === dia ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-gray-50',
                                        esHoy && fecha !== dia && 'border-indigo-300'
                                    )}
                                >
                                    <span className={cn('font-semibold tabular-nums', esHoy ? 'text-indigo-700' : 'text-gray-900')}>{Number(fecha.slice(8))}</span>
                                    {vence > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-800">
                                            <CalendarClock className="h-3 w-3" aria-hidden />
                                            {vence}
                                        </span>
                                    )}
                                    {cobros > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-800">
                                            <Coins className="h-3 w-3" aria-hidden />
                                            {cobros}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {dia && <DetalleDelDia fecha={dia} d={elegido} dinero={dinero} alAbrirAlumno={alAbrirAlumno} />}

            <div className="mt-4 border-t border-gray-100 pt-3">
                <h4 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                    <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
                    {deudores.length ? `Deben de ${nombreDelMes(mes).toLowerCase()}: ${deudores.length}` : `Nadie debe de ${nombreDelMes(mes).toLowerCase()}`}
                </h4>
                {deudores.length > 0 && (
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                        {deudores.map((a) => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => alAbrirAlumno(a.id)}
                                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm hover:bg-gray-50"
                                >
                                    <span className="min-w-0 break-words font-medium text-gray-900">{a.nombre}</span>
                                    <span className="shrink-0 text-xs text-gray-600">{a.seccion}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function DetalleDelDia({
    fecha,
    d,
    dinero,
    alAbrirAlumno,
}: {
    fecha: string;
    d: DiaDePagos | undefined;
    dinero: (n: number | string) => string;
    alAbrirAlumno: (id: string) => void;
}) {
    const titulo = fecha.split('-').reverse().join('/');
    if (!d || (!d.due && !d.payments.length)) {
        return <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{titulo}: no vence nada y no se cobró nada.</p>;
    }
    return (
        <div className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3" aria-live="polite">
            <p className="text-sm font-bold text-gray-900">{titulo}</p>
            {d.due > 0 && (
                <div>
                    <p className="text-sm text-gray-800">
                        Vencen <strong>{d.due}</strong> {d.due === 1 ? 'cuota' : 'cuotas'}
                        {Number(d.pendingOfDue) > 0 ? <> · falta <strong>{dinero(d.pendingOfDue)}</strong></> : ' · todas pagadas'}
                    </p>
                    {d.debtors.length > 0 && (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                            {d.debtors.slice(0, 40).map((a) => (
                                <li key={a.id}>
                                    <button
                                        type="button"
                                        onClick={() => alAbrirAlumno(a.id)}
                                        className="min-h-[44px] rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-100"
                                    >
                                        {a.nombre} · {dinero(a.falta)}
                                    </button>
                                </li>
                            ))}
                            {d.debtors.length > 40 && <li className="self-center text-xs text-gray-600">y {d.debtors.length - 40} más</li>}
                        </ul>
                    )}
                </div>
            )}
            {d.payments.length > 0 && (
                <div>
                    <p className="text-sm text-gray-800">
                        Se cobró <strong>{dinero(d.collected)}</strong> en {d.payments.length} {d.payments.length === 1 ? 'pago' : 'pagos'}
                    </p>
                    <ul className="mt-1 divide-y divide-gray-200 rounded-xl bg-white">
                        {d.payments.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => alAbrirAlumno(p.student.id)}
                                    className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-gray-50"
                                >
                                    <span className="min-w-0 break-words text-gray-900">{p.student.nombre}</span>
                                    <span className="shrink-0 text-xs text-gray-600">
                                        {p.method} · <strong className="text-gray-900">{dinero(p.amount)}</strong> · Nº {String(p.receiptNumber).padStart(6, '0')}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default MesEnDias;
