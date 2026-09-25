'use client';

import * as React from 'react';
import { ChevronDown, Minus, Plus, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aHorizontal } from '@/lib/girar-la-pantalla';

/**
 * EL PLAN DE EVALUACIÓN, DE PIE
 *
 * ─── POR QUÉ NO ES LA TABLA ENCOGIDA ────────────────────────────────────────
 *
 * El plan es una hoja apaisada: dieciocho o veinticuatro semanas por diez
 * columnas. En un teléfono de 390 px eso son mil y pico de tabla, y escribir
 * ahí significa arrastrar de lado para cada campo, sin ver nunca de qué semana
 * es lo que se está escribiendo.
 *
 * Pero mirando cómo está hecho de verdad, el plan **no es una rejilla**:
 *
 *   · las columnas las pone el profesor —se añaden, se borran y se les cambia
 *     el nombre—, así que no hay un juego fijo de campos que dibujar;
 *   · y una celda **abarca varias semanas**, por columna: «El agua en mi
 *     comunidad» puede cubrir de la 1 a la 4 mientras la actividad cambia cada
 *     semana.
 *
 * Es decir: el plan es **una sucesión de bloques de trabajo en el tiempo**,
 * cada uno con sus campos, y dentro de cada bloque las semanas con lo suyo. La
 * rejilla es solo cómo se imprime en papel.
 *
 * ─── LO QUE SE VE AQUÍ ──────────────────────────────────────────────────────
 *
 * Una tarjeta por bloque. Arriba, lo que abarca —«S.1 – S.4 · 19/08 – 13/09»— y
 * dos botones para alargarlo o acortarlo; debajo, los campos del bloque; y
 * dentro, sus semanas, cada una con lo que cambia semana a semana.
 *
 * Lo de alargar importa más de lo que parece: en la tabla eso se hace con un
 * botón `↓` que aparece **al pasar el cursor por encima de la celda**. En una
 * pantalla táctil no hay cursor que pasar, así que desde un teléfono unir dos
 * semanas era sencillamente imposible.
 *
 * Solo se baja con el dedo. Ni una barra horizontal. Y la cuenta de puntos va
 * arriba, siempre a la vista: antes estaba al final de una tabla que había que
 * arrastrar, así que se escribía el plan sin saber cuánto se llevaba repartido.
 *
 * En pantalla ancha, en horizontal y en el papel, la tabla se queda como está:
 * un plan tiene que parecer un plan.
 */

export interface ColumnaDelPlan {
    key: string;
    label: string;
    mergeable: boolean;
    numeric: boolean;
}

export interface SemanaDelPlan {
    weekNumber: number;
    data: Record<string, string | number>;
    colSpan: Record<string, number>;
}

export interface BloqueDelPlan {
    desde: number;
    hasta: number;
}

interface Props {
    semanas: SemanaDelPlan[];
    columnas: ColumnaDelPlan[];
    /** Las fechas de esa semana del lapso, si se saben. */
    fechasDe: (numeroDeSemana: number) => { start: string; end: string } | null;
    puedeEditar: boolean;
    alEscribir: (indiceDeSemana: number, columna: string, valor: string) => void;
    /** El bloque que empieza en esa semana pasa a abarcar una semana más. */
    alAlargar: (indiceDeSemana: number) => void;
    alAcortar: (indiceDeSemana: number) => void;
    className?: string;
}

/**
 * Parte las semanas en bloques: cada bloque empieza donde empieza una unión y
 * dura lo que dure la más larga de sus columnas. Es la misma cuenta con la que
 * se guarda (`endWeekNumber`), así que lo que se ve aquí es lo que hay.
 */
export function losBloques(semanas: SemanaDelPlan[]): BloqueDelPlan[] {
    const bloques: BloqueDelPlan[] = [];
    let i = 0;
    while (i < semanas.length) {
        const spans = Object.values(semanas[i]?.colSpan ?? {})
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0);
        const largo = Math.max(1, ...(spans.length ? spans : [1]));
        bloques.push({ desde: i, hasta: Math.min(i + largo - 1, semanas.length - 1) });
        i += largo;
    }
    return bloques;
}

