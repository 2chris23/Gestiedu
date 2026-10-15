'use client';

import * as React from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Clock3, Loader2, Lock, Plus } from 'lucide-react';
import { PanelDeFicha, TituloDeSeccion } from '@/components/finanzas/PanelDeFicha';
import { PagoEnHistorial, PagosReportados, PlanDelAlumno } from '@/components/pagos/FichaDePagos';
import { dinero, ESTADO_DE_CUOTA, useFichaDePagos, type FichaDePagos as Ficha } from '@/hooks/usePagos';
import { abrirMovimiento } from '@/lib/abrir-movimiento';
import { porcentaje } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * LA FICHA DE UN ESTUDIANTE EN FINANZAS (2026-10-15)
 *
 * Cristian: «dentro del estudiante solo necesitamos la información: ver las
 * cuotas, lo que debe, cuánto ha pagado, el historial de pago, y un botón de
 * registrar pago que me lleve a ingreso ya colocado». Cobrar vive en un solo
 * sitio, «Nuevo movimiento», que reparte lo pagado empezando por lo más viejo
 * que se debe (`loQueCubre`): si debe 40 del mes pasado y 40 de este y paga
 * 20, se abona al mes pasado.
 *
 * El representante sigue viendo `FichaDePagos` (ahí reporta lo que pagó).
 */
export function FichaDelAlumno({ studentId, ciclo, alCerrar }: { studentId: string; ciclo: string | null; alCerrar: () => void }) {
    const { data, isLoading } = useFichaDePagos(studentId, ciclo);
    const nombre = data ? `${data.student.firstName} ${data.student.lastName}` : 'Estudiante';
    const seccion = data?.student.classroom?.name ?? '';
    const sePuedeCobrar = !!data && !data.closed && pendienteDelAno(data) > 0;

    return (
        <PanelDeFicha
            titulo={nombre}
            subtitulo={seccion}
            alCerrar={alCerrar}
            abajo={
                sePuedeCobrar ? (
                    <button
                        type="button"
                        onClick={() => abrirMovimiento({ tipo: 'entra', estudiante: { id: studentId, nombre, seccion } })}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-base font-semibold text-white active:bg-indigo-700"
                    >
                        <Plus className="h-5 w-5" aria-hidden />
                        Registrar pago
                    </button>
                ) : undefined
            }
        >
            {isLoading || !data ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-7 w-7 animate-spin text-indigo-600" aria-label="Cargando la ficha" />
                </div>
            ) : (
                <Contenido ficha={data} />
            )}
        </PanelDeFicha>
    );
}

/** Lo que falta por pagar del ciclo (vencido o no). */
function pendienteDelAno(f: Ficha) {
    return f.installments.filter((c) => c.state !== 'EXONERADA').reduce((t, c) => t + Number(c.pending), 0);
}

function Contenido({ ficha }: { ficha: Ficha }) {
    const base = ficha.currency;
    const fmt = (n: string | number) => dinero(n, base);
    const s = ficha.summary;
    const debe = s.state === 'DEBE';
    const [condiciones, setCondiciones] = React.useState(false);

    return (
        <>
            {/* Arriba, lo que importa: cuánto debe, o que está al día. */}
            <section aria-label="Cómo va" className="rounded-[24px] bg-white px-5 py-5 text-center ring-1 ring-gray-200">
                <p className="text-sm text-gray-600">{debe ? `Debe · ${s.overdueCount} ${s.overdueCount === 1 ? 'cuota' : 'cuotas'}` : 'Al día'}</p>
                <p className={cn('mt-1 text-4xl font-bold tabular-nums', debe ? 'text-red-700' : 'text-emerald-700')}>{debe ? fmt(s.owed) : fmt(s.paid)}</p>
                <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-gray-100" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${porcentaje(Number(s.paid), Number(s.total))}%` }} />
                </div>
                <p className="mt-2 text-sm text-gray-600">
                    Pagado <strong className="font-semibold text-gray-900">{fmt(s.paid)}</strong> de {fmt(s.total)}
                </p>
                {ficha.closed && (
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-600">
                        <Lock className="h-4 w-4" aria-hidden /> Ciclo cerrado: solo se mira
                    </p>
                )}
                {ficha.plan.exempt ? (
                    <p className="mt-3 text-sm font-medium text-amber-800">Exonerado: {ficha.plan.exemptReason}</p>
                ) : ficha.plan.descuentoPct > 0 || ficha.plan.hermano > 0 ? (
                    <p className="mt-3 text-sm font-medium text-emerald-800">
                        {ficha.plan.descuentoPct >= ficha.plan.hermano ? `Beca del ${ficha.plan.descuentoPct} %` : `Descuento de hermanos: ${ficha.plan.hermano} %`}
                    </p>
                ) : null}
            </section>

            <section>
                <TituloDeSeccion>Cuotas</TituloDeSeccion>
                {ficha.installments.length === 0 ? (
                    <p className="px-1 text-sm text-gray-600">Sin cuotas en este ciclo.</p>
                ) : (
                    <ul aria-label="Cuotas del ciclo" className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                        {ficha.installments.map((c) => {
                            const e = ESTADO_DE_CUOTA[c.state];
                            const Icono = c.state === 'PAGADA' ? CheckCircle2 : c.state === 'VENCIDA' ? AlertTriangle : c.state === 'EXONERADA' ? Check : Clock3;
                            const abono = Number(c.paid) > 0 && c.state !== 'PAGADA';
                            return (
                                <li key={c.key} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', e.clases)}>
                                        <Icono className="h-4 w-4" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] text-gray-900">{c.label}</span>
                                        <span className="block text-sm text-gray-600">
                                            {abono ? `Abonó ${fmt(c.paid)}` : `Vence ${c.dueDate.split('-').reverse().join('/')}`}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className="block text-[15px] font-semibold tabular-nums text-gray-900">{fmt(c.amount)}</span>
                                        <span className={cn('block text-xs font-semibold', c.state === 'VENCIDA' ? 'text-red-700' : c.state === 'PAGADA' ? 'text-emerald-700' : 'text-gray-600')}>
                                            {e.texto}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {(ficha.reports?.length ?? 0) > 0 && <PagosReportados reportes={ficha.reports!} />}

            <section>
                <TituloDeSeccion>Historial de pagos</TituloDeSeccion>
                {ficha.payments.length === 0 ? (
                    <p className="px-1 text-sm text-gray-600">Todavía no hay pagos.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                        {ficha.payments.map((p) => (
                            <PagoEnHistorial key={p.id} pago={p} base={base} editable={!ficha.closed} />
                        ))}
                    </ul>
                )}
            </section>

            {!ficha.closed && (
                <section>
                    <button
                        type="button"
                        onClick={() => setCondiciones((v) => !v)}
                        aria-expanded={condiciones}
                        className="flex min-h-[56px] w-full items-center justify-between rounded-[22px] bg-white px-4 text-left text-[15px] text-gray-900 ring-1 ring-gray-200"
                    >
                        Beca y exoneración
                        <ChevronDown className={cn('h-5 w-5 text-gray-500 transition-transform', condiciones && 'rotate-180')} aria-hidden />
                    </button>
                    {condiciones && (
                        <div className="mt-3">
                            <PlanDelAlumno ficha={ficha} />
                        </div>
                    )}
                </section>
            )}
        </>
    );
}

export default FichaDelAlumno;
