'use client';

import * as React from 'react';
import { AlertTriangle, ArrowDownLeft, BellRing, ArrowUpRight, CalendarClock, Loader2, PiggyBank, ShoppingCart, Users, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormularioDeFondo, FormularioDeGasto, type Monedas } from '@/components/finanzas/GastosYFondos';
import { useGastos, useMesDeFinanzas, useResumenDeFinanzas } from '@/hooks/useFinanzas';
import { dinero, useMesDePagos } from '@/hooks/usePagos';
import { DIAS_DE_LA_SEMANA, estadoDelMes, mesCorto, nombreDelMes, rejillaDelMes } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * EL RESUMEN DE LAS FINANZAS (2026-10-01)
 *
 * Lo primero que se ve: cuánto tiene el liceo ahora (todo lo que entró menos
 * todo lo que salió), cuánto le deben los estudiantes, cuánto falta pagar al
 * personal y lo gastado. Debajo, el ciclo mes a mes con lo que entró y lo que
 * salió; al tocar un mes, sus días. Y tres botones grandes para lo de todos los
 * días: agregar fondos, anotar un gasto, pagar al personal.
 */

export function VistaResumen({
    ciclo,
    monedas,
    irA,
}: {
    ciclo: string | null;
    monedas: Monedas;
    irA: (vista: 'estudiantes' | 'personal' | 'gastos') => void;
}) {
    const { data, isLoading } = useResumenDeFinanzas(true, ciclo);
    const { data: g } = useGastos(true, ciclo);
    const [mes, setMes] = React.useState<string | null>(null);
    const [agregando, setAgregando] = React.useState<null | 'SALDO_INICIAL' | 'DONACION'>(null);
    const [anotando, setAnotando] = React.useState(false);
    React.useEffect(() => setMes(null), [ciclo]);

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando las finanzas" />
            </div>
        );
    }
    const fmt = (n: string | number) => dinero(n, data.currency);
    const disponibles = Number(data.fondosDisponibles);

    return (
        <div className="space-y-6">
            {data.pagosPorConfirmar > 0 && !data.closed && (
                <button
                    type="button"
                    onClick={() => irA('estudiantes')}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100"
                >
                    <BellRing className="h-5 w-5 shrink-0" aria-hidden />
                    {data.pagosPorConfirmar === 1
                        ? 'Un representante reportó un pago: revísalo y confírmalo'
                        : `${data.pagosPorConfirmar} pagos reportados por representantes: revísalos y confírmalos`}
                </button>
            )}
            <section className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                <div className={cn('rounded-2xl border p-5', disponibles < 0 ? 'border-red-200 bg-red-50' : 'border-indigo-200 bg-indigo-50')}>
                    <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-indigo-900">
                        <Wallet className="h-4 w-4" aria-hidden />
                        Fondos disponibles
                    </p>
                    <p className={cn('mt-1 text-3xl font-bold tabular-nums', disponibles < 0 ? 'text-red-800' : 'text-gray-900')}>{fmt(data.fondosDisponibles)}</p>
                    <p className="mt-1 text-sm text-gray-700">Todo lo que entró (cuotas y fondos) menos todo lo que salió (personal y gastos), sin lo anulado.</p>
                    {!data.tieneSaldoInicial && !data.closed && (
                        <div className="mt-3 rounded-xl border border-indigo-300 bg-white p-3 text-sm text-gray-800">
                            <p>
                                <strong>¿Con cuánto empieza el liceo?</strong> Si ya tenía dinero antes de usar el sistema, ponlo como saldo inicial para que la cuenta salga bien.
                            </p>
                            <Button className="mt-2" variant="contorno" onClick={() => setAgregando('SALDO_INICIAL')}>
                                Poner el saldo inicial
                            </Button>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-1 content-start gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {!data.closed && (
                        <>
                            <Button className="justify-start" onClick={() => setAgregando('DONACION')}>
                                <PiggyBank aria-hidden />
                                Agregar fondos
                            </Button>
                            <Button className="justify-start" variant="contorno" onClick={() => setAnotando(true)}>
                                <ShoppingCart aria-hidden />
                                Anotar un gasto
                            </Button>
                            <Button className="justify-start" variant="contorno" onClick={() => irA('personal')}>
                                <Users aria-hidden />
                                Pagar al personal
                            </Button>
                        </>
                    )}
                </div>
            </section>

            <dl className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => irA('estudiantes')} className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Te deben los estudiantes</dt>
                    <dd className="mt-1 text-xl font-bold text-gray-900">{fmt(data.alumnos.deben)}</dd>
                    <dd className="text-xs text-gray-700">
                        {data.alumnos.deudores} con cuotas vencidas · cobrado {fmt(data.alumnos.cobrado)}
                    </dd>
                </button>
                <button type="button" onClick={() => irA('personal')} className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Falta pagar al personal</dt>
                    <dd className="mt-1 text-xl font-bold text-gray-900">{fmt(data.personal.porPagar)}</dd>
                    <dd className="text-xs text-gray-700">
                        {Number(data.personal.vencido) > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-800">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                Atrasado {fmt(data.personal.vencido)}
                            </span>
                        ) : (
                            'Nada atrasado'
                        )}
                        {data.personal.sinSueldo > 0 && ` · ${data.personal.sinSueldo} sin sueldo fijado`}
                    </dd>
                </button>
                <button type="button" onClick={() => irA('gastos')} className="rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Gastos del ciclo</dt>
                    <dd className="mt-1 text-xl font-bold text-gray-900">{fmt(data.gastos.delCiclo)}</dd>
                    <dd className="text-xs text-gray-700">
                        {data.gastos.porCategoria.length ? data.gastos.porCategoria.slice(0, 2).map((c) => `${c.categoria} ${fmt(c.monto)}`).join(' · ') : 'Ninguno anotado'}
                    </dd>
                </button>
            </dl>

            <section aria-labelledby="titulo-entra-sale" className="space-y-3">
                <h2 id="titulo-entra-sale" className="text-lg font-bold text-gray-900">
                    Lo que entra y lo que sale, mes a mes
                </h2>
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Los meses del ciclo">
                    {data.months.map((m) => {
                        const estado = estadoDelMes(m.month, data.today);
                        const activo = mes === m.month;
                        return (
                            <li key={m.month}>
                                <button
                                    type="button"
                                    onClick={() => setMes(activo ? null : m.month)}
                                    aria-pressed={activo}
                                    aria-label={`${nombreDelMes(m.month)}: entró ${fmt(m.in)}, salió ${fmt(m.out)}. Ver el mes en días`}
                                    className={cn(
                                        'flex h-full min-h-[96px] w-full flex-col gap-1 rounded-2xl border p-3 text-left',
                                        activo ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : estado === 'actual' ? 'border-indigo-300 bg-white' : 'border-gray-200 bg-white hover:bg-gray-50'
                                    )}
                                >
                                    <span className="flex items-baseline justify-between">
                                        <span className="text-base font-bold text-gray-900">{mesCorto(m.month)}</span>
                                        <span className="text-xs text-gray-600">{estado === 'actual' ? 'Este mes' : m.month.slice(0, 4)}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-800">
                                        <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
                                        Entró <strong className="tabular-nums">{fmt(m.in)}</strong>
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs text-red-800">
                                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                                        Salió <strong className="tabular-nums">{fmt(m.out)}</strong>
                                    </span>
                                    {(Number(m.toCollect) > 0 || Number(m.toPay) > 0) && (
                                        <span className="text-xs text-gray-600">
                                            {Number(m.toCollect) > 0 && `por cobrar ${fmt(m.toCollect)}`}
                                            {Number(m.toCollect) > 0 && Number(m.toPay) > 0 && ' · '}
                                            {Number(m.toPay) > 0 && `por pagar ${fmt(m.toPay)}`}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ol>
                {mes && <MesDeFinanzas ciclo={ciclo} mes={mes} fmt={fmt} alCerrar={() => setMes(null)} />}
            </section>

            {agregando && <FormularioDeFondo abierto alCerrar={() => setAgregando(null)} monedas={monedas} conceptoInicial={agregando} />}
            <FormularioDeGasto abierto={anotando} alCerrar={() => setAnotando(false)} categorias={g?.categorias ?? ['Otro']} monedas={monedas} />
        </div>
    );
}

function MesDeFinanzas({ ciclo, mes, fmt, alCerrar }: { ciclo: string | null; mes: string; fmt: (n: string | number) => string; alCerrar: () => void }) {
    const { data: f, isLoading } = useMesDeFinanzas(ciclo, mes);
    const { data: p } = useMesDePagos(ciclo, mes);
    const [dia, setDia] = React.useState<string | null>(null);
    React.useEffect(() => setDia(null), [mes]);
    const deFinanzas = new Map((f?.days ?? []).map((d) => [d.date, d]));
    const deCobros = new Map((p?.days ?? []).map((d) => [d.date, d]));
    const hoy = f?.today ?? '';
    const elegidoF = dia ? deFinanzas.get(dia) : undefined;
    const elegidoP = dia ? deCobros.get(dia) : undefined;

    return (
        <section className="rounded-2xl border border-indigo-200 bg-white p-3 sm:p-4" aria-labelledby="mes-de-finanzas">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="mes-de-finanzas" className="text-lg font-bold text-gray-900">
                    {nombreDelMes(mes)}
                </h3>
                <button type="button" onClick={alCerrar} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                    <X className="h-4 w-4" aria-hidden />
                    Cerrar el mes
                </button>
            </div>
            <p className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
                <span className="inline-flex items-center gap-1">
                    <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-700" aria-hidden /> entró dinero
                </span>
                <span className="inline-flex items-center gap-1">
                    <ArrowUpRight className="h-3.5 w-3.5 text-red-700" aria-hidden /> salió dinero
                </span>
                <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5 text-amber-700" aria-hidden /> toca pagar al personal
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
                            const x = deFinanzas.get(fecha);
                            const c = deCobros.get(fecha);
                            const entra = (x?.fondos.length ?? 0) + (c?.payments.length ?? 0);
                            const sale = (x?.gastos.length ?? 0) + (x?.pagados.length ?? 0);
                            const toca = x?.tocaPagar.length ?? 0;
                            return (
                                <button
                                    key={fecha}
                                    type="button"
                                    role="gridcell"
                                    onClick={() => setDia(fecha === dia ? null : fecha)}
                                    aria-pressed={fecha === dia}
                                    aria-label={`${Number(fecha.slice(8))}${entra ? `, ${entra} entradas` : ''}${sale ? `, ${sale} salidas` : ''}${toca ? `, toca pagar a ${toca}` : ''}`}
                                    className={cn(
                                        'flex min-h-[52px] flex-col items-center gap-0.5 rounded-xl border px-0.5 pt-1 text-sm',
                                        fecha === dia ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-gray-50',
                                        fecha === hoy && fecha !== dia && 'border-indigo-300'
                                    )}
                                >
                                    <span className="font-semibold tabular-nums text-gray-900">{Number(fecha.slice(8))}</span>
                                    {entra > 0 && (
                                        <span className="inline-flex items-center text-xs font-semibold text-emerald-800">
                                            <ArrowDownLeft className="h-3 w-3" aria-hidden />
                                            {entra}
                                        </span>
                                    )}
                                    {sale > 0 && (
                                        <span className="inline-flex items-center text-xs font-semibold text-red-800">
                                            <ArrowUpRight className="h-3 w-3" aria-hidden />
                                            {sale}
                                        </span>
                                    )}
                                    {toca > 0 && (
                                        <span className="inline-flex items-center text-xs font-semibold text-amber-800">
                                            <CalendarClock className="h-3 w-3" aria-hidden />
                                            {toca}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {dia && (
                <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-3 text-sm" aria-live="polite">
                    <p className="font-bold text-gray-900">{dia.split('-').reverse().join('/')}</p>
                    {!elegidoF && !elegidoP?.payments.length && <p className="text-gray-700">Nada este día.</p>}
                    {(elegidoP?.payments.length ?? 0) > 0 && (
                        <p className="text-emerald-900">
                            Cuotas cobradas: <strong>{fmt(elegidoP!.collected)}</strong> ({elegidoP!.payments.length})
                        </p>
                    )}
                    {elegidoF?.fondos.map((x) => (
                        <p key={x.id} className="text-emerald-900">
                            + {fmt(x.monto)} · {x.descripcion ?? (x.concepto === 'SALDO_INICIAL' ? 'Saldo inicial' : x.concepto === 'DONACION' ? 'Donación' : 'Otro ingreso')}
                        </p>
                    ))}
                    {elegidoF?.gastos.map((x) => (
                        <p key={x.id} className="text-red-900">
                            − {fmt(x.monto)} · {x.concepto} ({x.categoria})
                        </p>
                    ))}
                    {elegidoF?.pagados.map((x) => (
                        <p key={x.id} className="text-red-900">
                            − {fmt(x.monto)} · pagado a {x.persona} (recibo Nº {String(x.numero).padStart(6, '0')})
                        </p>
                    ))}
                    {elegidoF?.tocaPagar.map((x, i) => (
                        <p key={`${x.personalId}-${i}`} className="text-amber-900">
                            Toca pagar a {x.persona}: {x.etiqueta} · falta {fmt(x.falta)}
                            {x.estado === 'VENCIDO' ? ' (atrasado)' : ''}
                        </p>
                    ))}
                </div>
            )}
        </section>
    );
}

export default VistaResumen;
