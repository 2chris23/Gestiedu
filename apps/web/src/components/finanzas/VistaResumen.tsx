'use client';

import * as React from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BellRing, ChevronRight, GraduationCap, Loader2, Rocket, ShoppingCart, Users, type LucideIcon } from 'lucide-react';
import { useFondosOcultos } from '@/components/finanzas/CabezaDeFinanzas';
import { Movimientos, type FiltroDeMovimientos } from '@/components/finanzas/Movimientos';
import { useResumenDeFinanzas } from '@/hooks/useFinanzas';
import { dinero } from '@/hooks/usePagos';
import { estadoDelMes } from '@/lib/calendario-del-ciclo';
import { cn } from '@/lib/utils';

/**
 * EL RESUMEN DE LAS FINANZAS (2026-10-01)
 *
 * Debajo del saldo y de las partes (`CabezaDeFinanzas`): lo que entró y salió
 * este mes, los avisos, las cuentas del ciclo (lo que deben los estudiantes, lo
 * que falta pagar al personal, lo gastado) y los movimientos. Añadir va por el
 * «+» de la página (como Rial, 2026-10-14).
 */

export function VistaResumen({
    ciclo,
    irA,
    alPonerSaldo,
}: {
    ciclo: string | null;
    irA: (vista: 'estudiantes' | 'personal' | 'gastos') => void;
    /** El saldo inicial se pone con el formulario de fondos, que vive en la página. */
    alPonerSaldo: () => void;
}) {
    const { data, isLoading } = useResumenDeFinanzas(true, ciclo);
    const [filtro, setFiltro] = React.useState<FiltroDeMovimientos>('todo');
    const [oculto] = useFondosOcultos();

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando las finanzas" />
            </div>
        );
    }
    const fmt = (n: string | number) => dinero(n, data.currency);
    // Este mes (las tarjetas «Entró» y «Salió», como Ingresos y Egresos de Rial).
    const iActual = data.months.findIndex((m) => estadoDelMes(m.month, data.today) === 'actual');
    const delMes = iActual >= 0 ? data.months[iActual] : null;
    // «Entró» y «Salió» llevan a los movimientos de ese lado.
    const verMovimientos = (f: FiltroDeMovimientos) => {
        setFiltro(f);
        document.getElementById('movimientos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const tapar = (texto: string) => (oculto ? '••••' : texto);

    return (
        <div className="space-y-6">
            {/* ENTRÓ Y SALIÓ ESTE MES */}
            {delMes && (
                <div className="grid grid-cols-2 gap-3">
                    <TarjetaDelMes tipo="entra" titulo="Entró" monto={tapar(fmt(delMes.in))} alPulsar={() => verMovimientos('entra')} />
                    <TarjetaDelMes tipo="sale" titulo="Salió" monto={tapar(fmt(delMes.out))} alPulsar={() => verMovimientos('sale')} />
                </div>
            )}

            {/* LOS AVISOS, EN FRANJAS SUAVES */}
            {!data.tieneSaldoInicial && !data.closed && (
                <button
                    type="button"
                    onClick={alPonerSaldo}
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

            <Movimientos
                ciclo={ciclo}
                meses={data.months.map((m) => m.month)}
                mesInicial={delMes?.month ?? data.months[0]?.month ?? data.today.slice(0, 7)}
                filtro={filtro}
                alFiltrar={setFiltro}
                fmt={(n) => tapar(fmt(n))}
            />

        </div>
    );
}

/** «Ingresos» y «Egresos» de Rial: lo que entró y salió este mes. */
function TarjetaDelMes({ tipo, titulo, monto, alPulsar }: { tipo: 'entra' | 'sale'; titulo: string; monto: string; alPulsar: () => void }) {
    const entra = tipo === 'entra';
    return (
        <button
            type="button"
            onClick={alPulsar}
            aria-label={`${titulo} este mes: ${monto}. Ver los movimientos`}
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

export default VistaResumen;
