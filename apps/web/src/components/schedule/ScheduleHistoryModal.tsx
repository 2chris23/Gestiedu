'use client';

import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X, Info, ListTodo } from 'lucide-react';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { useClassActivities } from '@/hooks/useLiveClass';

interface Props {
    classroomId?: string;
    schedule: ScheduleBlock[];
    onSelectDay: (dateStr: string, dayKey: string) => void;
    onClose: () => void;
    title?: string;
    subtitle?: string;
}

const WEEK_HEADER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_KEYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

/** Formato local dd/mm/yyyy sin zona horaria. */
function fmtDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

function toDateStr(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Fase 3.5 Parte B — Historial del Horario en Vivo.
 * Calendario mensual navegable (pasado/futuro, sin límite artificial). Los días
 * con clase se marcan con un punto índigo. Al elegir un día CON clase, la vista
 * principal "Hoy" se parametriza a esa fecha (mismo componente, fecha distinta).
 * Días sin clase (fin de semana o sin bloques) están deshabilitados.
 */
export default function ScheduleHistoryModal({ classroomId, schedule, onSelectDay, onClose, title, subtitle }: Props) {
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), 1);
    });
    const [sinClases, setSinClases] = useState<string | null>(null);

    // Obtener actividades de toda la sección para mostrar contadores combinados
    const { data: activitiesData } = useClassActivities(classroomId || '');
    const activities = activitiesData?.activities || [];

    // Mapear actividades por fecha (dueDate o createdAt)
    const activitiesByDate = new Map<string, number>();
    for (const a of activities) {
        const targetDate = a.dueDate ? new Date(a.dueDate) : new Date(a.createdAt);
        const dStr = toDateStr(targetDate);
        activitiesByDate.set(dStr, (activitiesByDate.get(dStr) || 0) + 1);
    }

    const hasClassOn = (day: Date): boolean => {
        const dow = day.getDay(); // 0=dom..6=sáb
        if (dow === 0 || dow === 6) return false;
        const key = DAY_KEYS[dow - 1];
        return schedule.some((s) => s.day === key);
    };

    const handleDayClick = (day: Date) => {
        const dow = day.getDay();
        if (dow === 0 || dow === 6) {
            setSinClases(`Sin clases programadas ese día (${fmtDate(day)})`);
            return;
        }
        const key = DAY_KEYS[dow - 1];
        if (!hasClassOn(day)) {
            setSinClases(`Sin clases programadas ese día (${fmtDate(day)})`);
            return;
        }
        onSelectDay(toDateStr(day), key);
    };

    // Construir grilla del mes (lun→dom)
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7)); // lunes previo
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        cells.push(d);
    }

    const monthLabel = firstDay.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-label={title || 'Historial de Clases'}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/60 to-transparent">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">{title || 'Historial de Clases'}</h3>
                            <p className="text-[11px] text-gray-500">{subtitle || 'Elige un día con clase programada'}</p>
                        </div>
                    </div>
                    <button aria-label="Cerrar"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5">
                    {/* Navegación de mes */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                            title="Mes anterior"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-bold text-gray-800 capitalize">{monthLabel}</span>
                        <button
                            type="button"
                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                            title="Mes siguiente"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Aviso de día sin clases */}
                    {sinClases && (
                        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                            <Info className="w-4 h-4 shrink-0" />
                            {sinClases}
                        </div>
                    )}

                    {/* Grilla del mes */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                        {WEEK_HEADER.map((h) => (
                            <div key={h} className="text-[10px] font-black text-gray-400 uppercase py-1">
                                {h}
                            </div>
                        ))}
                        {cells.map((day, idx) => {
                            const inMonth = day.getMonth() === month.getMonth();
                            const withClass = hasClassOn(day);
                            const isClickable = inMonth && withClass;
                            const isToday = toDateStr(day) === toDateStr(new Date());
                            const dayActCount = activitiesByDate.get(toDateStr(day)) || 0;

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    disabled={!isClickable}
                                    onClick={() => isClickable && handleDayClick(day)}
                                    className={`relative h-10 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center ${
                                        !inMonth
                                            ? 'text-gray-200 cursor-not-allowed opacity-25 select-none'
                                            : !withClass
                                            ? 'text-gray-300 opacity-40 cursor-not-allowed bg-gray-50/40 select-none'
                                            : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 hover:scale-105 cursor-pointer shadow-2xs font-extrabold'
                                    } ${isToday && withClass ? 'ring-2 ring-indigo-400' : ''}`}
                                    title={
                                        !withClass
                                            ? `Sin clase programada (${fmtDate(day)})`
                                            : `${fmtDate(day)}: Clase programada`
                                    }
                                >
                                    <span>{day.getDate()}</span>
                                    <div className="flex items-center gap-0.5 mt-0.5">
                                        {withClass && inMonth && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        )}
                                        {dayActCount > 0 && inMonth && withClass && (
                                            <span
                                                className="px-1 py-0.2 bg-blue-600 text-white text-[8px] font-black rounded-full"
                                                title={`${dayActCount} actividad(es) programadas`}
                                            >
                                                {dayActCount}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-[11px] text-gray-400">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                            <span>Días con clase</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-bold rounded-full inline-block">N</span>
                            <span>Total actividades</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
