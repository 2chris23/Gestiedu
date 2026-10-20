'use client';

import {
    Coffee,
} from 'lucide-react';
import { Carril } from '@/components/ui/carril';
import type { useHorarioDelAlumno } from './useHorarioDelAlumno';

export function HoyDelAlumno({ c }: { c: ReturnType<typeof useHorarioDelAlumno> }) {
    const {
        viewMode,
        setCarril,
        seccionDe,
        esFamilia,
        handleClassClick,
        displayDay,
        infoDe,
        isLoading,
        timeline,
        getPeriodStatus,
        primeraQueQueda,
    } = c;

    return (
        <>
            {/* ───────────────────────────────────────────────────────────── */}
            {/* 1. VISTA DE HOY (5 BLOQUES EXACTOS + SNAP SCROLL POR BLOQUE) */}
            {/* ───────────────────────────────────────────────────────────── */}
            {viewMode === 'day' && (
                /*
                    EL DÍA, EN UN CARRIL DE LADO (TAMBIÉN EN EL TELÉFONO)

                    Estuvo una temporada en vertical —una hora debajo de
                    otra, 140 px cada una— y el dueño lo quiso de vuelta
                    de lado, como antes: el día cabe en un vistazo y se
                    pasa con el dedo. Pero más apretado: en el teléfono
                    cada ficha mide menos de la mitad del ancho, así que
                    se ven dos y se asoma la tercera (eso dice «hay
                    más»), y el carril arranca en la hora que va.

                    Lo mueve Embla (`Carril`), no el desplazamiento del
                    navegador con un arrastre programado a mano: aquel
                    enganchaba cada ficha MIENTRAS se arrastraba (las dos
                    fuerzas peleaban: «no se mueve con suavidad»), no tenía
                    inercia, y tras pasar a Semana y volver a Hoy el ratón
                    ya no lo movía.
                */
                isLoading ? (
                    <div className="w-full py-6 text-center text-xs font-medium text-gray-400">
                        Cargando horario en vivo...
                    </div>
                ) : (
                <Carril
                    etiqueta={`Horas de ${displayDay.fullLabel}`}
                    conFlechas={false}
                    anchoDeCada="w-[44%] min-w-[148px] min-[700px]:w-[calc((100%-48px)/5)] min-[700px]:min-w-[170px]"
                    hueco="gap-2.5 min-[700px]:gap-3"
                    inicio={Math.max(0, primeraQueQueda)}
                    alListo={setCarril}
                    className="pb-1"
                >
                    {timeline.map((period, index) => {
                            const status = getPeriodStatus(period.startTime, period.endTime);

                            // ☕ Bloque de Descanso / Recreo
                            if (period.isBreak) {
                                return (
                                    <div
                                        key={index}
                                        className={`h-full w-full min-h-[104px] p-2.5 min-[700px]:min-h-[145px] min-[700px]:p-3 rounded-2xl border transition-all flex flex-col justify-center items-center text-center ${
                                            status === 'current'
                                                ? 'bg-amber-50 border-amber-300 shadow-xs ring-2 ring-amber-200'
                                                : status === 'past'
                                                ? 'bg-gray-50 border-gray-200 opacity-60'
                                                : 'bg-orange-50/60 border-orange-200/80'
                                        }`}
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-1.5 shadow-2xs">
                                            <Coffee size={16} />
                                        </div>
                                        <span className="text-xs font-extrabold text-amber-900 truncate w-full">
                                            {period.label}
                                        </span>
                                        <div className="text-[11px] font-semibold text-gray-600 whitespace-nowrap mt-0.5">
                                            {period.startTime} - {period.endTime}
                                        </div>
                                        {status === 'current' && (
                                            <div className="mt-2 px-2 py-0.5 bg-amber-200 text-amber-900 text-[9px] font-black rounded-full">
                                                EN CURSO
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            const classItem = period.class;
                            const isClickable = Boolean(
                                classItem?.subjectId && (esFamilia || seccionDe(classItem))
                            );

                            // Datos enriquecidos desde el Plan de Evaluación y Actividades
                            const subjectInfo = infoDe(classItem);
                            // Antes de que empiece el plan del lapso, el nombre de esas
                            // semanas («Diagnóstico»): no hay tema del plan todavía.
                            const temaGenerador = subjectInfo?.antesDelPlan
                                ? subjectInfo.nombreAntesDelPlan || 'Diagnóstico'
                                : subjectInfo?.temaGenerador || null;
                            const firstColLabel = subjectInfo?.firstColumnLabel || 'Tema Generador';
                            const todayActivitiesCount = subjectInfo?.todayActivitiesCount ?? 0;
                            const nextActivitiesCount = subjectInfo?.nextActivitiesCount ?? 0;

                            return (
                                <div
                                    key={index}
                                    onClick={() => handleClassClick(classItem)}
                                    style={
                                        classItem?.color
                                            ? {
                                                  backgroundColor: `${classItem.color}08`,
                                                  borderColor: status === 'current' ? '#10b981' : `${classItem.color}35`,
                                              }
                                            : undefined
                                    }
                                    className={`h-full w-full min-h-[104px] p-2.5 min-[700px]:min-h-[145px] min-[700px]:p-3 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                                        isClickable ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:shadow-xs' : ''
                                    } ${
                                        !classItem?.color
                                            ? status === 'current'
                                                ? 'bg-emerald-50/80 border-emerald-500 shadow-xs ring-2 ring-emerald-200'
                                                : status === 'upcoming'
                                                ? 'bg-blue-50/40 border-blue-200/90'
                                                : 'bg-gray-50/70 border-gray-200 opacity-60'
                                            : status === 'current'
                                            ? 'shadow-xs border-emerald-500 ring-2 ring-emerald-200'
                                            : ''
                                    }`}
                                >
                                    {/* Header del Bloque: Hora + Badge En Curso */}
                                    <div>
                                        {/* Sin «…»: con «EN CURSO» al lado, «1RA HORA» se cortaba
                                            en el teléfono (DISENO-07, solo en días de clase). */}
                                        <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5">
                                            <span className="min-w-0 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                                                {period.label}
                                            </span>
                                            {status === 'current' && (
                                                <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-md">
                                                    EN CURSO
                                                </span>
                                            )}
                                        </div>

                                        <div className="text-[10px] font-bold text-gray-600 font-mono mb-1.5">
                                            {period.startTime} - {period.endTime}
                                        </div>

                                        {classItem ? (
                                            <div className="space-y-1">
                                                <h4
                                                    className={`font-black text-xs sm:text-sm leading-tight text-gray-900 line-clamp-1 ${
                                                        isClickable ? 'text-indigo-700 hover:underline' : ''
                                                    }`}
                                                    title={classItem.subject}
                                                >
                                                    {classItem.subject}
                                                </h4>
                                                {classItem.reemplazaA && (
                                                    <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                                        Reemplaza a {classItem.reemplazaA}
                                                    </span>
                                                )}

                                                {/* Tema Generador / Primera Columna del Plan */}
                                                <div className="bg-white/80 px-1.5 py-1 rounded-lg border border-gray-100/80 shadow-2xs min-[700px]:p-1.5">
                                                    {/* De pie, sin el rótulo: la ficha baja una línea
                                                        y el día cabe en menos alto. */}
                                                    <span className="hidden text-[9px] font-bold text-gray-400 uppercase tracking-tight truncate min-[700px]:block">
                                                        {firstColLabel}:
                                                    </span>
                                                    <p className="text-[11px] font-bold text-gray-800 line-clamp-1 leading-tight">
                                                        <span className="sr-only min-[700px]:hidden">{firstColLabel}: </span>
                                                        {temaGenerador || '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-4">
                                                <p className="text-xs text-gray-400 italic">Sin clase</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Hoy y Próx., siempre a la vista (el dueño los quiere aunque
                                        estén en 0: así se sabe de un vistazo que no hay nada). «Hoy» es
                                        lo que toca en esta clase; «Próx.» lo que se DEJÓ en ella para
                                        otro día (ver CLAUDE.md, «La clase en vivo»). */}
                                    {classItem && (
                                        <div className="pt-2 border-t border-gray-100/80 flex items-center justify-between gap-1 mt-auto flex-wrap">
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                                        todayActivitiesCount > 0 ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-600'
                                                    }`}
                                                    title={`${todayActivitiesCount} actividad(es) para esta clase`}
                                                >
                                                    {todayActivitiesCount} hoy
                                                </span>
                                                <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                                                        nextActivitiesCount > 0 ? 'bg-purple-100 text-purple-900' : 'bg-gray-100 text-gray-600'
                                                    }`}
                                                    title={`En esta clase se dejaron ${nextActivitiesCount} actividad(es) para la próxima`}
                                                >
                                                    {nextActivitiesCount} después
                                                </span>
                                            </div>
                                            {classItem.location && (
                                                <span className="text-[10px] text-gray-600 truncate max-w-[70px]">
                                                    {classItem.location}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </Carril>
                )
            )}
        </>
    );
}
