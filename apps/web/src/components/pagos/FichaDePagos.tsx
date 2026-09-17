'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Download, FileText, Loader2, Receipt, Save } from 'lucide-react';
import {
    dinero,
    errorDe,
    ESTADO_DE_CUOTA,
    ESTADO_DEL_ALUMNO,
    FichaDePagos as Ficha,
    Moneda,
    PagoRegistrado,
    useAnularPago,
    useGuardarPlanDePago,
    useRegistrarPago,
} from '@/hooks/usePagos';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { descargarComprobante } from '@/lib/comprobante-de-pago';
import { cn } from '@/lib/utils';

/**
 * LA FICHA DE PAGOS DE UN ESTUDIANTE
 *
 * `editable` = el admin: registra pagos, exonera y anula. Sin `editable` = el
 * representante: ve lo mismo y descarga sus comprobantes, nada más. El servidor
 * lo exige igual; esto solo evita enseñar botones que responderían 403.
 */

const campo = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const fechaCorta = (ymd: string) => ymd.split('-').reverse().join('/');
const aCent = (v: string | number) => Math.round(Number(v) * 100);

export function FichaDePagos({ ficha, editable }: { ficha: Ficha; editable: boolean }) {
    const base = ficha.currency;
    const estado = ESTADO_DEL_ALUMNO[ficha.summary.state];
    const [elegidas, setElegidas] = React.useState<Set<string>>(new Set());
    const pendientes = ficha.installments.filter((c) => aCent(c.pending) > 0 && c.state !== 'EXONERADA');

    React.useEffect(() => setElegidas(new Set()), [ficha.student.id]);

    const alternar = (key: string) =>
        setElegidas((s) => {
            const n = new Set(s);
            n.has(key) ? n.delete(key) : n.add(key);
            return n;
        });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <span className={cn('rounded-full border px-3 py-1 text-sm font-semibold', estado.clases)}>
                    {estado.texto}
                    {ficha.summary.state === 'DEBE' && ` · ${ficha.summary.overdueCount} ${ficha.summary.overdueCount === 1 ? 'cuota' : 'cuotas'}`}
                </span>
                <span className="text-sm text-gray-700">
                    Pagado <strong className="text-gray-900">{dinero(ficha.summary.paid, base)}</strong> de {dinero(ficha.summary.total, base)}
                </span>
                {ficha.summary.state === 'DEBE' && (
                    <span className="text-sm text-red-800">
                        Debe <strong>{dinero(ficha.summary.owed, base)}</strong>
                    </span>
                )}
            </div>

            {ficha.plan.exempt && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Exonerado: {ficha.plan.exemptReason}
                </p>
            )}

            <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Cuotas</h3>
                    {editable && pendientes.length > 0 && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setElegidas(new Set(pendientes.filter((c) => c.state === 'VENCIDA').map((c) => c.key)))}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                            >
                                Las vencidas
                            </button>
                            <button
                                type="button"
                                onClick={() => setElegidas(new Set(pendientes.map((c) => c.key)))}
                                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                            >
                                Todo el año
                            </button>
                        </div>
                    )}
                </div>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {ficha.installments.map((c) => {
                        const e = ESTADO_DE_CUOTA[c.state];
                        const sePuede = editable && aCent(c.pending) > 0 && c.state !== 'EXONERADA';
                        return (
                            <li key={c.key}>
                                <label className={cn('flex items-center gap-3 px-3 py-2.5', sePuede ? 'cursor-pointer hover:bg-gray-50' : '')}>
                                    {editable && (
                                        <input
                                            type="checkbox"
                                            disabled={!sePuede}
                                            checked={elegidas.has(c.key)}
                                            onChange={() => alternar(c.key)}
                                            className="h-4 w-4 accent-indigo-600 disabled:opacity-40"
                                            aria-label={`Elegir ${c.label}`}
                                        />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-gray-900">{c.label}</span>
                                        <span className="block text-xs text-gray-600">Vence {fechaCorta(c.dueDate)}</span>
                                    </span>
                                    <span className="text-right text-sm">
                                        <span className="block font-semibold text-gray-900">{dinero(c.amount, base)}</span>
                                        {c.state === 'ABONADA' || (c.state === 'VENCIDA' && aCent(c.paid) > 0) ? (
                                            <span className="block text-xs text-gray-600">Abonó {dinero(c.paid, base)}</span>
                                        ) : null}
                                    </span>
                                    <span className={cn('w-20 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-semibold', e.clases)}>{e.texto}</span>
                                </label>
                            </li>
                        );
                    })}
                    {ficha.installments.length === 0 && <li className="px-3 py-4 text-sm text-gray-600">Sin cuotas configuradas.</li>}
                </ul>
            </section>

            {editable && elegidas.size > 0 && (
                <RegistrarPago ficha={ficha} elegidas={[...elegidas]} alTerminar={() => setElegidas(new Set())} />
            )}

            <section>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">Historial de pagos</h3>
                {ficha.payments.length === 0 ? (
                    <p className="text-sm text-gray-600">Todavía no hay pagos registrados.</p>
                ) : (
                    <ul className="space-y-2">
                        {ficha.payments.map((p) => (
                            <PagoEnHistorial key={p.id} pago={p} base={base} editable={editable} />
                        ))}
                    </ul>
                )}
            </section>

            {editable && <PlanDelAlumno ficha={ficha} />}
        </div>
    );
}

