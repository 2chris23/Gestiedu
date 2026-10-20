'use client';

import {
    Calendar,
    Edit,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
} from 'lucide-react';
import { DescargarHorario } from '@/components/schedule/DescargarHorario';
import ScheduleHistoryModal from '@/components/schedule/ScheduleHistoryModal';
import Link from 'next/link';
import TurnoBadge from '@/components/common/TurnoBadge';

// Días de la semana laborables
import { useHorarioDelAlumno } from './useHorarioDelAlumno';
import { Props } from './useHorarioDelAlumno';
import { SemanaDelAlumno } from './SemanaDelAlumno';
import { HoyDelAlumno } from './HoyDelAlumno';

export default function StudentScheduleSection({ schedule, role, showActions = false, classroomId, editUrl, titulo = 'Horario semanal', subtitulo, teacherId, alumnoId }: Props) {
    const c = useHorarioDelAlumno({ schedule, role, showActions, classroomId, editUrl, titulo, subtitulo, teacherId, alumnoId });
    const {
        viewMode,
        setViewMode,
        setDayViewKey,
        histDate,
        setHistDate,
        setDiaElegido,
        isHistoryOpen,
        setIsHistoryOpen,
        scrollByBlock,
        getDisplayDay,
        histLabel,
        turno,
        timeline,
    } = c;

    return (
        <>
            {/* Contenedor Principal */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4 sm:p-5">
                {/* Header con Título, Botones y Controles de Carrusel */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 shadow-xs">
                            <Calendar size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight">Horario en Vivo</h3>
                                <TurnoBadge turno={turno} />
                            </div>
                            <p className="text-[11px] text-gray-600 font-medium">
                                {histLabel}
                            </p>
                        </div>
                    </div>

                    {/* Acciones y Toggle — se parten en vez de empujar la
                        pantalla: con los botones a 44 px, «Hoy · Semana ·
                        Historial» más las acciones ya no caben en una línea de
                        390 px. */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Controles de avance por bloque (solo en vista Hoy si hay más de 5 bloques).
                            De pie no se pintan: ahí las horas van una debajo de
                            otra y no hay carril que mover. */}
                        {viewMode === 'day' && timeline.length > 5 && (
                            <div className="hidden items-center gap-1 rounded-lg border border-gray-200/60 bg-gray-50 p-0.5 min-[700px]:flex">
                                <button
                                    type="button"
                                    onClick={() => scrollByBlock('prev')}
                                    className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 rounded-md transition-colors"
                                    title="Bloque anterior"
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => scrollByBlock('next')}
                                    className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 rounded-md transition-colors"
                                    title="Bloque siguiente"
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}

                        <DescargarHorario bloques={schedule} titulo={titulo} subtitulo={subtitulo} />

                        {showActions && (
                            <div className="flex items-center gap-1 mr-1 pr-1 border-r border-gray-200">
                                {editUrl && (
                                    <Link
                                        href={editUrl}
                                        className="inline-flex h-9 w-9 items-center justify-center text-indigo-600 hover:bg-indigo-100 bg-indigo-50 rounded-lg transition-colors shadow-2xs"
                                        title="Editar horario"
                                        aria-label="Editar horario"
                                    >
                                        <Edit size={15} />
                                    </Link>
                                )}
                            </div>
                        )}

                        {/* Botones Toggle Hoy / Semana */}
                        <div className="inline-flex bg-gray-100/90 p-0.5 rounded-xl gap-0.5 border border-gray-200/50">
                            <button
                                type="button"
                                onClick={() => { setViewMode('day'); setHistDate(null); setDayViewKey(getDisplayDay()); }}
                                className={`inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                    viewMode === 'day' && !histDate
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Hoy
                            </button>
                            <button
                                type="button"
                                onClick={() => { setViewMode('week'); setHistDate(null); }}
                                className={`inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                    viewMode === 'week'
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                Semana
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsHistoryOpen(true)}
                                className={`inline-flex items-center justify-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                                    histDate
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title="Historial de clases por fecha"
                            >
                                <CalendarDays size={12} />
                                Historial
                            </button>
                        </div>
                    </div>
                </div>

                <HoyDelAlumno c={c} />

                <SemanaDelAlumno c={c} />
            </div>

            {/* Modal de Calendario e Historial */}

            {/* Fase 3.5 Parte B — Historial por fecha (misma vista "Hoy", fecha parametrizada) */}
            {isHistoryOpen && (
                <ScheduleHistoryModal
                    classroomId={classroomId}
                    schedule={schedule}
                    onSelectDay={(dateStr, key) => {
                        setHistDate(dateStr);
                        setDayViewKey(key);
                        setDiaElegido(true);
                        setViewMode('day');
                        setIsHistoryOpen(false);
                    }}
                    onClose={() => setIsHistoryOpen(false)}
                />
            )}
        </>
    );
}
