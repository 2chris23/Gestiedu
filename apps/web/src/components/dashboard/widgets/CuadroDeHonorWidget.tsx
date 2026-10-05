'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, ChevronRight, ChevronDown, Crown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCuadroDeHonor, fechaDeLaFoto, type FilaDelCuadro } from '@/hooks/useCuadroDeHonor';
import { cn } from '@/lib/utils';

/**
 * EL CUADRO DE HONOR DEL INICIO (2026-10-04; forma nueva 2026-10-05)
 *
 * Cristian: por lapso y por ciclo completo, y que se actualice solo los
 * sábados. Lee la foto del último sábado (`/api/cuadro-de-honor`); con el
 * selector se ve un lapso o el ciclo, y el liceo entero o un año.
 *
 * La forma es la del diseño «Panel Admin — App móvil»: el podio (plata, oro
 * con corona, bronce), tres filas más y «Ver ranking completo» para el resto.
 * Las letras de 11 px del diseño van a 12: es el mínimo del teléfono
 * (`npm run movil`, regla `letra`).
 *
 * Antes enseñaba cinco alumnos INVENTADOS cuando no había datos: un nombre
 * de muestra en el Inicio de un liceo parece un alumno de verdad. Sin foto
 * todavía, lo dice.
 */

const LICEO = 'liceo';
const ANOS = [1, 2, 3, 4, 5];
const FILAS_A_LA_VISTA = 3;

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

/** Los colores del diseño: plata, oro y bronce. */
const PODIO = [
    {
        lugar: 2,
        medalla: 'Plata',
        caja: 'rounded-[18px] border border-[#E3E8F0] bg-[#F8FAFC] px-1.5 py-3',
        chapa: 'bg-[#E9EDF3] text-[#4A5A72]',
        circulo: 'h-[42px] w-[42px] bg-[#E3F2FD] text-[#0D47A1] text-[13px]',
        puntos: 'text-[15px]',
    },
    {
        lugar: 1,
        medalla: 'Oro',
        caja: 'rounded-[20px] border-2 border-[#F2C94C] bg-[#FFFBEA] px-1.5 pb-3.5 pt-4',
        chapa: 'bg-[#FDEBB0] text-[#6B4A00]',
        circulo: 'h-12 w-12 bg-[#FDEBB0] text-[#6B4A00] text-sm',
        puntos: 'text-[17px]',
    },
    {
        lugar: 3,
        medalla: 'Bronce',
        caja: 'rounded-[18px] border border-[#F6D2B8] bg-[#FFF6EF] px-1.5 py-3',
        chapa: 'bg-[#FBE0CC] text-[#8A4416]',
        circulo: 'h-[42px] w-[42px] bg-[#FBE0CC] text-[#8A4416] text-[13px]',
        puntos: 'text-[15px]',
    },
] as const;

/** «1.° Oro»; si el puesto no es el del cajón (un empate), «2.° Empate». */
const laChapa = (puesto: number, lugar: number, medalla: string) => (puesto === lugar ? `${puesto}.° ${medalla}` : `${puesto}.° Empate`);

const SELECTOR =
    'h-10 w-auto gap-1.5 rounded-full border border-[#E3E8F0] bg-white px-3.5 text-[13px] font-bold text-[#0B1B33] [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-100';

