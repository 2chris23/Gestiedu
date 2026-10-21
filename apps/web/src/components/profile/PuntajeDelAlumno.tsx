'use client';

import { ArrowDown, ArrowUp, Minus, Trophy } from 'lucide-react';
import { fechaDeLaFoto, usePuntajeDelAlumno } from '@/hooks/useCuadroDeHonor';
import { cn } from '@/lib/utils';

/**
 * SU PUNTAJE DEL CUADRO DE HONOR, EN SU PERFIL (2026-10-04)
 *
 * Lo decidió Cristian: el estudiante (y su representante) ve SOLO su puntaje y
 * cuántos puestos subió desde el sábado anterior, del lapso en curso y del
 * ciclo. Nunca su puesto ni a los demás: el servidor ni siquiera lo manda. A
 * quien no puede verlo (un profesor) el servidor le responde 403 y aquí no se
 * pinta nada.
 */
export function PuntajeDelAlumno({ studentId }: { studentId: string }) {
    const { data, isError } = usePuntajeDelAlumno(studentId);
    if (isError || !data) return null;
    const alcances = data.alcances;

    return (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" aria-labelledby="mi-puntaje">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="mi-puntaje" className="flex items-center gap-2 text-base font-bold text-gray-900">
                    <Trophy className="h-5 w-5 text-amber-700" aria-hidden />
                    Cuadro de honor
                </h3>
                {data.fecha && <span className="text-xs text-gray-700">Actualizado el {fechaDeLaFoto(data.fecha)}</span>}
            </div>
            {alcances.length === 0 ? (
                <p className="mt-2 text-sm text-gray-700">Todavía no hay puntaje: sale con las notas cargadas y se actualiza cada sábado.</p>
            ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {alcances.map((a) => (
                        <li key={a.alcance} className="rounded-xl border border-amber-200 bg-white p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{a.nombre}</p>
                            <p className="mt-1 flex flex-wrap items-baseline gap-2">
                                <span className="text-2xl font-extrabold text-gray-900">{a.puntaje.toFixed(1)}</span>
                                <span className="text-sm text-gray-600">puntos</span>
                                {a.puestoAno !== undefined && a.puestoAno <= 10 ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                                        {a.puestoAno}.º de tu año
                                    </span>
                                ) : a.puestoLiceo !== undefined && a.puestoLiceo <= 10 ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                                        {a.puestoLiceo}.º del liceo
                                    </span>
                                ) : null}
                            </p>
                            <p
                                className={cn(
                                    'mt-1 inline-flex items-center gap-1 text-sm font-semibold',
                                    a.subio === null || a.subio === 0 ? 'text-gray-700' : a.subio > 0 ? 'text-emerald-700' : 'text-rose-700'
                                )}
                            >
                                {a.subio === null ? (
                                    'Primera semana en el cuadro'
                                ) : a.subio === 0 ? (
                                    <>
                                        <Minus className="h-4 w-4" aria-hidden /> Igual que el sábado pasado
                                    </>
                                ) : a.subio > 0 ? (
                                    <>
                                        <ArrowUp className="h-4 w-4" aria-hidden /> Subiste {a.subio} {a.subio === 1 ? 'puesto' : 'puestos'}
                                    </>
                                ) : (
                                    <>
                                        <ArrowDown className="h-4 w-4" aria-hidden /> Bajaste {-a.subio} {a.subio === -1 ? 'puesto' : 'puestos'}
                                    </>
                                )}
                            </p>
                            <p className="mt-2 text-xs text-gray-600">
                                Promedio {a.desglose.promedio.toFixed(1)} · asistencia {a.desglose.asistencia} %
                                {a.desglose.observaciones > 0 ? ` · ${a.desglose.observaciones} observación(es)` : ''}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default PuntajeDelAlumno;
