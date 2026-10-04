'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, ChevronRight, Crown, Medal, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCuadroDeHonor, fechaDeLaFoto, type FilaDelCuadro } from '@/hooks/useCuadroDeHonor';
import { cn } from '@/lib/utils';

/**
 * EL CUADRO DE HONOR DEL INICIO (2026-10-04)
 *
 * Cristian: por lapso y por ciclo completo, y que se actualice solo los
 * sábados. Lee la foto del último sábado (`/api/cuadro-de-honor`); con el
 * selector se ve un lapso o el ciclo, y el liceo entero o un año.
 *
 * Antes enseñaba cinco alumnos INVENTADOS cuando no había datos: un nombre
 * de muestra en el Inicio de un liceo parece un alumno de verdad. Sin foto
 * todavía, lo dice.
 */

const LICEO = 'liceo';
const ANOS = [1, 2, 3, 4, 5];

const iniciales = (nombre: string) =>
    nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();

function Subio({ n }: { n: number | null }) {
    if (n === null || n === 0) return null;
    const sube = n > 0;
    return (
        <span
            className={cn('inline-flex items-center gap-0.5 text-xs font-bold', sube ? 'text-emerald-700' : 'text-rose-700')}
            title={sube ? `Subió ${n} desde el sábado anterior` : `Bajó ${-n} desde el sábado anterior`}
        >
            {sube ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
            {Math.abs(n)}
            <span className="sr-only">{sube ? ' puestos más arriba' : ' puestos más abajo'}</span>
        </span>
    );
}

const PODIO = [
    { lugar: 2, etiqueta: '2.° Plata', icono: Medal, caja: 'border-slate-200 from-slate-50/70 min-h-[150px]', chapa: 'bg-slate-100 text-slate-800 border-slate-300', circulo: 'bg-slate-100 text-slate-800 border-slate-300' },
    { lugar: 1, etiqueta: '1.° Oro', icono: Trophy, caja: 'border-2 border-amber-300/80 from-amber-50/70 min-h-[170px] z-10', chapa: 'bg-amber-100 text-amber-900 border-amber-300', circulo: 'bg-amber-100 text-amber-900 border-amber-300' },
    { lugar: 3, etiqueta: '3.° Bronce', icono: Medal, caja: 'border-orange-200 from-orange-50/70 min-h-[140px]', chapa: 'bg-orange-100 text-orange-900 border-orange-300', circulo: 'bg-orange-100 text-orange-900 border-orange-300' },
] as const;

export function CuadroDeHonorWidget() {
    const [alcance, setAlcance] = React.useState<string | null>(null);
    const [ano, setAno] = React.useState<number | null>(null);
    const { data, isLoading, isError } = useCuadroDeHonor(alcance, ano);
    const filas = data?.filas ?? [];
    const podio = (lugar: number) => filas[lugar - 1];
    const resto = filas.slice(3, 10);

    return (
        <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs" aria-labelledby="cuadro-de-honor">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <Trophy className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                        <h3 id="cuadro-de-honor" className="text-sm font-bold text-gray-900">
                            Cuadro de honor
                        </h3>
                        <p className="text-xs text-gray-600">
                            Se actualiza cada sábado{data?.fecha ? ` · última: ${fechaDeLaFoto(data.fecha)}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={alcance ?? data?.alcance ?? 'CICLO'} onValueChange={(v) => setAlcance(v)}>
                        <SelectTrigger aria-label="Lapso o ciclo completo" className="h-11 w-auto min-w-[9rem] rounded-xl bg-white text-sm font-semibold text-gray-800">
                            <SelectValue placeholder="Ciclo completo" />
                        </SelectTrigger>
                        <SelectContent position="popper" align="end" className="rounded-xl bg-white p-1">
                            {(data?.alcances ?? [{ id: 'CICLO', nombre: 'Ciclo completo' }]).map((a) => (
                                <SelectItem key={a.id} value={a.id} className="min-h-[44px] rounded-lg text-sm">
                                    {a.nombre}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={ano ? String(ano) : LICEO} onValueChange={(v) => setAno(v === LICEO ? null : Number(v))}>
                        <SelectTrigger aria-label="Todo el liceo o un año" className="h-11 w-auto min-w-[8rem] rounded-xl bg-white text-sm font-semibold text-gray-800">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" align="end" className="rounded-xl bg-white p-1">
                            <SelectItem value={LICEO} className="min-h-[44px] rounded-lg text-sm">
                                Todo el liceo
                            </SelectItem>
                            {ANOS.map((n) => (
                                <SelectItem key={n} value={String(n)} className="min-h-[44px] rounded-lg text-sm">
                                    {n}.º año
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" aria-label="Cargando el cuadro de honor" />
                </div>
            ) : isError ? (
                <p className="py-8 text-center text-sm text-gray-700">No se pudo cargar el cuadro de honor.</p>
            ) : filas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Trophy className="mb-2 h-8 w-8 text-amber-600" aria-hidden />
                    <p className="text-sm font-semibold text-gray-900">{data?.fecha ? 'Nadie con notas en este período' : 'Todavía no hay cuadro de honor'}</p>
                    <p className="mt-1 max-w-[280px] text-xs text-gray-600">
                        {data?.fecha
                            ? 'Sale cuando los alumnos tengan notas cargadas en este lapso o año.'
                            : 'El primero sale con las notas cargadas; luego se actualiza cada sábado.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <ol className="grid grid-cols-3 items-end gap-2.5 pt-3" aria-label="Los tres primeros">
                        {PODIO.map(({ lugar, etiqueta, icono: Icono, caja, chapa, circulo }) => {
                            const f = podio(lugar);
                            if (!f) {
                                return (
                                    <li key={lugar} className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 p-2.5 text-center">
                                        <span className="text-xs font-bold text-gray-600">{etiqueta}</span>
                                    </li>
                                );
                            }
                            return (
                                <li key={lugar} className={lugar === 1 ? 'self-end' : 'self-end'}>
                                    <Link
                                        href={`/dashboard/usuarios/${encodeURIComponent(f.id)}`}
                                        className={cn('relative flex flex-col items-center justify-between rounded-2xl border bg-gradient-to-b to-white p-2.5 text-center transition-shadow hover:shadow-sm', caja)}
                                    >
                                        {lugar === 1 && <Crown className="absolute -top-3 left-1/2 h-5 w-5 -translate-x-1/2 fill-amber-400 text-amber-600" aria-hidden />}
                                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold', chapa)}>
                                            <Icono className="h-3 w-3" aria-hidden />
                                            {f.puesto === lugar ? etiqueta : `${f.puesto}.°`}
                                        </span>
                                        <span className={cn('my-1.5 flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold', circulo)} aria-hidden>
                                            {iniciales(f.nombre)}
                                        </span>
                                        <span className="w-full min-w-0 px-1">
                                            <span className="block truncate text-xs font-bold text-gray-900" title={f.nombre}>
                                                {f.nombre}
                                            </span>
                                            <span className="block truncate text-xs text-gray-600">{f.seccion}</span>
                                        </span>
                                        <span className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-gray-900">
                                            {f.puntaje.toFixed(1)} <span className="text-xs font-semibold text-gray-600">pts</span>
                                            <Subio n={f.subio} />
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ol>

                    {resto.length > 0 && (
                        <ol className="space-y-1.5" start={4} aria-label="Del cuarto en adelante">
                            {resto.map((f) => (
                                <li key={f.id}>
                                    <Link
                                        href={`/dashboard/usuarios/${encodeURIComponent(f.id)}`}
                                        className="group flex min-h-[44px] items-center justify-between gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 p-2 transition-colors hover:border-gray-200 hover:bg-gray-100/70"
                                    >
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700">
                                                {f.puesto}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-gray-900">{f.nombre}</span>
                                                <span className="block truncate text-xs text-gray-600">{f.seccion}</span>
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2.5">
                                            <span className="hidden items-center gap-2 text-xs text-gray-600 sm:flex">
                                                <span>Promedio {f.promedio.toFixed(1)}</span>
                                                <span>Asist. {f.asistencia} %</span>
                                            </span>
                                            <Subio n={f.subio} />
                                            <span className="text-sm font-extrabold text-gray-900">{f.puntaje.toFixed(1)}</span>
                                            <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-indigo-700" aria-hidden />
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}

            <p className="border-t border-gray-100 pt-2 text-xs text-gray-600">
                Puntaje: notas, asistencia y observaciones del período, con los pesos del liceo (Configuración → Académica).
            </p>
        </section>
    );
}

export type { FilaDelCuadro };
export default CuadroDeHonorWidget;
