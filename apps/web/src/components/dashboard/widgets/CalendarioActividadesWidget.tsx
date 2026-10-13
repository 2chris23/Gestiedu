'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Bookmark, Clock } from 'lucide-react';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { esDiaEntero } from '@/hooks/useSchoolEvents';
import { LoDeHoy } from '@/components/dashboard/LoDeHoy';
import { cn } from '@/lib/utils';

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
    className?: string;
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

export function CalendarioActividadesWidget({ data, className }: CalendarioActividadesProps) {
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

    const delDia = eventsByDate.get(selectedDate) || [];

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

    const cuantosHoy = (eventsByDate.get(today) || []).length;

    return (
        <section
            aria-labelledby="calendario-del-liceo"
            className={cn(
                'flex flex-col justify-between rounded-[28px] bg-white p-4 lateral:p-5 shadow-[0_1px_2px_rgba(13,71,161,0.06),0_8px_24px_rgba(13,71,161,0.05)]',
                className
            )}
        >
            {/* Cabecera: el mes que se mira y el lapso en el que estamos */}
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-cabecera-claro text-cabecera-tinta">
                        <Calendar className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <h3 id="calendario-del-liceo" className="truncate text-base font-extrabold text-texto-fuerte">
                            {mesAnoTexto}
                        </h3>
                        <p className="truncate text-[11px] text-texto-gris">Eventos y días sin clases</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cabecera-claro px-2.5 py-1 text-[11px] font-bold text-cabecera-tinta">
                        <Bookmark className="h-3 w-3" aria-hidden="true" />
                        {lapsoTexto}
                    </span>
                    {lapsoCierreTexto && (
                        <span className="rounded-full bg-[var(--acento-suave)] px-2.5 py-1 text-[11px] font-bold text-[var(--acento-hondo)]">
                            {lapsoCierreTexto}
                        </span>
                    )}
                </div>
            </div>

            {/* Ir a hoy y los meses */}
            <div className="flex items-center justify-between border-t border-borde-suave pt-2.5 shrink-0">
                <button
                    type="button"
                    onClick={handleTodayMonth}
                    className="-ml-1.5 min-h-[32px] rounded-full px-2 text-xs font-bold text-cabecera-tinta transition-colors hover:bg-cabecera-claro"
                >
                    Ir a hoy
                </button>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={handlePrevMonth}
                        aria-label="Mes anterior"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-borde-suave bg-white text-texto-medio transition-colors hover:bg-superficie active:scale-[0.97]"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                        type="button"
                        onClick={handleNextMonth}
                        aria-label="Mes siguiente"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-borde-suave bg-white text-texto-medio transition-colors hover:bg-superficie active:scale-[0.97]"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            </div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 text-center shrink-0 pt-1 pb-0.5">
                {WEEKDAYS.map((wd) => (
                    <span key={wd} className="text-xs font-bold text-texto-gris">
                        {wd}
                    </span>
                ))}
            </div>

            {/* El mes. Las filas tienen su alto: estiradas a toda la tarjeta, cada
                semana medía 100 px y el mes parecía vacío. Lo que sobra es para
                lo del día elegido, debajo. */}
            <div className="grid shrink-0 grid-cols-7 auto-rows-[44px] text-center lateral:auto-rows-[50px]">
                {gridDays.map((dateObj, i) => {
                    const ymd = toYMD(dateObj);
                    const isCurrentMonth = dateObj.getMonth() === currentMonthDate.getMonth();
                    const isToday = ymd === today;
                    const isSelected = ymd === selectedDate;
                    const finDeSemana = i % 7 >= 5;
                    const dayEvents = eventsByDate.get(ymd) || [];
                    const hasHoliday = dayEvents.some((e) => e.isHoliday);

                    return (
                        <div key={`${ymd}-${i}`} className="flex items-center justify-center">
                            <button
                                type="button"
                                onClick={() => setSelectedDate(ymd)}
                                aria-pressed={isSelected}
                                aria-label={`${formatoFechaDiaMes(ymd)}${dayEvents.length ? `, ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}` : ''}`}
                                className={`relative flex h-9 w-9 lateral:h-10 lateral:w-10 items-center justify-center rounded-xl text-xs lateral:text-sm transition-colors ${
                                    isToday
                                        ? 'bg-[var(--acento)] font-extrabold text-[var(--sobre-acento)] shadow-sm'
                                        : isSelected
                                        ? 'font-bold text-texto-fuerte ring-2 ring-inset ring-cabecera-tinta bg-cabecera-claro/50'
                                        : !isCurrentMonth
                                        ? 'text-texto-gris hover:bg-superficie'
                                        : finDeSemana
                                        ? 'text-texto-gris hover:bg-superficie'
                                        : 'font-medium text-texto-fuerte hover:bg-superficie'
                                }`}
                            >
                                {dateObj.getDate()}
                                {dayEvents.length > 0 && (
                                    <span
                                        aria-hidden
                                        className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                                            hasHoliday ? 'bg-rose-500' : isToday ? 'bg-[var(--sobre-acento)]' : 'bg-cabecera-tinta'
                                        }`}
                                    />
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Lo del día elegido: el hueco que queda bajo el mes. */}
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-borde-suave pt-2.5">
                <p className="text-xs font-bold text-texto-gris">{formatoFechaDiaMes(selectedDate)}</p>
                {delDia.length === 0 ? (
                    <p className="mt-1 text-sm text-texto-gris">Sin eventos este día.</p>
                ) : (
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                        {delDia.map((ev) => (
                            <li
                                key={ev.id}
                                className={cn(
                                    'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm',
                                    ev.isHoliday ? 'bg-rose-50 text-rose-900' : 'bg-superficie text-texto-fuerte'
                                )}
                            >
                                <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', ev.isHoliday ? 'bg-rose-500' : 'bg-cabecera-tinta')} />
                                <span className="min-w-0 flex-1 truncate font-semibold">{ev.title}</span>
                                {ev.startTime && (
                                    <span className="flex shrink-0 items-center gap-1 text-xs text-texto-gris">
                                        <Clock className="h-3 w-3" aria-hidden />
                                        {ev.endTime && esDiaEntero({ startTime: ev.startTime, endTime: ev.endTime })
                                            ? 'Todo el día'
                                            : `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}`}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Franja inferior: Lo de hoy */}
            <div className="shrink-0 pt-2">
                <LoDeHoy
                    cantidad={cuantosHoy}
                    una="actividad"
                    varias="actividades"
                    detalle={[formatoFechaDiaMes(today), currentPeriod?.name].filter(Boolean).join(' · ')}
                    href="/dashboard/eventos"
                />
            </div>
        </section>
    );
}

export default CalendarioActividadesWidget;