/** ¿Hay algo escrito en esta semana? */
function tieneAlgo(semana: SemanaDelPlan | undefined, columnas: ColumnaDelPlan[]): boolean {
    if (!semana) return false;
    return columnas.some((c) => {
        const v = semana.data[c.key];
        return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '0';
    });
}

const CAMPO =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

function Campo({
    columna,
    valor,
    puedeEditar,
    alEscribir,
}: {
    columna: ColumnaDelPlan;
    valor: string;
    puedeEditar: boolean;
    alEscribir: (v: string) => void;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                {columna.label}
            </span>
            {puedeEditar ? (
                columna.numeric ? (
                    <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={valor}
                        onChange={(e) => alEscribir(e.target.value)}
                        className={CAMPO}
                    />
                ) : (
                    <textarea
                        rows={2}
                        value={valor}
                        onChange={(e) => alEscribir(e.target.value)}
                        className={cn(CAMPO, 'resize-y')}
                    />
                )
            ) : (
                <p className="whitespace-pre-wrap text-sm text-gray-800">
                    {valor || <span className="italic text-gray-400">Sin escribir</span>}
                </p>
            )}
        </label>
    );
}

export function PlanPorBloques({
    semanas,
    columnas,
    fechasDe,
    puedeEditar,
    alEscribir,
    alAlargar,
    alAcortar,
    className,
}: Props) {
    const [abiertas, setAbiertas] = React.useState<Set<number>>(new Set());
    const [avisoDeGiro, setAvisoDeGiro] = React.useState(false);

    const deBloque = columnas.filter((c) => c.mergeable);
    const deSemana = columnas.filter((c) => !c.mergeable);
    const bloques = React.useMemo(() => losBloques(semanas), [semanas]);

    const puntos = semanas.reduce((suma, s) => {
        const n = Number(s.data['puntos']);
        return suma + (Number.isFinite(n) ? n : 0);
    }, 0);
    const puntosRedondos = Math.round(puntos * 100) / 100;

    const alternar = (i: number) =>
        setAbiertas((antes) => {
            const nuevas = new Set(antes);
            if (nuevas.has(i)) nuevas.delete(i);
            else nuevas.add(i);
            return nuevas;
        });

    const pedirElGiro = async () => {
        if (!(await aHorizontal())) setAvisoDeGiro(true);
    };

    const rotulo = (bloque: BloqueDelPlan) => {
        const a = semanas[bloque.desde]?.weekNumber;
        const b = semanas[bloque.hasta]?.weekNumber;
        return a === b ? `Semana ${a}` : `Semanas ${a} – ${b}`;
    };

    const fechas = (bloque: BloqueDelPlan) => {
        const desde = fechasDe(semanas[bloque.desde]?.weekNumber ?? 1);
        const hasta = fechasDe(semanas[bloque.hasta]?.weekNumber ?? 1);
        if (!desde || !hasta) return null;
        return `${desde.start} – ${hasta.end}`;
    };

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            {/* La cuenta, siempre arriba: es lo que hay que cuadrar. */}
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
                <p className="text-sm font-semibold text-gray-800">
                    Puntos <span className={puntosRedondos > 20 ? 'text-red-600' : 'text-indigo-700'}>{puntosRedondos}</span>
                    <span className="text-gray-400"> / 20</span>
                </p>
                <p className="text-xs text-gray-500">
                    {puntosRedondos > 20
                        ? `Sobran ${Math.round((puntosRedondos - 20) * 100) / 100}`
                        : puntosRedondos < 20
                          ? `Faltan ${Math.round((20 - puntosRedondos) * 100) / 100}`
                          : 'Cuadrado'}
                </p>
            </div>

            {bloques.map((bloque) => {
                const semana = semanas[bloque.desde];
                if (!semana) return null;
                const vacio = !tieneAlgo(semana, columnas) && bloque.desde === bloque.hasta;
                const abierto = abiertas.has(bloque.desde);

                return (
                    <article
                        key={`b-${bloque.desde}`}
                        className={cn(
                            'overflow-hidden rounded-xl border bg-white',
                            vacio ? 'border-dashed border-gray-300' : 'border-gray-200 shadow-sm'
                        )}
                    >
                        <div className="flex items-center justify-between gap-2 border-l-4 border-l-indigo-500 bg-gray-50 px-3 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-gray-900">{rotulo(bloque)}</p>
                                {fechas(bloque) && <p className="truncate text-xs text-gray-500">{fechas(bloque)}</p>}
                            </div>

                            {puedeEditar && (
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => alAcortar(bloque.desde)}
                                        disabled={bloque.desde === bloque.hasta}
                                        title="Que abarque una semana menos"
                                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40"
                                    >
                                        <Minus className="h-4 w-4" aria-hidden />
                                        <span className="sr-only">Una semana menos</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => alAlargar(bloque.desde)}
                                        disabled={bloque.hasta >= semanas.length - 1}
                                        title="Que abarque una semana más"
                                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40"
                                    >
                                        <Plus className="h-4 w-4" aria-hidden />
                                        <span className="sr-only">Una semana más</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Lo del bloque entero: lo que no cambia semana a semana. */}
                        {deBloque.length > 0 && (
                            <div className="space-y-3 px-3 py-3">
                                {deBloque.map((col) => (
                                    <Campo
                                        key={col.key}
                                        columna={col}
                                        valor={String(semana.data[col.key] ?? '')}
                                        puedeEditar={puedeEditar}
                                        alEscribir={(v) => alEscribir(bloque.desde, col.key, v)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Y sus semanas, con lo que sí cambia. */}
                        {deSemana.length > 0 && (
                            <ul className="divide-y divide-gray-100 border-t border-gray-100">
                                {Array.from({ length: bloque.hasta - bloque.desde + 1 }).map((_, k) => {
                                    const idx = bloque.desde + k;
                                    const s = semanas[idx];
                                    if (!s) return null;
                                    const suyaAbierta = abierto || abiertas.has(idx);
                                    const resumen =
                                        deSemana
                                            .map((c) => String(s.data[c.key] ?? '').trim())
                                            .find((v) => v !== '' && v !== '0') || '';

                                    return (
                                        <li key={s.weekNumber}>
                                            <button
                                                type="button"
                                                onClick={() => alternar(idx)}
                                                aria-expanded={suyaAbierta}
                                                className="flex min-h-[52px] w-full items-center gap-2 px-3 py-2 text-left"
                                            >
                                                <span className="w-12 shrink-0 text-xs font-bold text-gray-500">
                                                    S.{s.weekNumber}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                                                    {resumen || <span className="italic text-gray-400">Sin escribir</span>}
                                                </span>
                                                {Number(s.data['puntos']) > 0 && (
                                                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                                        {s.data['puntos']} pts
                                                    </span>
                                                )}
                                                <ChevronDown
                                                    className={cn(
                                                        'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                                                        suyaAbierta && 'rotate-180'
                                                    )}
                                                    aria-hidden
                                                />
                                            </button>

                                            {suyaAbierta && (
                                                <div className="space-y-3 bg-gray-50 px-3 py-3">
                                                    {deSemana.map((col) => (
                                                        <Campo
                                                            key={col.key}
                                                            columna={col}
                                                            valor={String(s.data[col.key] ?? '')}
                                                            puedeEditar={puedeEditar}
                                                            alEscribir={(v) => alEscribir(idx, col.key, v)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </article>
                );
            })}

            <button
                type="button"
                onClick={pedirElGiro}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-indigo-700 transition-colors active:bg-indigo-50"
            >
                <RotateCw className="h-4 w-4" aria-hidden />
                Para ver el plan como se entrega, gira el teléfono
            </button>

            {avisoDeGiro && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Este navegador no deja girar la pantalla por su cuenta. Gira el teléfono y, si no pasa nada,
                    quita el bloqueo de giro en los ajustes.
                </p>
            )}
        </div>
    );
}

export default PlanPorBloques;
