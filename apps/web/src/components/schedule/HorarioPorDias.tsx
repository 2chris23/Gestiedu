'use client';

import * as React from 'react';
import { Coffee, RotateCw, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aHorizontal, sePuedeGirar } from '@/lib/girar-la-pantalla';

/**
 * EL HORARIO DE PIE: UN DÍA CADA VEZ
 *
 * La rejilla del horario son cinco días por siete horas. Eso necesita 700 px, y
 * un teléfono de pie tiene 390: había que arrastrarla de lado, y al llegar al
 * viernes ya no se sabía qué hora se estaba mirando.
 *
 * Cinco días de 110 px no caben en 390. Uno sí, y sobra sitio. Así que de pie
 * se enseña **un día entero, en vertical**, con las horas una debajo de otra y
 * el día se cambia con las fichas de arriba. Se baja con el dedo y ya está: ni
 * una barra horizontal.
 *
 * La rejilla completa sigue existiendo, y es la que se ve en cuanto hay ancho
 * —una tableta, un ordenador o el mismo teléfono tumbado—. Por eso está el
 * botón: pedir el giro es más honrado que encoger la letra hasta que quepa.
 */

export interface DiaDelHorario {
    id: string | number;
    label: string;
}

export interface PeriodoDelHorario {
    id: string | number;
    label: string;
    startTime: string;
    endTime: string;
    type?: string;
}

export interface LoQueTocaEnEsaHora {
    titulo: string;
    subtitulo?: string;
    color?: string;
    /** Lo que se pinta a la derecha: una etiqueta, un aviso de reemplazo… */
    extra?: React.ReactNode;
}

interface Props {
    dias: DiaDelHorario[];
    periodos: PeriodoDelHorario[];
    /** Qué hay en ese día a esa hora. `null` si el hueco está libre. */
    loDeLaHora: (dia: DiaDelHorario, periodo: PeriodoDelHorario) => LoQueTocaEnEsaHora | null;
    /** El día que se abre primero. Por defecto, hoy si es de lunes a viernes. */
    diaInicial?: string | number;
    /** Qué decir del botón de girar: «para editar», «para verlo entero»… */
    motivoDelGiro?: string;
    cargando?: boolean;
    className?: string;
}

/** Lunes = 1 … Viernes = 5. Si hoy es sábado o domingo, se abre el lunes. */
function elDiaDeHoy(dias: DiaDelHorario[]): string | number | undefined {
    const n = new Date().getDay();
    const indice = n >= 1 && n <= 5 ? n - 1 : 0;
    return dias[indice]?.id ?? dias[0]?.id;
}

export function HorarioPorDias({
    dias,
    periodos,
    loDeLaHora,
    diaInicial,
    motivoDelGiro = 'Para verlo entero',
    cargando = false,
    className,
}: Props) {
    const [dia, setDia] = React.useState<string | number | undefined>(diaInicial ?? undefined);
    const [avisoDeGiro, setAvisoDeGiro] = React.useState(false);

    React.useEffect(() => {
        if (dia === undefined) setDia(diaInicial ?? elDiaDeHoy(dias));
    }, [dia, diaInicial, dias]);

    const elegido = dias.find((d) => d.id === dia) ?? dias[0];

    const pedirElGiro = async () => {
        const hecho = await aHorizontal();
        if (!hecho) setAvisoDeGiro(true);
    };

    if (!elegido) return null;

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            {/* Los días: se toca uno y se ve el suyo. */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Día de la semana">
                {dias.map((d) => {
                    const activo = d.id === elegido.id;
                    return (
                        <button
                            key={d.id}
                            type="button"
                            role="tab"
                            aria-selected={activo}
                            onClick={() => setDia(d.id)}
                            className={cn(
                                'min-h-[44px] flex-1 rounded-lg border px-2 text-xs font-semibold transition-colors',
                                activo
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-gray-200 bg-white text-gray-700'
                            )}
                        >
                            {d.label.slice(0, 3)}
                        </button>
                    );
                })}
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <p className="border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-bold text-gray-800">
                    {elegido.label}
                </p>

                {cargando ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-500">Cargando horario...</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {periodos.map((p) => {
                            if (p.type === 'break') {
                                return (
                                    <li
                                        key={p.id}
                                        className="flex items-center justify-center gap-2 bg-gray-50 px-4 py-2 text-gray-500"
                                    >
                                        <Coffee size={14} aria-hidden />
                                        <span className="text-xs font-bold uppercase tracking-wide">{p.label}</span>
                                        <span className="text-xs">
                                            ({p.startTime} – {p.endTime})
                                        </span>
                                    </li>
                                );
                            }

                            const toca = loDeLaHora(elegido, p);
                            return (
                                <li key={p.id} className="flex items-stretch gap-3 px-3 py-2.5">
                                    <div className="w-16 shrink-0 text-right">
                                        <p className="text-sm font-semibold text-gray-800">{p.startTime}</p>
                                        <p className="text-xs text-gray-500">{p.endTime}</p>
                                    </div>
                                    <div
                                        className={cn(
                                            'min-w-0 flex-1 rounded-lg border-l-4 px-3 py-2',
                                            toca ? 'bg-gray-50' : 'border-l-gray-200 bg-white'
                                        )}
                                        style={toca?.color ? { borderLeftColor: toca.color } : undefined}
                                    >
                                        {toca ? (
                                            <>
                                                <p className="truncate text-sm font-semibold text-gray-900">
                                                    {toca.titulo}
                                                </p>
                                                {toca.subtitulo && (
                                                    <p className="truncate text-xs text-gray-600">{toca.subtitulo}</p>
                                                )}
                                                {toca.extra}
                                            </>
                                        ) : (
                                            <p className="text-xs italic text-gray-400">Hora libre</p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* La rejilla entera existe: está a un giro de aquí. */}
            <button
                type="button"
                onClick={pedirElGiro}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-indigo-700 transition-colors active:bg-indigo-50"
            >
                <RotateCw className="h-4 w-4" aria-hidden />
                {motivoDelGiro}, gira el teléfono
            </button>

            {avisoDeGiro && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span>
                        Este navegador no deja girar la pantalla por su cuenta. Gira el teléfono y, si no pasa
                        nada, quita el bloqueo de giro en los ajustes.
                        {!sePuedeGirar() && ' En la app del liceo el botón sí funciona.'}
                    </span>
                </p>
            )}
        </div>
    );
}

export default HorarioPorDias;
