'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Coffee, Loader2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import {
    toYMD,
    useCreateEvent,
    useDeleteEvent,
    useEventDay,
    useEventsRange,
    EventScope,
    SchoolEvent,
} from '@/hooks/useSchoolEvents';
import EventModal from '@/components/events/EventModal';
import type { Period } from '@/utils/schedule.utils';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    return aStart < bEnd && bStart < aEnd;
}

function scopeLabel(e: SchoolEvent) {
    if (e.scope === 'INSTITUTE') return 'Todo el liceo';
    if (e.scope === 'GRADES') return e.grades.map((g) => `${g}°`).join(', ') + ' año';
    return `${e.classroomIds.length} ${e.classroomIds.length === 1 ? 'sección' : 'secciones'}`;
}

/** Semanas del mes, empezando en lunes, con los días de relleno de los meses vecinos. */
function monthGrid(month: Date): Date[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // lunes = 0
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= last || days.length % 7 !== 0) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

export default function EventosPage() {
    // El día del liceo, no el del aparato (RELOJ-01).
    const today = useSchoolToday();
    const [month, setMonth] = useState(() => {
        const [y, m] = today.split('-').map(Number);
        return new Date(y, m - 1, 1);
    });
    const [selectedDate, setSelectedDate] = useState<string>(today);
    const [modalPeriod, setModalPeriod] = useState<Period | null>(null);

    const confirmDialog = useConfirm();
    const days = useMemo(() => monthGrid(month), [month]);
    const rangeFrom = toYMD(days[0]);
    const rangeTo = toYMD(days[days.length - 1]);

    const { data: monthEvents = [] } = useEventsRange(rangeFrom, rangeTo);
    const { data: day, isLoading: isLoadingDay, error: dayError } = useEventDay(selectedDate);
    const { periods, isLoading: isLoadingPeriods } = useSchedulePeriods();
    const createEvent = useCreateEvent();
    const deleteEvent = useDeleteEvent();

    const eventsByDate = useMemo(() => {
        const map = new Map<string, SchoolEvent[]>();
        for (const e of monthEvents) {
            map.set(e.date, [...(map.get(e.date) ?? []), e]);
        }
        return map;
    }, [monthEvents]);

    const classPeriods = periods.filter((p) => p.type !== 'break');

    const handleCreate = async (payload: {
        title: string;
        description: string;
        startTime: string;
        endTime: string;
        scope: EventScope;
        grades: number[];
        classroomIds: string[];
    }) => {
        try {
            const res = await createEvent.mutateAsync({ ...payload, date: selectedDate });
            toast.success(
                res.suspendedSessions > 0
                    ? `Evento creado. Se suspendieron ${res.suspendedSessions} clases.`
                    : 'Evento creado. No había clases en esa franja.'
            );
            setModalPeriod(null);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'No se pudo crear el evento');
        }
    };

    const handleDelete = async (event: SchoolEvent) => {
        const ok = await confirmDialog({
            title: 'Eliminar evento',
            description: `Se eliminará "${event.title}" y se reactivarán las clases que suspendió. Las clases que un profesor suspendió por su cuenta no se tocan.`,
            confirmLabel: 'Eliminar',
        });
        if (!ok) return;
        try {
            const res = await deleteEvent.mutateAsync(event.id);
            toast.success(`Evento eliminado. Se reactivaron ${res.revertedSessions} clases.`);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'No se pudo eliminar el evento');
        }
    };

    const selectedLabel = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date(`${selectedDate}T12:00:00`));

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <CalendarDays className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Eventos del Liceo</h1>
                        <p className="text-blue-100 text-sm mt-0.5">
                            Elige un día, pasa el ratón por un bloque para ver qué clases hay y haz clic para crear
                            un evento. Las clases de esa franja se suspenden.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
                {/* Mes */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <h2 className="text-base font-bold text-gray-800 capitalize">
                            {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(month)}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {WEEKDAYS.map((w) => (
                            <div key={w} className="text-center text-[11px] font-bold text-gray-400 uppercase py-1">
                                {w}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map((d) => {
                            const ymd = toYMD(d);
                            const inMonth = d.getMonth() === month.getMonth();
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            const isSelected = ymd === selectedDate;
                            const isToday = ymd === today;
                            const dayEvents = eventsByDate.get(ymd) ?? [];

                            return (
                                <button
                                    key={ymd}
                                    type="button"
                                    onClick={() => setSelectedDate(ymd)}
                                    className={`min-h-[76px] flex flex-col items-stretch p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                                        isSelected
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-100 hover:border-indigo-200 hover:bg-gray-50'
                                    } ${!inMonth ? 'opacity-40' : ''} ${isWeekend && !isSelected ? 'bg-gray-50/70' : ''}`}
                                >
                                    <span
                                        className={`text-xs font-semibold self-end w-6 h-6 flex items-center justify-center rounded-full ${
                                            isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'
                                        }`}
                                    >
                                        {d.getDate()}
                                    </span>
                                    <div className="mt-0.5 space-y-0.5">
                                        {dayEvents.slice(0, 2).map((e) => (
                                            <div
                                                key={e.id}
                                                className="text-[10px] leading-tight font-medium text-amber-900 bg-amber-100 rounded px-1 py-0.5 truncate"
                                            >
                                                {e.startTime} {e.title}
                                            </div>
                                        ))}
                                        {dayEvents.length > 2 && (
                                            <div className="text-[10px] text-gray-500 px-1">
                                                +{dayEvents.length - 2} más
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Día */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <h2 className="text-base font-bold text-gray-800 capitalize">{selectedLabel}</h2>
                    <p className="text-xs text-gray-500 mb-4">
                        {day ? `Ciclo ${day.academicYear.name}` : ' '}
                    </p>

                    {day && day.events.length > 0 && (
                        <div className="space-y-2 mb-4">
                            {day.events.map((e) => (
                                <div
                                    key={e.id}
                                    className="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-amber-900 truncate">{e.title}</div>
                                        <div className="text-[11px] text-amber-800">
                                            {e.startTime}–{e.endTime} · {scopeLabel(e)}
                                            {typeof e.suspendedCount === 'number' &&
                                                ` · ${e.suspendedCount} clases suspendidas`}
                                        </div>
                                        {e.description && (
                                            <div className="text-[11px] text-amber-700 mt-0.5 line-clamp-2">
                                                {e.description}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(e)}
                                        disabled={deleteEvent.isPending}
                                        title="Eliminar evento"
                                        className="p-1.5 rounded-md text-red-500 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {(isLoadingDay || isLoadingPeriods) && (
                        <div className="py-12 flex items-center justify-center text-gray-500 text-sm">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Cargando día…
                        </div>
                    )}

                    {dayError && !isLoadingDay && (
                        <div className="py-8 text-center text-sm text-red-600">
                            {(dayError as any)?.response?.data?.error || 'No se pudo cargar el día'}
                        </div>
                    )}

                    {day && !isLoadingPeriods && (
                        <div className="space-y-1.5">
                            {periods.map((period) => {
                                if (period.type === 'break') {
                                    return (
                                        <div
                                            key={period.id}
                                            className="flex items-center justify-center gap-2 py-1.5 text-[11px] text-gray-400 bg-gray-50 rounded-lg"
                                        >
                                            <Coffee size={12} />
                                            {period.label} ({period.startTime}–{period.endTime})
                                        </div>
                                    );
                                }

                                const classes = day.classes.filter((c) =>
                                    overlaps(c.startTime, c.endTime, period.startTime, period.endTime)
                                );
                                const covering = day.events.filter((e) =>
                                    overlaps(e.startTime, e.endTime, period.startTime, period.endTime)
                                );

                                return (
                                    <div key={period.id} className="relative group">
                                        <button
                                            type="button"
                                            onClick={() => setModalPeriod(period)}
                                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                                                covering.length > 0
                                                    ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'
                                                    : 'border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/40'
                                            }`}
                                        >
                                            <div className="w-16 shrink-0">
                                                <div className="text-[10px] font-bold text-gray-400 uppercase">
                                                    {period.label}
                                                </div>
                                                <div className="text-xs font-semibold text-gray-700">
                                                    {period.startTime}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {covering.length > 0 ? (
                                                    <span className="text-xs font-semibold text-amber-800 truncate block">
                                                        {covering.map((e) => e.title).join(' · ')}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">
                                                        Clic para crear un evento
                                                    </span>
                                                )}
                                            </div>
                                            <span
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                    classes.length > 0
                                                        ? 'bg-indigo-100 text-indigo-700'
                                                        : 'bg-gray-100 text-gray-400'
                                                }`}
                                            >
                                                <Users size={11} />
                                                {classes.length}
                                            </span>
                                        </button>

                                        {/* Al pasar el ratón: qué clases hay en ese bloque */}
                                        {classes.length > 0 && (
                                            <div className="pointer-events-none absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                                                <div className="text-[11px] font-bold text-gray-500 uppercase mb-2">
                                                    {classes.length} {classes.length === 1 ? 'clase' : 'clases'} ·{' '}
                                                    {period.startTime}–{period.endTime}
                                                </div>
                                                <ul className="max-h-56 overflow-y-auto space-y-1">
                                                    {classes.map((c) => (
                                                        <li
                                                            key={c.blockId}
                                                            className="flex items-start gap-2 text-[11px] leading-snug"
                                                        >
                                                            <span
                                                                className="mt-1 w-2 h-2 rounded-full shrink-0"
                                                                style={{ backgroundColor: c.subjectColor || '#6366f1' }}
                                                            />
                                                            <span className="min-w-0">
                                                                <strong className="text-gray-900">{c.classroomName}</strong>
                                                                <span className="text-gray-600"> · {c.subjectName}</span>
                                                                <span className="block text-gray-400">
                                                                    {c.teacherName || 'Sin profesor asignado'}
                                                                </span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {day && (
                <EventModal
                    open={Boolean(modalPeriod)}
                    day={day}
                    startPeriod={modalPeriod}
                    classPeriods={classPeriods}
                    isSaving={createEvent.isPending}
                    onClose={() => setModalPeriod(null)}
                    onCreate={handleCreate}
                />
            )}
        </div>
    );
}
