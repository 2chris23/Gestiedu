'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Download, FileText, Gift, Loader2, Palmtree, Receipt, Wallet } from 'lucide-react';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { ESTADO_DE_PAGO_AL_PERSONAL, FRECUENCIA, useMisPagos } from '@/hooks/useFinanzas';
import { dinero, errorDe, usePagosActivos } from '@/hooks/usePagos';
import { descargarReciboDelPersonal } from '@/lib/comprobante-de-pago';
import { nombreDelMes } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * MIS PAGOS (2026-10-01)
 *
 * Cristian decidió que el profesor vea lo que el liceo le paga: SOLO lo suyo
 * (el servidor no da nada de nadie más). Arriba, su próximo pago; luego su año
 * en baldosas (pagado, por pagar, atrasado, el bono) y sus recibos para bajar.
 */

const fechaCorta = (ymd: string) => ymd.split('-').reverse().join('/');

export default function MisPagosPage() {
    const { data: ajustes } = usePagosActivos();
    const activo = Boolean(ajustes?.enabled);
    const { data, isLoading } = useMisPagos(activo);
    const [bajando, setBajando] = React.useState<string | null>(null);

    const bajar = async (id: string, f: 'png' | 'pdf') => {
        setBajando(`${id}${f}`);
        try {
            await descargarReciboDelPersonal(id, f);
        } catch (e) {
            toast.error(errorDe(e, 'No se pudo generar el recibo'));
        } finally {
            setBajando(null);
        }
    };

    const cabecera = <EncabezadoDePantalla titulo="Mis pagos" descripcion="Lo que el liceo te paga en este ciclo: tu próximo pago, lo pagado y tus recibos." />;

    if (!activo || isLoading) {
        return (
            <div className="space-y-6">
                {cabecera}
                {isLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando" />
                ) : (
                    <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-700">El liceo no lleva sus pagos en el sistema.</p>
                )}
            </div>
        );
    }
    if (!data?.tiene || !data.persona) {
        return (
            <div className="space-y-6">
                {cabecera}
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
                    <Wallet className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
                    <p className="mt-2 text-sm text-gray-700">Todavía no tienes un sueldo registrado en este ciclo. Cuando el liceo lo ponga, aquí verás tus pagos y tus recibos.</p>
                </div>
            </div>
        );
    }

    const base = data.currency!;
    const fmt = (n: string | number) => dinero(n, base);
    const r = data.persona.resumen;
    const a = data.persona.acuerdo;

    return (
        <div className="space-y-6">
            {cabecera}
            <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:col-span-2">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-900">
                        <CalendarClock className="h-4 w-4" aria-hidden />
                        Tu próximo pago
                    </p>
                    {r?.proximo ? (
                        <>
                            <p className="mt-1 text-2xl font-bold text-gray-900">{fmt(r.proximo.falta)}</p>
                            <p className="text-sm text-gray-800">
                                {r.proximo.etiqueta} · el {fechaCorta(r.proximo.fecha)}
                            </p>
                        </>
                    ) : (
                        <p className="mt-1 text-lg font-bold text-emerald-800">Todo el ciclo está pagado</p>
                    )}
                    {a && (
                        <p className="mt-2 text-xs text-gray-700">
                            {FRECUENCIA[a.frecuencia]}: {fmt(a.monto)}
                            {a.frecuencia === 'QUINCENAL' ? ' cada quincena' : a.frecuencia === 'MENSUAL' ? ' al mes' : ''}
                        </p>
                    )}
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Cobrado en el ciclo</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{fmt(r?.pagado ?? 0)}</p>
                    <p className="text-xs text-gray-700">de {fmt(r?.total ?? 0)}</p>
                    {r && Number(r.vencido) > 0 && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-800">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            Atrasado {fmt(r.vencido)}
                        </p>
                    )}
                </div>
            </section>

            {data.nomina?.mesesDeVacaciones.length ? (
                <p className="flex items-center gap-2 text-sm text-gray-700">
                    <Palmtree className="h-4 w-4 text-amber-700" aria-hidden />
                    Vacaciones: {data.nomina.mesesDeVacaciones.map(nombreDelMes).join(', ')}
                </p>
            ) : null}

            <section aria-labelledby="titulo-mi-ano">
                <h2 id="titulo-mi-ano" className="mb-2 text-lg font-bold text-gray-900">
                    Tu ciclo, pago a pago
                </h2>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {(data.debidos ?? []).map((d) => {
                        const e = ESTADO_DE_PAGO_AL_PERSONAL[d.estado];
                        const Icono = d.tipo === 'BONO' ? Gift : d.estado === 'PAGADO' ? CheckCircle2 : d.estado === 'VENCIDO' ? AlertTriangle : Clock3;
                        return (
                            <li key={d.clave} className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2.5">
                                <span className="break-words text-sm font-bold leading-tight text-gray-900">{d.etiqueta}</span>
                                <span className="text-sm font-semibold tabular-nums text-gray-900">{fmt(d.monto)}</span>
                                <span className={cn('inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold', e.clases)}>
                                    <Icono className="h-3.5 w-3.5" aria-hidden />
                                    {e.texto}
                                </span>
                                <span className="text-xs text-gray-600">{d.estado === 'ABONADO' ? `Abonado ${fmt(d.pagado)}` : `El ${fechaCorta(d.fecha)}`}</span>
                            </li>
                        );
                    })}
                </ol>
            </section>

            <section aria-labelledby="titulo-recibos">
                <h2 id="titulo-recibos" className="mb-2 text-lg font-bold text-gray-900">
                    Tus recibos
                </h2>
                {(data.pagos ?? []).length === 0 ? (
                    <p className="text-sm text-gray-700">Todavía no hay pagos en este ciclo.</p>
                ) : (
                    <ul className="space-y-2">
                        {data.pagos!.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                                <Receipt size={16} className="text-gray-500" aria-hidden />
                                <span className="text-sm font-semibold text-gray-900">{fmt(p.montoBase)}</span>
                                <span className="text-sm text-gray-700">
                                    {fechaCorta(p.fecha)} · {p.metodo}
                                </span>
                                <span className="text-xs text-gray-600">{p.asignaciones.map((x) => x.etiqueta).join(', ')}</span>
                                <span className="ml-auto flex gap-1">
                                    <button type="button" onClick={() => bajar(p.id, 'png')} disabled={!!bajando} aria-label="Recibo en imagen" title="Recibo en imagen" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100">
                                        {bajando === `${p.id}png` ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    </button>
                                    <button type="button" onClick={() => bajar(p.id, 'pdf')} disabled={!!bajando} aria-label="Recibo en PDF" title="Recibo en PDF" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100">
                                        {bajando === `${p.id}pdf` ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
