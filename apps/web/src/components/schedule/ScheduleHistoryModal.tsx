'use client';

import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X, Info } from 'lucide-react';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';

interface Props {
    schedule: ScheduleBlock[];
    onSelectDay: (dateStr: string, dayKey: string) => void;
    onClose: () => void;
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
 * Días sin clase (fin de semana o sin bloques) muestran el aviso
 * "Sin clases programadas ese día" y no salen del modal.
 */
export default function ScheduleHistoryModal({ schedule, onSelectDay, onClose }: Props) {
    const [month, setMonth] = useState(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), 1);
    });
    const [sinClases, setSinClases] = useState<string | null>(null);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/60 to-transparent">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Historial de Clases</h3>
                            <p className="text-[11px] text-gray-500">Elige un día para ver su horario</p>
                        </div>
                    </div>
                    <button
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
                            const isToday = toDateStr(day) === toDateStr(new Date());
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleDayClick(day)}
                                    className={`relative h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                                        !inMonth
                                            ? 'text-gray-300 hover:bg-gray-50'
                                            : withClass
                                            ? 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 hover:scale-105'
                                            : 'text-gray-600 hover:bg-gray-100'
                                    } ${isToday ? 'ring-2 ring-indigo-400' : ''}`}
                                >
                                    {day.getDate()}
                                    {withClass && (
                                        <span className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-500" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                        Días con clase
                    </div>
                </div>
            </div>
        </div>
    );
}