export function CuadroDeHonorWidget() {
    const titulo = React.useId();
    const [alcance, setAlcance] = React.useState<string | null>(null);
    const [ano, setAno] = React.useState<number | null>(null);
    const [todos, setTodos] = React.useState(false);
    const { data, isLoading, isError } = useCuadroDeHonor(alcance, ano);
    const filas = data?.filas ?? [];
    const podio = (lugar: number) => filas[lugar - 1];
    const resto = filas.slice(3);
    const aLaVista = todos ? resto : resto.slice(0, FILAS_A_LA_VISTA);

    return (
        <section className="flex flex-col gap-3.5 rounded-3xl bg-white px-4 py-[18px] shadow-[0_1px_2px_rgba(13,71,161,0.06)]" aria-labelledby={titulo}>
            <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FFF6DA] text-[#9A6B00]">
                    <Trophy className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                    <h3 id={titulo} className="text-[15px] font-extrabold text-[#0B1B33]">
                        Cuadro de honor
                    </h3>
                    <p className="text-xs text-[#5B6B82]">
                        Se actualiza cada sábado{data?.fecha ? ` · última: ${fechaDeLaFoto(data.fecha)}` : ''}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Select value={alcance ?? data?.alcance ?? 'CICLO'} onValueChange={(v) => setAlcance(v)}>
                    <SelectTrigger aria-label="Lapso o ciclo completo" className={SELECTOR}>
                        <SelectValue placeholder="Ciclo completo" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" className="rounded-xl bg-white p-1">
                        {(data?.alcances ?? [{ id: 'CICLO', nombre: 'Ciclo completo' }]).map((a) => (
                            <SelectItem key={a.id} value={a.id} className="min-h-[44px] rounded-lg text-sm">
                                {a.nombre}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={ano ? String(ano) : LICEO} onValueChange={(v) => setAno(v === LICEO ? null : Number(v))}>
                    <SelectTrigger aria-label="Todo el liceo o un año" className={SELECTOR}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" className="rounded-xl bg-white p-1">
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

            {isLoading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-[#9A6B00]" aria-label="Cargando el cuadro de honor" />
                </div>
            ) : isError ? (
                <p className="py-8 text-center text-sm text-gray-700">No se pudo cargar el cuadro de honor.</p>
            ) : filas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Trophy className="mb-2 h-8 w-8 text-[#9A6B00]" aria-hidden />
                    <p className="text-sm font-semibold text-gray-900">{data?.fecha ? 'Nadie con notas en este período' : 'Todavía no hay cuadro de honor'}</p>
                    <p className="mt-1 max-w-[280px] text-xs text-gray-600">
                        {data?.fecha
                            ? 'Sale cuando los alumnos tengan notas cargadas en este lapso o año.'
                            : 'El primero sale con las notas cargadas; luego se actualiza cada sábado.'}
                    </p>
                </div>
            ) : (
                <>
                    <ol className="grid grid-cols-[1fr_1.12fr_1fr] items-end gap-2 pt-3" aria-label="Los tres primeros">
                        {PODIO.map(({ lugar, medalla, caja, chapa, circulo, puntos }) => {
                            const f = podio(lugar);
                            if (!f) {
                                return (
                                    <li key={lugar} className="flex min-h-[140px] flex-col items-center justify-center rounded-[18px] border border-dashed border-[#E3E8F0] p-2.5 text-center">
                                        <span className="text-xs font-bold text-[#5B6B82]">
                                            {lugar}.° {medalla}
                                        </span>
                                    </li>
                                );
                            }
                            return (
                                <li key={lugar}>
                                    <Link
                                        href={`/dashboard/usuarios/${encodeURIComponent(f.id)}`}
                                        className={cn('relative flex flex-col items-center gap-1.5 text-center transition-shadow hover:shadow-sm', caja)}
                                    >
                                        {lugar === 1 && (
                                            <span className="absolute -top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#F2C94C] text-[#6B4A00]" aria-hidden>
                                                <Crown className="h-[15px] w-[15px]" />
                                            </span>
                                        )}
                                        <span className={cn('whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-extrabold', chapa)}>{laChapa(f.puesto, lugar, medalla)}</span>
                                        <span className={cn('flex items-center justify-center rounded-full font-extrabold', circulo)} aria-hidden>
                                            {iniciales(f.nombre)}
                                        </span>
                                        <span className="w-full min-w-0 text-xs font-bold leading-tight text-[#0B1B33] [overflow-wrap:anywhere]" title={f.nombre}>
                                            {f.nombre}
                                        </span>
                                        <span className="w-full truncate text-xs text-[#5B6B82]">{f.seccion}</span>
                                        <span className={cn('inline-flex items-center gap-1 font-extrabold text-[#0B1B33]', puntos)}>
                                            {f.puntaje.toFixed(1)} <span className="text-xs font-semibold text-[#5B6B82]">pts</span>
                                            <Subio n={f.subio} />
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ol>

                    {aLaVista.length > 0 && (
                        <ol className="flex flex-col gap-2" start={4} aria-label="Del cuarto en adelante">
                            {aLaVista.map((f) => (
                                <li key={f.id}>
                                    <Link
                                        href={`/dashboard/usuarios/${encodeURIComponent(f.id)}`}
                                        className="flex min-h-[44px] items-center gap-3 rounded-2xl bg-[#F8FAFC] px-3 py-2.5 text-[#0B1B33] transition-colors hover:bg-[#EEF2F7]"
                                    >
                                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[#E3E8F0] bg-white text-xs font-extrabold text-[#4A5A72]">
                                            {f.puesto}
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-sm font-bold">{f.nombre}</span>
                                            <span className="truncate text-xs text-[#5B6B82]">
                                                {f.seccion} · Prom. {f.promedio.toFixed(1)} · Asist. {f.asistencia}%
                                            </span>
                                        </span>
                                        <Subio n={f.subio} />
                                        <span className="text-[15px] font-extrabold">{f.puntaje.toFixed(1)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}

                    {resto.length > FILAS_A_LA_VISTA && (
                        <button
                            type="button"
                            onClick={() => setTodos((v) => !v)}
                            aria-expanded={todos}
                            className="flex min-h-[44px] items-center gap-1.5 self-center text-[13px] font-bold text-[#0D47A1]"
                        >
                            {todos ? 'Ver menos' : 'Ver ranking completo'}
                            {todos ? <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                    )}
                </>
            )}
        </section>
    );
}

export type { FilaDelCuadro };
export default CuadroDeHonorWidget;
