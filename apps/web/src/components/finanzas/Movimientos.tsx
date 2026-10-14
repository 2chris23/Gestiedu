'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { useMesDeFinanzas } from '@/hooks/useFinanzas';
import { useMesDePagos } from '@/hooks/usePagos';
import { nombreDelMes } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * LOS MOVIMIENTOS (2026-10-14)
 *
 * Cristian: «quita eso de mes a mes y coloca movimientos, ahí se registran ya
 * sea los ingresos o egresos», con los movimientos de su banco de muestra.
 * Una lista, la más reciente arriba: cada cuota cobrada, cada fondo, cada
 * gasto y cada pago al personal, con su fecha y su monto en verde (+) o rojo
 * (−). Arriba, el mes con sus flechas (como «Ingresos» de Rial) y el reporte
 * de ese mes para imprimir. Lo anulado no sale: no movió dinero.
 */

export type FiltroDeMovimientos = 'todo' | 'entra' | 'sale';

interface Movimiento {
    id: string;
    fecha: string;
    entra: boolean;
    titulo: string;
    detalle: string;
    monto: string;
}

const conRecibo = (n: number) => `recibo Nº ${String(n).padStart(6, '0')}`;
const fechaCorta = (f: string) => f.split('-').reverse().join('/');

export function Movimientos({
    ciclo,
    meses,
    mesInicial,
    filtro,
    alFiltrar,
    fmt,
}: {
    ciclo: string | null;
    /** Los meses del ciclo, en orden («2026-09»…). */
    meses: string[];
    mesInicial: string;
    filtro: FiltroDeMovimientos;
    alFiltrar: (f: FiltroDeMovimientos) => void;
    fmt: (n: string | number) => string;
}) {
    const [mes, setMes] = React.useState(mesInicial);
    React.useEffect(() => setMes(mesInicial), [mesInicial]);
    const { data: f, isLoading: cargandoF } = useMesDeFinanzas(ciclo, mes);
    const { data: p, isLoading: cargandoP } = useMesDePagos(ciclo, mes);
    const i = meses.indexOf(mes);

    const todos: Movimiento[] = [];
    for (const d of p?.days ?? []) {
        for (const x of d.payments) {
            todos.push({ id: `c-${x.id}`, fecha: d.date, entra: true, titulo: `Cuota de ${x.student.nombre}`, detalle: conRecibo(x.receiptNumber), monto: x.amount });
        }
    }
    for (const d of f?.days ?? []) {
        for (const x of d.fondos) {
            const titulo = x.descripcion ?? (x.concepto === 'SALDO_INICIAL' ? 'Saldo inicial' : x.concepto === 'DONACION' ? 'Donación' : 'Otro ingreso');
            todos.push({ id: `f-${x.id}`, fecha: d.date, entra: true, titulo, detalle: 'Fondo', monto: x.monto });
        }
        for (const x of d.gastos) todos.push({ id: `g-${x.id}`, fecha: d.date, entra: false, titulo: x.concepto, detalle: `Gasto · ${x.categoria}`, monto: x.monto });
        for (const x of d.pagados) todos.push({ id: `p-${x.id}`, fecha: d.date, entra: false, titulo: `Pago a ${x.persona}`, detalle: `Personal · ${conRecibo(x.numero)}`, monto: x.monto });
    }
    // Lo más reciente arriba, como en el banco.
    todos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const lista = todos.filter((m) => filtro === 'todo' || (filtro === 'entra') === m.entra);
    const cargando = cargandoF || cargandoP;

    return (
        <section id="movimientos" aria-labelledby="titulo-movimientos" className="scroll-mt-24 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h2 id="titulo-movimientos" className="text-lg font-bold text-gray-900">
                    Movimientos
                </h2>
                <Link
                    href={`/dashboard/pagos/reporte?mes=${mes}${ciclo ? `&ciclo=${ciclo}` : ''}`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                    <FileText className="h-4 w-4" aria-hidden />
                    Reporte del mes
                </Link>
            </div>

            {/* El mes, con sus flechas (como «Ingresos» de Rial). */}
            <div className="flex items-center justify-between rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-200">
                <button
                    type="button"
                    onClick={() => i > 0 && setMes(meses[i - 1])}
                    disabled={i <= 0}
                    aria-label="Mes anterior"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100 disabled:opacity-30"
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <span className="text-sm font-semibold text-gray-900" aria-live="polite">
                    {nombreDelMes(mes)}
                </span>
                <button
                    type="button"
                    onClick={() => i < meses.length - 1 && setMes(meses[i + 1])}
                    disabled={i < 0 || i >= meses.length - 1}
                    aria-label="Mes siguiente"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100 disabled:opacity-30"
                >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
            </div>

            <div className="flex gap-2" role="group" aria-label="Qué movimientos ver">
                {(
                    [
                        ['todo', 'Todos'],
                        ['entra', 'Entradas'],
                        ['sale', 'Salidas'],
                    ] as const
                ).map(([id, texto]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => alFiltrar(id)}
                        aria-pressed={filtro === id}
                        className={cn(
                            'min-h-[44px] rounded-full px-4 text-sm font-semibold',
                            filtro === id ? 'bg-gray-900 text-white' : 'bg-white text-gray-800 ring-1 ring-gray-200 hover:bg-gray-50'
                        )}
                    >
                        {texto}
                    </button>
                ))}
            </div>

            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-200">
                {cargando ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando los movimientos" />
                    </div>
                ) : lista.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-gray-600">
                        {filtro === 'entra' ? 'No entró dinero' : filtro === 'sale' ? 'No salió dinero' : 'Sin movimientos'} en {nombreDelMes(mes).toLowerCase()}.
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100" aria-label={`Movimientos de ${nombreDelMes(mes)}`}>
                        {lista.map((m) => (
                            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                                <span
                                    className={cn(
                                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                        m.entra ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                    )}
                                >
                                    {m.entra ? <ArrowUp className="h-5 w-5" aria-hidden /> : <ArrowDown className="h-5 w-5" aria-hidden />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-gray-900">{m.titulo}</span>
                                    <span className="block truncate text-xs text-gray-600">
                                        {fechaCorta(m.fecha)} · {m.detalle}
                                    </span>
                                </span>
                                <span className={cn('shrink-0 text-sm font-bold tabular-nums', m.entra ? 'text-emerald-700' : 'text-red-700')}>
                                    <span className="sr-only">{m.entra ? 'Entró' : 'Salió'} </span>
                                    {m.entra ? '+' : '−'} {fmt(m.monto)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

export default Movimientos;
