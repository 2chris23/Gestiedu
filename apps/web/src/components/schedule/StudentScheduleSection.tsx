'use client';

import React, { useMemo } from 'react';
import {
    Calendar, Clock, Coffee, Edit, Search, MapPin, User,
    ChevronLeft, ChevronRight, ListTodo, BookOpen, CalendarDays
} from 'lucide-react';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { DescargarHorario } from '@/components/schedule/DescargarHorario';
import { useClassReplacements } from '@/hooks/useClassReplacements';
import ScheduleCalendarModal from '@/components/modals/ScheduleCalendarModal';
import ScheduleHistoryModal from '@/components/schedule/ScheduleHistoryModal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import { useLiveOverview, LiveOverviewSubject } from '@/hooks/useLiveClass';
import { ClaseDelAlumnoDialogo } from '@/components/schedule/ClaseDelAlumnoDialogo';
import { useArrastrarParaDesplazar } from '@/hooks/useArrastrarParaDesplazar';
import TurnoBadge from '@/components/common/TurnoBadge';
import { turnoDeLaHora } from '@/lib/turnos';
import { toLocalYMD } from '@/utils/date.utils';
import { useSchoolToday } from '@/hooks/useSchoolTime';

interface Props {
    schedule: ScheduleBlock[];
    role: 'student' | 'teacher';
    showActions?: boolean;
    classroomId?: string;
    editUrl?: string;
    /** Lo que encabeza el horario descargado: la sección, o el nombre de la persona. */
    titulo?: string;
    subtitulo?: string;
    /** Horario de un profesor: para enseñar las clases que cubre como reemplazo. */
    teacherId?: string;
}

// Días de la semana laborables
import HorarioPorDias from '@/components/schedule/HorarioPorDias';

const WORKING_DAYS = [
    { key: 'Lun', label: 'Lunes', fullLabel: 'lunes' },
    { key: 'Mar', label: 'Martes', fullLabel: 'martes' },
    { key: 'Mié', label: 'Miércoles', fullLabel: 'miércoles' },
    { key: 'Jue', label: 'Jueves', fullLabel: 'jueves' },
    { key: 'Vie', label: 'Viernes', fullLabel: 'viernes' },
];

// Paleta de estilos modernos para materias
const MODERN_SUBJECT_STYLES = [
    {
        bg: 'bg-amber-50/90 hover:bg-amber-100/80',
        border: 'border-amber-200/90 border-l-amber-500',
        text: 'text-amber-950',
        subtext: 'text-amber-700',
        badge: 'bg-amber-200/70 text-amber-800',
    },
    {
        bg: 'bg-sky-50/90 hover:bg-sky-100/80',
        border: 'border-sky-200/90 border-l-sky-500',
        text: 'text-sky-950',
        subtext: 'text-sky-700',
        badge: 'bg-sky-200/70 text-sky-800',
    },
    {
        bg: 'bg-emerald-50/90 hover:bg-emerald-100/80',
        border: 'border-emerald-200/90 border-l-emerald-500',
        text: 'text-emerald-950',
        subtext: 'text-emerald-700',
        badge: 'bg-emerald-200/70 text-emerald-800',
    },
    {
        bg: 'bg-purple-50/90 hover:bg-purple-100/80',
        border: 'border-purple-200/90 border-l-purple-500',
        text: 'text-purple-950',
        subtext: 'text-purple-700',
        badge: 'bg-purple-200/70 text-purple-800',
    },
    {
        bg: 'bg-rose-50/90 hover:bg-rose-100/80',
        border: 'border-rose-200/90 border-l-rose-500',
        text: 'text-rose-950',
        subtext: 'text-rose-700',
        badge: 'bg-rose-200/70 text-rose-800',
    },
    {
        bg: 'bg-indigo-50/90 hover:bg-indigo-100/80',
        border: 'border-indigo-200/90 border-l-indigo-500',
        text: 'text-indigo-950',
        subtext: 'text-indigo-700',
        badge: 'bg-indigo-200/70 text-indigo-800',
    },
    {
        bg: 'bg-teal-50/90 hover:bg-teal-100/80',
        border: 'border-teal-200/90 border-l-teal-500',
        text: 'text-teal-950',
        subtext: 'text-teal-700',
        badge: 'bg-teal-200/70 text-teal-800',
    },
];