function RegistrarPago({ ficha, elegidas, alTerminar }: { ficha: Ficha; elegidas: string[]; alTerminar: () => void }) {
    const hoy = useSchoolToday();
    const base = ficha.currency;
    const registrar = useRegistrarPago(ficha.student.id);
    const monedas: Moneda[] = ficha.acceptedCurrencies === 'BOTH' ? ['USD', 'VES'] : [ficha.acceptedCurrencies];
    const pendienteCent = ficha.installments.filter((c) => elegidas.includes(c.key)).reduce((s, c) => s + aCent(c.pending), 0);

    const [moneda, setMoneda] = React.useState<Moneda>(base);
    const [tasa, setTasa] = React.useState('');
    const [monto, setMonto] = React.useState((pendienteCent / 100).toFixed(2));
    const [metodo, setMetodo] = React.useState(ficha.methods?.[0] ?? '');
    const [referencia, setReferencia] = React.useState('');
    const [fecha, setFecha] = React.useState(hoy);
    const [problema, setProblema] = React.useState<string | null>(null);

    // Al cambiar las cuotas, la moneda o la tasa, el monto propuesto es lo que falta.
    React.useEffect(() => {
        const t = Number(tasa);
        if (moneda === base) setMonto((pendienteCent / 100).toFixed(2));
        else if (t > 0) setMonto(((base === 'USD' ? pendienteCent * t : pendienteCent / t) / 100).toFixed(2));
        else setMonto('');
    }, [pendienteCent, moneda, tasa, base]);
    React.useEffect(() => setFecha(hoy), [hoy]);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        setProblema(null);
        try {
            const pago = await registrar.mutateAsync({
                installmentKeys: elegidas,
                amount: monto,
                currency: moneda,
                exchangeRate: moneda === base ? null : tasa,
                method: metodo,
                reference: referencia || null,
                paidAt: fecha,
            });
            toast.success(`Pago registrado · comprobante Nº ${String(pago.receiptNumber).padStart(6, '0')}`, {
                action: { label: 'Descargar', onClick: () => descargarComprobante(pago.id, 'png') },
            });
            alTerminar();
        } catch (err) {
            setProblema(errorDe(err, 'No se pudo registrar el pago'));
        }
    };

    return (
        <form onSubmit={enviar} className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <p className="text-sm text-gray-800">
                {elegidas.length} {elegidas.length === 1 ? 'cuota elegida' : 'cuotas elegidas'} · falta <strong>{dinero(pendienteCent / 100, base)}</strong>
            </p>

            {monedas.length > 1 && (
                <div className="flex gap-2" role="radiogroup" aria-label="Moneda del pago">
                    {monedas.map((m) => (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={moneda === m}
                            onClick={() => setMoneda(m)}
                            className={cn('rounded-lg border px-3 py-1.5 text-sm font-semibold', moneda === m ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800')}
                        >
                            {m === 'USD' ? 'Dólares' : 'Bolívares'}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                {moneda !== base && (
                    <label className="text-sm font-medium text-gray-800">
                        Tasa (Bs por $1)
                        <input required type="number" min="0.0001" step="0.0001" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={campo} />
                    </label>
                )}
                <label className="text-sm font-medium text-gray-800">
                    Monto ({moneda === 'USD' ? '$' : 'Bs'})
                    <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={campo} />
                    <span className="mt-1 block text-xs text-gray-600">Si es menor, queda como abono.</span>
                </label>
                <label className="text-sm font-medium text-gray-800">
                    Fecha del pago
                    <input required type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                </label>
                <label className="text-sm font-medium text-gray-800">
                    Referencia (opcional)
                    <input maxLength={60} value={referencia} onChange={(e) => setReferencia(e.target.value)} className={campo} />
                </label>
            </div>

            <div>
                <span className="text-sm font-medium text-gray-800">Método</span>
                <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Método de pago">
                    {(ficha.methods ?? []).map((m) => (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={metodo === m}
                            onClick={() => setMetodo(m)}
                            className={cn('rounded-lg border px-3 py-1.5 text-sm', metodo === m ? 'border-indigo-600 bg-indigo-600 font-semibold text-white' : 'border-gray-300 bg-white text-gray-800')}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            {problema && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {problema}
                </p>
            )}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={registrar.isPending || !metodo || !monto}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    {registrar.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Registrar pago
                </button>
            </div>
        </form>
    );
}

function PagoEnHistorial({ pago, base, editable }: { pago: PagoRegistrado; base: Moneda; editable: boolean }) {
    const anular = useAnularPago();
    const [anulando, setAnulando] = React.useState(false);
    const [motivo, setMotivo] = React.useState('');
    const [bajando, setBajando] = React.useState<null | 'png' | 'pdf'>(null);
    const anulado = Boolean(pago.annulledAt);

    const bajar = async (f: 'png' | 'pdf') => {
        setBajando(f);
        try {
            await descargarComprobante(pago.id, f);
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo generar el comprobante'));
        } finally {
            setBajando(null);
        }
    };

    const confirmarAnulacion = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await anular.mutateAsync({ paymentId: pago.id, reason: motivo });
            toast.success('Pago anulado');
            setAnulando(false);
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo anular'));
        }
    };

    return (
        <li className={cn('rounded-xl border px-3 py-2.5', anulado ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white')}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Receipt size={16} className="text-gray-500" aria-hidden="true" />
                <span className={cn('text-sm font-semibold', anulado ? 'text-gray-500 line-through' : 'text-gray-900')}>
                    {dinero(pago.amount, pago.currency)}
                    {pago.currency !== base && <span className="font-normal text-gray-600"> ({dinero(pago.amountBase, base)})</span>}
                </span>
                <span className="text-sm text-gray-700">
                    {fechaCorta(pago.paidAt)} · {pago.method}
                    {pago.reference ? ` · Ref. ${pago.reference}` : ''}
                </span>
                <span className="text-xs text-gray-600">Nº {String(pago.receiptNumber).padStart(6, '0')}</span>
                {anulado && <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">Anulado: {pago.annulReason}</span>}
                <span className="ml-auto flex gap-1">
                    <button type="button" onClick={() => bajar('png')} disabled={!!bajando} aria-label="Comprobante en imagen" title="Comprobante en imagen" className="rounded-lg p-2 text-gray-700 hover:bg-gray-100">
                        {bajando === 'png' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                    <button type="button" onClick={() => bajar('pdf')} disabled={!!bajando} aria-label="Comprobante en PDF" title="Comprobante en PDF" className="rounded-lg p-2 text-gray-700 hover:bg-gray-100">
                        {bajando === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    </button>
                    {editable && !anulado && (
                        <button type="button" onClick={() => setAnulando((v) => !v)} aria-label="Anular pago" title="Anular pago" className="rounded-lg p-2 text-red-700 hover:bg-red-50">
                            <Ban size={16} />
                        </button>
                    )}
                </span>
            </div>
            <p className="mt-1 text-xs text-gray-600">{pago.allocations.map((a) => `${a.label} (${dinero(a.amount, base)})`).join(' · ')}</p>
            {anulando && (
                <form onSubmit={confirmarAnulacion} className="mt-2 flex flex-wrap gap-2">
                    <input
                        autoFocus
                        required
                        minLength={3}
                        maxLength={200}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo de la anulación"
                        className={cn(campo, 'mt-0 flex-1')}
                    />
                    <button type="submit" disabled={anular.isPending} className="rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                        Anular
                    </button>
                </form>
            )}
        </li>
    );
}

function PlanDelAlumno({ ficha }: { ficha: Ficha }) {
    const guardar = useGuardarPlanDePago(ficha.student.id);
    const [dia, setDia] = React.useState<string>(ficha.plan.dueDay?.toString() ?? '');
    const [exento, setExento] = React.useState(ficha.plan.exempt);
    const [motivo, setMotivo] = React.useState(ficha.plan.exemptReason ?? '');

    React.useEffect(() => {
        setDia(ficha.plan.dueDay?.toString() ?? '');
        setExento(ficha.plan.exempt);
        setMotivo(ficha.plan.exemptReason ?? '');
    }, [ficha.plan.dueDay, ficha.plan.exempt, ficha.plan.exemptReason]);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await guardar.mutateAsync({ dueDay: dia ? Number(dia) : null, exempt: exento, exemptReason: exento ? motivo : null });
            toast.success('Guardado');
        } catch (err) {
            toast.error(errorDe(err, 'No se pudo guardar'));
        }
    };

    return (
        <form onSubmit={enviar} className="space-y-3 rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Condiciones del estudiante</h3>
            {ficha.dueMode === 'PER_STUDENT' && (
                <label className="block text-sm font-medium text-gray-800">
                    Su día de pago (1–28)
                    <input type="number" min={1} max={28} value={dia} onChange={(e) => setDia(e.target.value)} placeholder="El del liceo" className={cn(campo, 'max-w-[10rem]')} />
                </label>
            )}
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={exento} onChange={(e) => setExento(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                Exonerado o becado
            </label>
            {exento && (
                <input required minLength={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej.: hijo de docente)" className={campo} />
            )}
            <div className="flex justify-end">
                <button type="submit" disabled={guardar.isPending} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">
                    {guardar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Guardar condiciones
                </button>
            </div>
        </form>
    );
}
