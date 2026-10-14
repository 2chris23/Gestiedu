'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowDownLeft, ArrowUp, BellRing, ArrowUpRight, CalendarClock, ChevronRight, Eye, EyeOff, FileText, GraduationCap, Loader2, PiggyBank, Rocket, ShoppingCart, Users, Wallet, X, type LucideIcon } from 'lucide-react';
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
    const [oculto, alternarOculto] = useFondosOcultos();
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
    // Este mes y el anterior, como en Rial («↑ $0.00 vs mes pasado»).
    const iActual = data.months.findIndex((m) => estadoDelMes(m.month, data.today) === 'actual');
    const delMes = iActual >= 0 ? data.months[iActual] : null;
    const anterior = iActual > 0 ? data.months[iActual - 1] : null;
    const neto = (m: { in: string | number; out: string | number } | null) => (m ? Number(m.in) - Number(m.out) : 0);
    const diferencia = neto(delMes) - neto(anterior);
    const verMes = () => delMes && setMes(delMes.month);
    const reporte = `/dashboard/pagos/reporte?mes=${delMes?.month ?? data.today.slice(0, 7)}${ciclo ? `&ciclo=${ciclo}` : ''}`;
    const tapar = (texto: string) => (oculto ? '••••' : texto);

    return (
        <div className="space-y-6">
            {/* EL SALDO, ARRIBA Y GRANDE (como «Mi balance» de Rial) */}
            <section
                aria-label="Fondos disponibles"
                className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-cabecera-claro to-transparent px-5 pb-6 pt-6 text-center"
            >
                <p className="flex items-center justify-center gap-1.5 text-sm text-gray-600">
                    <Wallet className="h-4 w-4" aria-hidden />
                    Fondos disponibles
                    <button
                        type="button"
                        onClick={alternarOculto}
                        aria-pressed={oculto}
                        aria-label={oculto ? 'Ver los fondos' : 'Ocultar los fondos'}
                        className="-my-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-600 hover:bg-white/60"
                    >
                        {oculto ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                </p>
                {/* Sin envolver: las pruebas leen el saldo como el primer párrafo que empieza por «$». */}
                <p className={cn('mt-1 text-[2.75rem] font-extrabold leading-none tracking-tight tabular-nums', disponibles < 0 ? 'text-red-700' : 'text-gray-900')}>
                    {oculto ? '$ ••••' : fmt(data.fondosDisponibles)}
                </p>
                {delMes && (
                    <p className={cn('mt-3 inline-flex items-center gap-1 text-sm font-semibold', diferencia < 0 ? 'text-red-700' : 'text-emerald-700')}>
                        {diferencia < 0 ? <ArrowDown className="h-4 w-4" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
                        {tapar(fmt(Math.abs(diferencia)))} vs mes pasado
                    </p>
                )}
                <p className="mx-auto mt-1 max-w-sm text-xs text-gray-600">Todo lo que entró menos todo lo que salió, sin lo anulado.</p>
            </section>

            {/* LO DE TODOS LOS DÍAS, EN BOTONES REDONDOS */}
            <nav aria-label="Lo de todos los días" className="grid grid-cols-4 gap-2">
                {!data.closed && (
                    <>
                        <AccionRedonda icono={PiggyBank} texto="Agregar fondos" alPulsar={() => setAgregando('DONACION')} />
                        <AccionRedonda icono={ShoppingCart} texto="Anotar un gasto" alPulsar={() => setAnotando(true)} />
                        <AccionRedonda icono={Users} texto="Pagar al personal" alPulsar={() => irA('personal')} />
                    </>
                )}
                <AccionRedonda icono={FileText} texto="Reporte" href={reporte} />
            </nav>

            {/* ENTRÓ Y SALIÓ ESTE MES */}
            {delMes && (
                <div className="grid grid-cols-2 gap-3">
                    <TarjetaDelMes tipo="entra" titulo="Entró" monto={tapar(fmt(delMes.in))} alPulsar={verMes} />
                    <TarjetaDelMes tipo="sale" titulo="Salió" monto={tapar(fmt(delMes.out))} alPulsar={verMes} />
                </div>
            )}

            {/* LOS AVISOS, EN FRANJAS SUAVES */}
            {!data.tieneSaldoInicial && !data.closed && (
                <button
                    type="button"
                    onClick={() => setAgregando('SALDO_INICIAL')}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-900 hover:bg-emerald-100"
                >
                    <Rocket className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                        <strong className="block">Poner el saldo inicial</strong>
                        <span className="text-xs">¿Con cuánto empieza el liceo? Así la cuenta sale bien.</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
                </button>
            )}
            {data.pagosPorConfirmar > 0 && !data.closed && (
                <button
                    type="button"
                    onClick={() => irA('estudiantes')}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <BellRing className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                        {data.pagosPorConfirmar === 1
                            ? 'Un representante reportó un pago: revísalo y confírmalo'
                            : `${data.pagosPorConfirmar} pagos reportados por representantes: revísalos y confírmalos`}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
                </button>
            )}

            {/* LAS CUENTAS (como «Mis balances») */}
            <section aria-labelledby="titulo-cuentas" className="space-y-3">
                <h2 id="titulo-cuentas" className="text-lg font-bold text-gray-900">
                    Las cuentas del ciclo
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <TarjetaDeCuenta
                        icono={GraduationCap}
                        tono="bg-indigo-50 text-indigo-700"
                        titulo="Te deben los estudiantes"
                        monto={tapar(fmt(data.alumnos.deben))}
                        detalle={`${data.alumnos.deudores} con cuotas vencidas · cobrado ${tapar(fmt(data.alumnos.cobrado))}`}
                        alPulsar={() => irA('estudiantes')}
                    />
                    <TarjetaDeCuenta
                        icono={Users}
                        tono="bg-amber-50 text-amber-800"
                        titulo="Falta pagar al personal"
                        monto={tapar(fmt(data.personal.porPagar))}
                        detalle={
                            <>
                                {Number(data.personal.vencido) > 0 ? (
                                    <span className="inline-flex items-center gap-1 font-semibold text-red-800">
                                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                        Atrasado {tapar(fmt(data.personal.vencido))}
                                    </span>
                                ) : (
                                    'Nada atrasado'
                                )}
                                {data.personal.sinSueldo > 0 && ` · ${data.personal.sinSueldo} sin sueldo fijado`}
                            </>
                        }
                        alPulsar={() => irA('personal')}
                    />
                    <TarjetaDeCuenta
                        icono={ShoppingCart}
                        tono="bg-red-50 text-red-700"
                        titulo="Gastos del ciclo"
                        monto={tapar(fmt(data.gastos.delCiclo))}
                        detalle={data.gastos.porCategoria.length ? data.gastos.porCategoria.slice(0, 2).map((c) => `${c.categoria} ${tapar(fmt(c.monto))}`).join(' · ') : 'Ninguno anotado'}
                        alPulsar={() => irA('gastos')}
                        className="col-span-2 sm:col-span-1"
                    />
                </div>
            </section>

            <section aria-labelledby="titulo-entra-sale" className="space-y-3">
                <h2 id="titulo-entra-sale" className="text-lg font-bold text-gray-900">
                    Mes a mes
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
                                        'flex h-full min-h-[96px] w-full flex-col gap-1 rounded-2xl p-3 text-left shadow-sm',
                                        activo ? 'bg-indigo-50 ring-2 ring-indigo-500' : estado === 'actual' ? 'bg-white ring-2 ring-indigo-300' : 'bg-white ring-1 ring-gray-200 hover:bg-gray-50'
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

/** El ojo de los fondos: como el del promedio, se recuerda en este aparato. */
const LLAVE_FONDOS_OCULTOS = 'gestiedu:fondos-ocultos';
function useFondosOcultos(): [boolean, () => void] {
    const [oculto, setOculto] = React.useState(false);
    React.useEffect(() => {
        try {
            setOculto(localStorage.getItem(LLAVE_FONDOS_OCULTOS) === '1');
        } catch {
            /* sin almacén */
        }
    }, []);
    const alternar = React.useCallback(() => {
        setOculto((v) => {
            try {
                localStorage.setItem(LLAVE_FONDOS_OCULTOS, v ? '0' : '1');
            } catch {
                /* sin almacén */
            }
            return !v;
        });
    }, []);
    return [oculto, alternar];
}

/** Un círculo con su icono y el nombre debajo (los accesos de Rial). */
function AccionRedonda({ icono: Icono, texto, alPulsar, href }: { icono: LucideIcon; texto: string; alPulsar?: () => void; href?: string }) {
    const clases = 'group flex min-h-[44px] flex-col items-center gap-1.5 rounded-2xl py-1 text-center';
    const contenido = (
        <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 transition-colors group-hover:bg-gray-50 group-active:scale-95">
                <Icono className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-xs font-medium leading-tight text-gray-800">{texto}</span>
        </>
    );
    return href ? (
        <Link href={href} className={clases}>
            {contenido}
        </Link>
    ) : (
        <button type="button" onClick={alPulsar} className={clases}>
            {contenido}
        </button>
    );
}

/** «Ingresos» y «Egresos» de Rial: lo que entró y salió este mes. */
function TarjetaDelMes({ tipo, titulo, monto, alPulsar }: { tipo: 'entra' | 'sale'; titulo: string; monto: string; alPulsar: () => void }) {
    const entra = tipo === 'entra';
    return (
        <button
            type="button"
            onClick={alPulsar}
            aria-label={`${titulo} este mes: ${monto}. Ver el mes en días`}
            className="flex flex-col gap-1.5 rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
        >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-white', entra ? 'bg-emerald-600' : 'bg-red-600')}>
                    {entra ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
                </span>
                <span className="flex-1">{titulo}</span>
                <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden />
            </span>
            <span className="text-lg font-bold tabular-nums text-gray-900">{monto}</span>
        </button>
    );
}

/** Una cuenta del ciclo (los «balances» de Rial), con «Detalles» al pie. */
function TarjetaDeCuenta({
    icono: Icono,
    tono,
    titulo,
    monto,
    detalle,
    alPulsar,
    className,
}: {
    icono: LucideIcon;
    tono: string;
    titulo: string;
    monto: string;
    detalle: React.ReactNode;
    alPulsar: () => void;
    className?: string;
}) {
    return (
        <button type="button" onClick={alPulsar} className={cn('flex flex-col rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-200 hover:bg-gray-50', className)}>
            <span className="flex items-center gap-2">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tono)}>
                    <Icono className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold leading-tight text-gray-900">{titulo}</span>
            </span>
            <span className="mt-3 text-xl font-bold tabular-nums text-gray-900">{monto}</span>
            <span className="mt-0.5 flex-1 text-xs text-gray-600">{detalle}</span>
            <span className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5 text-sm font-medium text-gray-800">
                Detalles
                <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
        </button>
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
        <section className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-gray-200 sm:p-4" aria-labelledby="mes-de-finanzas">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="mes-de-finanzas" className="text-lg font-bold text-gray-900">
                    {nombreDelMes(mes)}
                </h3>
                <div className="flex flex-wrap items-center gap-1">
                    {/* La hoja del mes para la junta o la dirección (2026-10-01). */}
                    <Link
                        href={`/dashboard/pagos/reporte?mes=${mes}${ciclo ? `&ciclo=${ciclo}` : ''}`}
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-indigo-200 px-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-50"
                    >
                        <FileText className="h-4 w-4" aria-hidden />
                        Reporte del mes
                    </Link>
                    <button type="button" onClick={alCerrar} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                        <X className="h-4 w-4" aria-hidden />
                        Cerrar el mes
                    </button>
                </div>
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
