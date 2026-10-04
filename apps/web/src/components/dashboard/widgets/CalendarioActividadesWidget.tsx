'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Bookmark, CalendarDays } from 'lucide-react';
import { useSchoolToday } from '@/hooks/useSchoolTime';

interface CalendarEvent {
    id: string;
    title: string;
    description?: string | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    scope?: string | null;
    isHoliday?: boolean;
}

interface PeriodInfo {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    daysLeft: number | null;
}

interface CalendarioActividadesProps {
    data?: {
        currentPeriod?: PeriodInfo | null;
        events: CalendarEvent[];
    };
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function toYMD(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function monthGrid(monthDate: Date): Date[] {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // lunes = 0
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= last || days.length % 7 !== 0) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

function formatoFechaCompleta(ymd: string): string {
    try {
        const [y, m, d] = ymd.split('-').map(Number);
        if (!y || !m || !d) return ymd;
        const fecha = new Date(y, m - 1, d);
        const str = fecha.toLocaleDateString('es-VE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
        return ymd;
    }
}

function formatoFechaDiaMes(ymd: string): string {
    try {
        const [y, m, d] = ymd.split('-').map(Number);
        if (!y || !m || !d) return ymd;
        const fecha = new Date(y, m - 1, d);
        const str = fecha.toLocaleDateString('es-VE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
        return str.charAt(0).toUpperCase() + str.slice(1);
    } catch {
        return ymd;
    }
}

export function CalendarioActividadesWidget({ data }: CalendarioActividadesProps) {
    const today = useSchoolToday();
    const [selectedDate, setSelectedDate] = useState<string>(today);

    const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
        const [y, m] = today.split('-').map(Number);
        return new Date(y || 2026, (m || 10) - 1, 1);
    });

    const events = data?.events ?? [];
    const currentPeriod = data?.currentPeriod ?? null;

    // Mapa de eventos por fecha
    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const ev of events) {
            map.set(ev.date, [...(map.get(ev.date) || []), ev]);
        }
        return map;
    }, [events]);

    const gridDays = useMemo(() => monthGrid(currentMonthDate), [currentMonthDate]);

    const handlePrevMonth = () => {
        setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleTodayMonth = () => {
        const [y, m] = today.split('-').map(Number);
        setCurrentMonthDate(new Date(y || 2026, (m || 10) - 1, 1));
        setSelectedDate(today);
    };

    const selectedEvents = eventsByDate.get(selectedDate) || [];
    const isSelectedHoliday = selectedEvents.some((e) => e.isHoliday);

    const fechaHoyTexto = formatoFechaCompleta(today);
    const fechaSeleccionadaTexto = formatoFechaDiaMes(selectedDate);
    const lapsoTexto = currentPeriod?.name || 'Lapso Activo';
    const lapsoCierreTexto =
        currentPeriod?.daysLeft !== null && currentPeriod?.daysLeft !== undefined
            ? `Cierre en ${currentPeriod.daysLeft} días`
            : null;

    const rawMesAno = currentMonthDate.toLocaleDateString('es-VE', {
        month: 'long',
        year: 'numeric',
    });
    const mesAnoTexto = rawMesAno.charAt(0).toUpperCase() + rawMesAno.slice(1);

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:shadow-sm">
            {/* Cabecera del Widget: Día, Mes, Año y Lapso Escolar Activo */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                        <Calendar className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">
                            {fechaHoyTexto}
                        </h3>
                        <p className="text-xs text-gray-500">Fecha institucional actual</p>
                    </div>
                </div>

                {/* Indicador del Lapso en el que estamos */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-800 border border-violet-200">
                        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                        {lapsoTexto}
                    </span>
                    {lapsoCierreTexto && (
                        <span className="hidden sm:inline-block text-xs font-semibold text-violet-700 bg-violet-100/70 px-2 py-0.5 rounded-md">
                            {lapsoCierreTexto}
                        </span>
                    )}
                </div>
            </div>

            {/* Contenido: 1. Calendario a ancho completo */}
            <div className="space-y-2">
                {/* Navegación del Mes */}
                <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900">
                            {mesAnoTexto}
                        </span>
                        <button
                            type="button"
                            onClick={handleTodayMonth}
                            className="rounded px-1.5 py-0.5 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors"
                        >
                            Ir a hoy
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            aria-label="Mes anterior"
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            aria-label="Mes siguiente"
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Días de la semana */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-600">
                    {WEEKDAYS.map((wd) => (
                        <span key={wd}>{wd}</span>
                    ))}
                </div>

                {/* Rejilla de días del mes */}
                <div className="grid grid-cols-7 gap-1">
                    {gridDays.map((dateObj, i) => {
                        const ymd = toYMD(dateObj);
                        const isCurrentMonth = dateObj.getMonth() === currentMonthDate.getMonth();
                        const isToday = ymd === today;
                        const isSelected = ymd === selectedDate;
                        const dayEvents = eventsByDate.get(ymd) || [];
                        const hasHoliday = dayEvents.some((e) => e.isHoliday);
                        const hasEvent = dayEvents.length > 0;

                        return (
                            <button
                                key={`${ymd}-${i}`}
                                type="button"
                                onClick={() => setSelectedDate(ymd)}
                                className={`relative flex h-8 w-full flex-col items-center justify-center rounded-lg text-xs transition-all ${
                                    isSelected
                                        ? 'bg-violet-600 font-bold text-white shadow-xs'
                                        : isToday
                                        ? 'border border-violet-400 font-bold text-violet-900 bg-violet-50'
                                        : isCurrentMonth
                                        ? 'text-gray-800 hover:bg-gray-100 hover:shadow-2xs'
                                        : 'text-gray-500'
                                }`}
                            >
                                <span>{dateObj.getDate()}</span>
                                {hasEvent && !isSelected && (
                                    <span
                                        className={`absolute bottom-1 h-1 w-1 rounded-full ${
                                            hasHoliday ? 'bg-rose-500' : 'bg-violet-600'
                                        }`}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. Actividades del Día Seleccionado (abajo del calendario) */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-gray-200/60 pb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-3.5 w-3.5 text-violet-600 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-bold text-gray-900 truncate">
                            {fechaSeleccionadaTexto}
                        </span>
                    </div>
                    {selectedDate === today && (
                        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                            Hoy
                        </span>
                    )}
                </div>

                {isSelectedHoliday && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-medium text-rose-800">
                        Día sin clases / Feriado institucional
                    </div>
                )}

                {/* Lista de actividades o aviso compacto */}
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-0.5">
                    {selectedEvents.length === 0 ? (
                        <p className="py-1.5 text-center text-xs text-gray-500">
                            No hay actividades programadas para este día.
                        </p>
                    ) : (
                        selectedEvents.map((ev) => (
                            <div
                                key={ev.id}
                                className="flex items-start justify-between gap-2 rounded-lg border border-gray-200/70 bg-white p-2 text-xs shadow-2xs"
                            >
                                <div className="min-w-0">
                                    <p className="font-bold text-gray-900 truncate">{ev.title}</p>
                                    {ev.startTime && (
                                        <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                                            <Clock className="h-3 w-3" />
                                            {ev.startTime} {ev.endTime ? `- ${ev.endTime}` : ''}
                                        </p>
                                    )}
                                </div>
                                {ev.scope && (
                                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700 uppercase">
                                        {ev.scope}
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default CalendarioActividadesWidget;