export default function StudentScheduleSection({ schedule, role, showActions = false, classroomId, editUrl, titulo = 'Horario semanal', subtitulo, teacherId }: Props) {
    const [viewMode, setViewMode] = React.useState<'day' | 'week'>('day');
    const [isCalendarModalOpen, setIsCalendarModalOpen] = React.useState(false);
    /**
     * EL TURNO MANDA EN LAS HORAS
     *
     * Una sección de la tarde empieza a la una, no a las siete. Si se pintan
     * las horas de la mañana, el horario sale vacío: las clases caen fuera de
     * todos los bloques. El turno sale de la propia sección; si no se sabe
     * todavía, de la hora del primer bloque que tenga.
     */
    const turnoDeLosBloques = React.useMemo(
        () => (schedule.length ? turnoDeLaHora([...schedule].sort((a, b) => a.startTime.localeCompare(b.startTime))[0].startTime) : 'MANANA'),
        [schedule]
    );
    const router = useRouter();

    // El carril de bloques: se arrastra con el ratón, además de las flechas.
    const { ref: carouselRef, arrastrando } = useArrastrarParaDesplazar<HTMLDivElement>();

    // Get current day and time
    const now = new Date();
    const currentDayIndex = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);
    // 'Hoy' según el liceo, no según el reloj del dispositivo
    const todayDateStr = useSchoolToday();

    // ============================================================
    // FASE 3.5 PARTE B — HISTORIAL: la vista "Hoy" queda PARAMETRIZADA por
    // dayViewKey (día a mostrar). El botón "Hoy" vuelve al día actual; el
    // modal de Historial selecciona cualquier día pasado/futuro y la MISMA
    // vista se renderiza para esa fecha (sin duplicar componentes).
    // ============================================================
    const initialDayKey = (currentDayIndex === 0 || currentDayIndex === 6)
        ? 'Lun'
        : WORKING_DAYS[currentDayIndex - 1]?.key || 'Lun';
    const [dayViewKey, setDayViewKey] = React.useState<string>(initialDayKey);
    const [histDate, setHistDate] = React.useState<string | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

    // ============================================================
    // CORRECCIÓN (Bug 1): resolución de la fecha real del día del bloque.
    // Antes, handleClassClick enviaba SIEMPRE todayDateStr en el query
    // `?date=...`, por lo que al hacer clic en un bloque de viernes/lunes se
    // abría la Clase en Vivo de la fecha de HOY (p.ej. click en el bloque de
    // Matemática del viernes → Clase en Vivo del martes 25/08/2026).
    // Ahora se deriva la fecha concreta del bloque desde la semana actual
    // (lunes→viernes), p.ej. bloque 'Vie' → 2026-08-28 si hoy es 2026-08-25.
    // ============================================================
    const getDateForDayKey = (dayKey: string): string => {
        const dayIndex = WORKING_DAYS.findIndex(d => d.key === dayKey);
        if (dayIndex < 0) return todayDateStr;
        // Lunes de la semana actual a mediodía local (evita drift UTC/DST)
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        monday.setHours(12, 0, 0, 0);
        const target = new Date(monday);
        target.setDate(monday.getDate() + dayIndex);
        return target.toISOString().split('T')[0];
    };

    // Tema generador y actividades por materia para el horario en vivo.
    // Lo pide también el alumno: es SU sección (lo comprueba el servidor).
    const activeOverviewDate = histDate || todayDateStr;
    const { data: liveOverview } = useLiveOverview(classroomId || '', activeOverviewDate);
    const turno = liveOverview?.shift ?? turnoDeLosBloques;
    const { periods: dynamicPeriods, isLoading } = useSchedulePeriods(turno === 'INTEGRAL' ? 'MANANA' : turno);

    /**
     * ENTRAR A UNA CLASE
     *
     * El profesor va a la Clase en Vivo, donde trabaja. El alumno —y quien mira
     * su horario— abre la ficha de esa hora: tema, qué hay que hacer y su nota.
     * Antes el bloque no respondía a nadie que no fuera profesor y el alumno se
     * quedaba mirando una tarjeta muerta.
     */
    const [claseAbierta, setClaseAbierta] = React.useState<
        (ScheduleBlock & { reemplazaA?: string; classroomIdDeLaClase?: string }) | null
    >(null);

    const handleClassClick = (
        classItem: (ScheduleBlock & { reemplazaA?: string; classroomIdDeLaClase?: string }) | null
    ) => {
        if (!classItem?.subjectId) return;
        const seccion = classItem.classroomIdDeLaClase ?? classItem.classroomId ?? classroomId;
        if (!seccion) return;

        if (role === 'teacher') {
            const blockDate = (viewMode === 'day' && histDate) ? histDate : getDateForDayKey(classItem.day || '');
            router.push(
                `/dashboard/clase-en-vivo/${seccion}/${classItem.subjectId}?date=${blockDate}&start=${encodeURIComponent(classItem.startTime)}&end=${encodeURIComponent(classItem.endTime)}`
            );
            return;
        }

        setClaseAbierta(classItem);
    };

    // Scroll por bloque completo en el carrusel
    const scrollByBlock = (direction: 'prev' | 'next') => {
        if (!carouselRef.current) return;
        const container = carouselRef.current;
        // Ancho de un bloque más el gap
        const firstChild = container.firstElementChild as HTMLElement;
        const blockWidth = firstChild ? firstChild.offsetWidth + 12 : 220;
        container.scrollBy({
            left: direction === 'next' ? blockWidth : -blockWidth,
            behavior: 'smooth',
        });
    };

    // Determinar el día a mostrar
    const getDisplayDay = () => {
        if (currentDayIndex === 0 || currentDayIndex === 6) return 'Lun';
        return WORKING_DAYS[currentDayIndex - 1]?.key || 'Lun';
    };

    const displayDayKey = dayViewKey;
    const displayDay = WORKING_DAYS.find((d) => d.key === displayDayKey) || WORKING_DAYS[0];
    const isWeekend = currentDayIndex === 0 || currentDayIndex === 6;

    // Etiqueta del día mostrado: fecha histórica seleccionada o "Hoy"
    const histLabel = histDate
        ? `${displayDay.fullLabel}, ${histDate.split('-').reverse().join('/')}`
        : isWeekend
        ? `Próximo día: ${displayDay.fullLabel}`
        : `Hoy, ${displayDay.fullLabel}`;

    // Horario de hoy para la vista diaria
    const todaySchedule = schedule.filter((s) => s.day === displayDayKey);

    /**
     * REEMPLAZOS DE ESE DÍA
     *
     * Si el admin suspendió una clase y puso otra materia en su lugar, el
     * carril enseña la que SE DA, no la del horario semanal, con una marca de a
     * quién reemplaza. En el horario de un profesor aparecen además las clases
     * que cubre en otras secciones.
     */
    const fechaDelDia = histDate || getDateForDayKey(displayDayKey);
    const { data: reemplazos = [] } = useClassReplacements({
        classroomId: teacherId ? undefined : classroomId,
        teacherId,
        fecha: viewMode === 'day' ? fechaDelDia : undefined,
    });

    // Timeline para vista diaria ("Hoy")
    const timeline = dynamicPeriods.map((period) => {
        if (period.type === 'break') {
            return {
                ...period,
                isBreak: true,
                class: null,
            };
        }

        const classItem = todaySchedule.find(
            (c) =>
                c.startTime === period.startTime ||
                (c.startTime >= period.startTime && c.startTime < period.endTime)
        );

        const reemplazo = reemplazos.find(
            (r) => r.startTime >= period.startTime && r.startTime < period.endTime
        );
        const clase = reemplazo
            ? {
                  day: displayDayKey,
                  startTime: reemplazo.startTime,
                  endTime: reemplazo.endTime,
                  subject: reemplazo.subject.name,
                  subjectId: reemplazo.subject.id,
                  color: reemplazo.subject.color || classItem?.color,
                  location: reemplazo.classroom.name,
                  detail: `Prof. ${reemplazo.teacher.firstName} ${reemplazo.teacher.lastName}`,
                  reemplazaA: reemplazo.suspendedSubject.name,
                  classroomIdDeLaClase: reemplazo.classroom.id,
              }
            : classItem;

        return {
            ...period,
            isBreak: false,
            class: (clase || null) as (ScheduleBlock & { reemplazaA?: string; classroomIdDeLaClase?: string }) | null,
        };
    });

    const getPeriodStatus = (startTime: string, endTime: string) => {
        if (histDate) {
            // Día histórico: pasado → "past", futuro → "upcoming" (según la fecha)
            return histDate < todayDateStr ? 'past' : 'upcoming';
        }
        if (isWeekend) return 'upcoming';
        if (currentTime >= startTime && currentTime < endTime) return 'current';
        if (currentTime >= endTime) return 'past';
        return 'upcoming';
    };

    // El carril arranca en la hora que va (o la siguiente), no en la primera
    // de la mañana: a las diez nadie viene a ver la clase de las siete.
    const primeraQueQueda = timeline.findIndex((p) => getPeriodStatus(p.startTime, p.endTime) !== 'past');
    React.useEffect(() => {
        if (viewMode !== 'day' || primeraQueQueda <= 0) return;
        const carril = carouselRef.current;
        const ficha = carril?.children[primeraQueQueda] as HTMLElement | undefined;
        if (carril && ficha) carril.scrollTo({ left: ficha.offsetLeft - carril.offsetLeft, behavior: 'auto' });
    }, [viewMode, primeraQueQueda, timeline.length, carouselRef]);

    // Mapeo consistente de estilo moderno por materia
    const subjectStyleMap = useMemo(() => {
        const map: Record<string, typeof MODERN_SUBJECT_STYLES[0]> = {};
        let colorIdx = 0;

        schedule.forEach((s) => {
            const key = (s.subject || '').trim().toLowerCase();
            if (key && !map[key]) {
                map[key] = MODERN_SUBJECT_STYLES[colorIdx % MODERN_SUBJECT_STYLES.length];
                colorIdx++;
            }
        });

        return map;
    }, [schedule]);

    // ─────────────────────────────────────────────────────────────────────────
    // MATRIZ COMPACTA Y MODERNA (HORAS × DÍAS CON ROWSPAN)
    // ─────────────────────────────────────────────────────────────────────────
    const matrixData = useMemo(() => {
        const sortedPeriods = [...dynamicPeriods].sort((a, b) => a.startTime.localeCompare(b.startTime));

        const coveredPeriods: Record<string, Set<number>> = {
            Lun: new Set(),
            Mar: new Set(),
            Mié: new Set(),
            Jue: new Set(),
            Vie: new Set(),
        };

        const rows = sortedPeriods.map((period, periodIdx) => {
            const isBreak = period.type === 'break';

            if (isBreak) {
                return {
                    period,
                    isBreak: true,
                    cells: [],
                };
            }

            const cells = WORKING_DAYS.map((day) => {
                if (coveredPeriods[day.key]?.has(periodIdx)) {
                    return { type: 'spanned', dayKey: day.key };
                }

                const classItem = schedule.find(
                    (s) =>
                        s.day === day.key &&
                        (s.startTime === period.startTime ||
                            (s.startTime <= period.startTime && s.endTime > period.startTime))
                );

                if (!classItem) {
                    return { type: 'empty', dayKey: day.key, rowSpan: 1 };
                }

                // Calcular bloques consecutivos de la misma materia
                let span = 1;
                for (let nextIdx = periodIdx + 1; nextIdx < sortedPeriods.length; nextIdx++) {
                    const nextPeriod = sortedPeriods[nextIdx];
                    if (nextPeriod.type === 'break') break;

                    const nextClass = schedule.find(
                        (s) => s.day === day.key && s.startTime === nextPeriod.startTime
                    );

                    const isSameSection =
                        nextClass &&
                        ((classItem.location && nextClass.location)
                            ? classItem.location === nextClass.location
                            : (classItem.detail && nextClass.detail)
                                ? classItem.detail === nextClass.detail
                                : true);

                    const isSameContiguous =
                        Boolean(nextClass) &&
                        ((nextClass?.subjectId && classItem.subjectId && nextClass.subjectId === classItem.subjectId) ||
                            nextClass?.subject.trim().toLowerCase() === classItem.subject.trim().toLowerCase()) &&
                        isSameSection;

                    const isCoveredBySameBlock = classItem.endTime > nextPeriod.startTime;

                    if (isSameContiguous || isCoveredBySameBlock) {
                        span++;
                        coveredPeriods[day.key].add(nextIdx);
                    } else {
                        break;
                    }
                }

                return {
                    type: 'class',
                    dayKey: day.key,
                    classItem,
                    rowSpan: span,
                };
            });

            return {
                period,
                isBreak: false,
                cells,
            };
        });

        return rows;
    }, [dynamicPeriods, schedule]);

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
                                {classroomId && (
                                    <button
                                        type="button"
                                        onClick={() => setIsCalendarModalOpen(true)}
                                        className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors shadow-2xs"
                                        title="Historial de Clases"
                                    >
                                        <Search size={15} />
                                    </button>
                                )}
                                {editUrl && (
                                    <Link
                                        href={editUrl}
                                        className="p-1.5 text-indigo-600 hover:bg-indigo-100 bg-indigo-50 rounded-lg transition-colors shadow-2xs"
                                        title="Editar horario"
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
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
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
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
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
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1 ${
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

                {/* ───────────────────────────────────────────────────────────── */}
                {/* 1. VISTA DE HOY (5 BLOQUES EXACTOS + SNAP SCROLL POR BLOQUE) */}
                {/* ───────────────────────────────────────────────────────────── */}
                {viewMode === 'day' && (
                    <div
                        ref={carouselRef}
                        /*
                            EL DÍA, EN UN CARRIL DE LADO (TAMBIÉN EN EL TELÉFONO)

                            Estuvo una temporada en vertical —una hora debajo de
                            otra, 140 px cada una— y el dueño lo quiso de vuelta
                            de lado, como antes: el día cabe en un vistazo y se
                            pasa con el dedo. Pero más apretado: en el teléfono
                            cada ficha mide menos de la mitad del ancho, así que
                            se ven dos y se asoma la tercera (eso dice «hay
                            más»), y el carril arranca en la hora que va.

                            `data-carril-a-proposito`: la regla `arrastre` de
                            `npm run movil` no lo cuenta como fallo; es a
                            propósito.

                            `relative`: la etiqueta escondida del tema
                            (`sr-only`, que es `absolute`) se salía del carril
                            y ensanchaba la PÁGINA entera a 1188 px; el
                            teléfono la enseñaba alejada y los botones de la
                            ventana de la clase no se podían pulsar.
                        */
                        data-carril-a-proposito=""
                        className={`relative flex w-full gap-2.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2 pt-0.5 select-none min-[700px]:gap-3 ${
                            arrastrando ? 'cursor-grabbing scroll-auto' : 'cursor-grab scroll-smooth'
                        }`}
                        style={{
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                        }}
                    >
                        {isLoading ? (
                            <div className="w-full text-center py-6 text-gray-400 text-xs font-medium">
                                Cargando horario en vivo...
                            </div>
                        ) : (
                            timeline.map((period, index) => {
                                const status = getPeriodStatus(period.startTime, period.endTime);

                                // ☕ Bloque de Descanso / Recreo
                                if (period.isBreak) {
                                    return (
                                        <div
                                            key={index}
                                            className={`snap-start flex-shrink-0 w-[44%] min-w-[148px] min-h-[104px] p-2.5 min-[700px]:w-[calc((100%-48px)/5)] min-[700px]:min-w-[170px] min-[700px]:min-h-[145px] min-[700px]:p-3 rounded-2xl border transition-all flex flex-col justify-center items-center text-center ${
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
                                    classItem?.subjectId && (classItem?.classroomIdDeLaClase || classItem?.classroomId || classroomId)
                                );

                                // Datos enriquecidos desde el Plan de Evaluación y Actividades
                                const subjectInfo = classItem?.subjectId ? liveOverview?.overview?.[classItem.subjectId] : null;
                                const temaGenerador = subjectInfo?.temaGenerador || null;
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
                                        className={`snap-start flex-shrink-0 w-[44%] min-w-[148px] min-h-[104px] p-2.5 min-[700px]:w-[calc((100%-48px)/5)] min-[700px]:min-w-[170px] min-[700px]:min-h-[145px] min-[700px]:p-3 rounded-2xl border-2 transition-all flex flex-col justify-between ${
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
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider truncate">
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

                                        {/*
                                          * Pie del bloque. Solo se enseña lo que hay:
                                          *   · «1 para hoy» — lo que toca en esta clase;
                                          *   · «1 para otro día» — lo que se DEJÓ aquí para más adelante;
                                          *   · el aula, si la sección tiene aula asignada.
                                          * Los ceros y el «Sin aula» se fueron: ocupaban sitio para
                                          * decir que no hay nada que decir.
                                          */}
                                        {classItem && (todayActivitiesCount > 0 || nextActivitiesCount > 0 || classItem.location) && (
                                            <div className="pt-2 border-t border-gray-100/80 flex items-center justify-between gap-1 mt-auto flex-wrap">
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    {todayActivitiesCount > 0 && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-blue-100 text-blue-900"
                                                            title={`${todayActivitiesCount} actividad(es) para esta clase`}
                                                        >
                                                            {todayActivitiesCount} para hoy
                                                        </span>
                                                    )}
                                                    {nextActivitiesCount > 0 && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-100 text-purple-900"
                                                            title={`En esta clase se dejaron ${nextActivitiesCount} actividad(es) para otro día`}
                                                        >
                                                            {nextActivitiesCount} para otro día
                                                        </span>
                                                    )}
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
                            })
                        )}
                    </div>
                )}

                {/* ───────────────────────────────────────────────────────────── */}
                {/* 2. VISTA DE SEMANA (TABLA MATRIZ COMPACTA, ELEGANTE Y PRO)    */}
                {/* ───────────────────────────────────────────────────────────── */}
                {viewMode === 'week' && (
                    <>
                        {/*
                            LA SEMANA, DE PIE

                            La rejilla de la semana son cinco días por siete
                            horas: 700 px largos. De pie había que arrastrarla, y
                            al llegar al viernes ya no se sabía qué hora se
                            miraba. Aquí va un día cada vez, en vertical, con las
                            fichas de los días arriba; la rejilla entera sale en
                            cuanto hay ancho, y eso incluye el teléfono tumbado.
                        */}
                        <div className="min-[700px]:hidden">
                            <HorarioPorDias
                                dias={WORKING_DAYS.map((d) => ({ id: d.key, label: d.label }))}
                                periodos={dynamicPeriods.map((p) => ({
                                    id: `${p.startTime}-${p.endTime}`,
                                    label: p.label,
                                    startTime: p.startTime,
                                    endTime: p.endTime,
                                    type: p.type,
                                }))}
                                cargando={isLoading}
                                motivoDelGiro="Para ver la semana entera"
                                loDeLaHora={(dia, periodo) => {
                                    const clase = schedule.find(
                                        (c) =>
                                            c.day === dia.id &&
                                            (c.startTime === periodo.startTime ||
                                                (c.startTime <= periodo.startTime && c.endTime > periodo.startTime))
                                    );
                                    if (!clase) return null;
                                    return {
                                        titulo: clase.subject,
                                        subtitulo: clase.detail
                                            ? clase.detail.replace(/^Prof\.\s*/i, '').trim()
                                            : undefined,
                                    };
                                }}
                            />
                        </div>

                        <div className="rejilla-densa hidden overflow-x-auto rounded-xl border border-gray-200 shadow-2xs min-[700px]:block">
                        <table className="w-full border-collapse text-center text-xs">
                            {/* Cabecera Estilizada */}
                            <thead>
                                <tr className="bg-gray-50/90 border-b border-gray-200">
                                    <th className="py-2 px-3 w-32 border-r border-gray-200/80 font-bold text-[11px] text-gray-500 uppercase tracking-wider text-left pl-3">
                                        Período / Hora
                                    </th>
                                    {WORKING_DAYS.map((day) => {
                                        const isToday = day.key === getDisplayDay() && !isWeekend;
                                        return (
                                            <th
                                                key={day.key}
                                                className={`py-2 px-2.5 border-r border-gray-200/80 last:border-r-0 font-bold text-xs uppercase tracking-wide transition-colors ${
                                                    isToday ? 'bg-indigo-50/90 text-indigo-900 font-black' : 'text-gray-700'
                                                }`}
                                            >
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span>{day.label}</span>
                                                    {isToday && (
                                                        <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-md font-bold tracking-tight shadow-2xs">
                                                            HOY
                                                        </span>
                                                    )}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>

                            {/* Cuerpo de la Tabla */}
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {matrixData.map((row, rIdx) => {
                                    // Fila de Descanso / Recreo estilizada y compacta
                                    if (row.isBreak) {
                                        return (
                                            <tr key={`break-${rIdx}`} className="bg-amber-50/50 hover:bg-amber-50/70 transition-colors">
                                                <td className="py-1.5 px-3 border-r border-gray-200/80 font-semibold text-[10px] text-amber-900/80 text-left pl-3 bg-amber-50/80">
                                                    {row.period.startTime} - {row.period.endTime}
                                                </td>
                                                <td
                                                    colSpan={WORKING_DAYS.length}
                                                    className="py-1 px-3 text-center"
                                                >
                                                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-100/70 border border-amber-200/60 text-amber-800 text-[10px] font-extrabold uppercase tracking-wider">
                                                        <Coffee size={11} className="text-amber-600" />
                                                        <span>{row.period.label} ({row.period.startTime} – {row.period.endTime})</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Fila de Período Académico
                                    return (
                                        <tr key={`period-${rIdx}`} className="hover:bg-gray-50/40 transition-colors h-11">
                                            {/* Columna de Horas */}
                                            <td className="py-1.5 px-3 border-r border-gray-200/80 bg-gray-50/50 text-left pl-3 align-middle">
                                                <div className="text-[11px] font-bold text-gray-800 leading-none">
                                                    {row.period.label}
                                                </div>
                                                <div className="text-[10px] font-medium text-gray-500 font-mono mt-0.5">
                                                    {row.period.startTime} - {row.period.endTime}
                                                </div>
                                            </td>

                                            {/* Celdas por Día */}
                                            {row.cells.map((cell) => {
                                                if (cell.type === 'spanned') {
                                                    return null;
                                                }

                                                if (cell.type === 'empty') {
                                                    return (
                                                        <td
                                                            key={cell.dayKey}
                                                            className="p-1 border-r border-gray-200/60 last:border-r-0 text-gray-200 align-middle text-[11px]"
                                                        >
                                                            ·
                                                        </td>
                                                    );
                                                }

                                                const classItem = cell.classItem!;
                                                const subjectKey = (classItem.subject || '').trim().toLowerCase();
                                                const style = subjectStyleMap[subjectKey] || MODERN_SUBJECT_STYLES[0];
                                                const isClickable = Boolean(classItem.subjectId && (classItem.classroomId || classroomId));

                                                const teacherName = classItem.detail
                                                    ? classItem.detail.replace(/^Prof\.\s*/i, '').trim()
                                                    : '';

                                                return (
                                                    <td
                                                        key={cell.dayKey}
                                                        rowSpan={cell.rowSpan}
                                                        className="p-1 border-r border-gray-200/60 last:border-r-0 align-middle"
                                                    >
                                                        <div
                                                            onClick={() => handleClassClick(classItem)}
                                                            className={`h-full min-h-[42px] px-2.5 py-1.5 rounded-xl border transition-all flex flex-col justify-center items-center gap-0.5 ${style.bg} ${style.border} border-l-3 shadow-2xs ${
                                                                isClickable
                                                                    ? 'cursor-pointer hover:shadow-xs hover:scale-[1.01] active:scale-[0.99]'
                                                                    : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-1.5 flex-wrap justify-center">
                                                                <span className={`font-bold text-xs leading-tight capitalize ${style.text}`}>
                                                                    {classItem.subject}
                                                                </span>
                                                                {cell.rowSpan && cell.rowSpan > 1 && (
                                                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md ${style.badge}`}>
                                                                        {cell.rowSpan}h
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {teacherName && (
                                                                <span className={`text-[10px] font-semibold truncate max-w-[140px] ${style.subtext}`}>
                                                                    {teacherName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    </>
                )}
            </div>

            {/* La ficha de una clase para quien no es profesor: solo lectura. */}
            <ClaseDelAlumnoDialogo
                abierto={Boolean(claseAbierta)}
                alCerrar={() => setClaseAbierta(null)}
                materia={claseAbierta?.subject}
                hora={claseAbierta ? `${claseAbierta.startTime} - ${claseAbierta.endTime}` : undefined}
                profesor={claseAbierta?.detail || undefined}
                aula={claseAbierta?.location || undefined}
                fecha={histLabel}
                reemplazaA={claseAbierta?.reemplazaA}
                datos={
                    (claseAbierta?.subjectId
                        ? liveOverview?.overview?.[claseAbierta.subjectId]
                        : null) as LiveOverviewSubject | null
                }
            />

            {/* Modal de Calendario e Historial */}
            {classroomId && (
                <ScheduleCalendarModal
                    isOpen={isCalendarModalOpen}
                    onClose={() => setIsCalendarModalOpen(false)}
                    classroomId={classroomId}
                />
            )}

            {/* Fase 3.5 Parte B — Historial por fecha (misma vista "Hoy", fecha parametrizada) */}
            {isHistoryOpen && (
                <ScheduleHistoryModal
                    classroomId={classroomId}
                    schedule={schedule}
                    onSelectDay={(dateStr, key) => {
                        setHistDate(dateStr);
                        setDayViewKey(key);
                        setViewMode('day');
                        setIsHistoryOpen(false);
                    }}
                    onClose={() => setIsHistoryOpen(false)}
                />
            )}
        </>
    );
}
