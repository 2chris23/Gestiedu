'use client';

import React, { useMemo } from 'react';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { useClassReplacements } from '@/hooks/useClassReplacements';
import { useRouter } from 'next/navigation';
import { useSchedulePeriods } from '@/hooks/useSchedulePeriods';
import { useLiveOverviews, LiveOverviewSubject } from '@/hooks/useLiveClass';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import type { EmblaCarouselType } from 'embla-carousel';
import { turnoDeLaHora } from '@/lib/turnos';
import { useRelojDelLiceo } from '@/hooks/useSchoolTime';

/** Lo que StudentScheduleSection sabe y hace; su JSX vive en el componente. */
export function useHorarioDelAlumno({ schedule, role, showActions = false, classroomId, editUrl, titulo = 'Horario semanal', subtitulo, teacherId, alumnoId }: Props) {
    const [viewMode, setViewMode] = React.useState<'day' | 'week'>('day');
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

    // El carril de las horas (Embla, `components/ui/carril.tsx`): sigue al dedo
    // y al ratón, con inercia al soltar. Las flechas de arriba lo mueven.
    const [carril, setCarril] = React.useState<EmblaCarouselType | null>(null);

    // El día y la hora del LICEO, no los del aparato: con el reloj del
    // teléfono adelantado o en otra zona, «Hoy» enseñaba las clases de otro
    // día y la clase «en curso» era otra (RELOJ-01).
    const reloj = useRelojDelLiceo();
    const currentDayIndex = reloj.diaDeLaSemana;
    const currentTime = reloj.hora;
    const todayDateStr = reloj.fecha;

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
    // Hasta que contesta el servidor, el día es el del aparato. Cuando llega el
    // del liceo, el horario se pone en él (si nadie ha elegido otro día).
    const [diaElegido, setDiaElegido] = React.useState(false);
    React.useEffect(() => {
        if (reloj.delServidor && !diaElegido && !histDate) setDayViewKey(initialDayKey);
    }, [reloj.delServidor, initialDayKey, diaElegido, histDate]);
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
        // Lunes de la semana del LICEO, contado en UTC a mediodía: ni el reloj
        // ni la zona del aparato mueven la fecha de un bloque (RELOJ-01).
        const hoy = new Date(`${todayDateStr}T12:00:00Z`);
        const lunes = hoy.getTime() - ((hoy.getUTCDay() + 6) % 7) * 864e5;
        return new Date(lunes + dayIndex * 864e5).toISOString().slice(0, 10);
    };

    // Tema generador y actividades por materia para el horario en vivo.
    // Lo pide también el alumno: es SU sección (lo comprueba el servidor).
    //
    // Se pide POR SECCIÓN, y el horario de un profesor cruza varias: con solo
    // la del perfil (ninguna, en un profesor) salía «—» y «Hoy: 0 · Próx: 0».
    const activeOverviewDate = histDate || todayDateStr;
    const seccionDe = (c: { classroomIdDeLaClase?: string; classroomId?: string } | null | undefined) =>
        c?.classroomIdDeLaClase ?? c?.classroomId ?? classroomId;

    /**
     * ENTRAR A UNA CLASE
     *
     * Según QUIÉN mira, no de quién es el horario: el admin que abre el perfil
     * de un alumno también trabaja la clase. El personal va a la Clase en
     * Vivo; el alumno y su representante, a «Mi clase»: el plan, sus
     * actividades con su nota y sus observaciones (solo mirar). Antes al alumno
     * se le abría una ventanita con el tema del día y nada más.
     */
    const { yo } = useQuienSoy();
    const esFamilia = yo ? yo.role === 'STUDENT' || yo.role === 'TUTOR' : role === 'student';

    const handleClassClick = (
        classItem: (ScheduleBlock & { reemplazaA?: string; classroomIdDeLaClase?: string }) | null
    ) => {
        if (!classItem?.subjectId) return;

        if (esFamilia) {
            const deQuien = yo?.role === 'TUTOR' && alumnoId ? `?alumno=${encodeURIComponent(alumnoId)}` : '';
            router.push(`/dashboard/mi-clase/${encodeURIComponent(classItem.subjectId)}${deQuien}`);
            return;
        }

        const seccion = seccionDe(classItem);
        if (!seccion) return;
        const blockDate = (viewMode === 'day' && histDate) ? histDate : getDateForDayKey(classItem.day || '');
        router.push(
            `/dashboard/clase-en-vivo/${seccion}/${classItem.subjectId}?date=${blockDate}&start=${encodeURIComponent(classItem.startTime)}&end=${encodeURIComponent(classItem.endTime)}`
        );
    };

    // Una hora más o una menos, desde las flechas de arriba.
    const scrollByBlock = (direction: 'prev' | 'next') => {
        if (direction === 'next') carril?.scrollNext();
        else carril?.scrollPrev();
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

    const resumenes = useLiveOverviews(
        [
            classroomId ?? '',
            ...todaySchedule.map((c) => seccionDe(c) ?? ''),
            ...reemplazos.map((r) => r.classroom.id),
        ],
        activeOverviewDate
    );
    const infoDe = (c: (ScheduleBlock & { classroomIdDeLaClase?: string }) | null | undefined): LiveOverviewSubject | null => {
        const seccion = seccionDe(c);
        return c?.subjectId && seccion ? resumenes[seccion]?.overview?.[c.subjectId] ?? null : null;
    };
    const turno = (classroomId ? resumenes[classroomId]?.shift : undefined) ?? turnoDeLosBloques;
    const { periods: dynamicPeriods, isLoading } = useSchedulePeriods(turno === 'INTEGRAL' ? 'MANANA' : turno);

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

    return {
        viewMode,
        setViewMode,
        setCarril,
        setDayViewKey,
        histDate,
        setHistDate,
        setDiaElegido,
        isHistoryOpen,
        setIsHistoryOpen,
        seccionDe,
        esFamilia,
        handleClassClick,
        scrollByBlock,
        getDisplayDay,
        displayDay,
        isWeekend,
        histLabel,
        infoDe,
        turno,
        dynamicPeriods,
        isLoading,
        timeline,
        getPeriodStatus,
        primeraQueQueda,
        subjectStyleMap,
        matrixData,
        schedule,
    };
}

export interface Props {
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
    /**
     * El alumno de este horario. Al tocar una clase, su representante va a
     * «Mi clase» de ESE alumno (`/dashboard/mi-clase/<materia>?alumno=`).
     */
    alumnoId?: string;
}

export const WORKING_DAYS = [
    { key: 'Lun', label: 'Lunes', fullLabel: 'lunes' },
    { key: 'Mar', label: 'Martes', fullLabel: 'martes' },
    { key: 'Mié', label: 'Miércoles', fullLabel: 'miércoles' },
    { key: 'Jue', label: 'Jueves', fullLabel: 'jueves' },
    { key: 'Vie', label: 'Viernes', fullLabel: 'viernes' },
];

// Paleta de estilos modernos para materias
export const MODERN_SUBJECT_STYLES = [
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
