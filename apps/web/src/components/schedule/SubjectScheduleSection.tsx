'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
    Calendar, Clock, Edit, MapPin,
    ChevronLeft, ChevronRight, BookOpen, CalendarDays
} from 'lucide-react';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { DescargarHorario } from '@/components/schedule/DescargarHorario';
import ScheduleHistoryModal from '@/components/schedule/ScheduleHistoryModal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveOverview } from '@/hooks/useLiveClass';
import { toLocalYMD } from '@/utils/date.utils';
import { useRelojDelLiceo } from '@/hooks/useSchoolTime';

interface Props {
    schedule: ScheduleBlock[];
    subject: { id: string; name: string; code?: string };
    role: 'student' | 'teacher';
    showActions?: boolean;
    classroomId?: string;
    editUrl?: string;
    /** Debajo del nombre de la materia en el horario descargado: la sección. */
    subtitulo?: string;
}

const WORKING_DAYS = [
    { key: 'Lun', label: 'Lunes', fullLabel: 'lunes' },
    { key: 'Mar', label: 'Martes', fullLabel: 'martes' },
    { key: 'Mié', label: 'Miércoles', fullLabel: 'miércoles' },
    { key: 'Jue', label: 'Jueves', fullLabel: 'jueves' },
    { key: 'Vie', label: 'Viernes', fullLabel: 'viernes' },
];

export interface SubjectClassSession {
    date: Date;
    dateStr: string;
    dayKey: string;
    dayLabel: string;
    formattedDate: string;
    block: ScheduleBlock;
    status: 'past' | 'current' | 'today' | 'upcoming';
    statusLabel: string;
}

export default function SubjectScheduleSection({
    schedule,
    subject,
    role,
    showActions = false,
    classroomId,
    editUrl,
    subtitulo
}: Props) {
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
    const carouselRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Día y hora del LICEO, no los del aparato (RELOJ-01).
    const reloj = useRelojDelLiceo();
    const currentTime = reloj.hora;
    const todayDateStr = reloj.fecha;

    // Live Overview (temas generadores y actividades de la materia)
    const activeDate = selectedHistoryDate || todayDateStr;
    const { data: liveOverview } = useLiveOverview(classroomId || '', activeDate);
    const subjectInfo = liveOverview?.overview?.[subject.id];

    // Generar la secuencia cronológica de hasta 10 clases (2 anteriores + hoy + siguientes)
    const classSequence = useMemo(() => {
        if (!schedule || schedule.length === 0) return { classes: [], todayIndex: 0 };

        const dayOrder: Record<string, number> = { Lun: 1, Mar: 2, 'Mié': 3, Jue: 4, Vie: 5 };
        const sortedBlocks = [...schedule].sort((a, b) => {
            const diff = (dayOrder[a.day] || 0) - (dayOrder[b.day] || 0);
            if (diff !== 0) return diff;
            return a.startTime.localeCompare(b.startTime);
        });

        // Todo en UTC a mediodía, a partir del día del LICEO: con getDate/getDay
        // (hora del aparato) un teléfono en otra zona corría las fechas un día.
        const baseDate = new Date(`${selectedHistoryDate || todayDateStr}T12:00:00Z`);

        const pastClasses: SubjectClassSession[] = [];
        // 1. Buscar hacia atrás hasta 35 días para obtener 2 clases anteriores
        for (let offset = 1; offset <= 35 && pastClasses.length < 2; offset++) {
            const d = new Date(baseDate);
            d.setUTCDate(baseDate.getUTCDate() - offset);
            const dow = d.getUTCDay(); // 0=dom..6=sáb
            if (dow >= 1 && dow <= 5) {
                const dayKey = WORKING_DAYS[dow - 1].key;
                const blocksForDay = sortedBlocks.filter((b) => b.day === dayKey);
                for (let i = blocksForDay.length - 1; i >= 0 && pastClasses.length < 2; i--) {
                    const b = blocksForDay[i];
                    const dStr = d.toISOString().split('T')[0];
                    pastClasses.unshift({
                        date: new Date(d),
                        dateStr: dStr,
                        dayKey,
                        dayLabel: WORKING_DAYS[dow - 1].label,
                        formattedDate: `${WORKING_DAYS[dow - 1].key} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
                        block: b,
                        status: 'past',
                        statusLabel: 'REALIZADA',
                    });
                }
            }
        }

        // 2. Clases del día base (hoy o día seleccionado)
        const baseDow = baseDate.getUTCDay();
        const currentClasses: SubjectClassSession[] = [];
        if (baseDow >= 1 && baseDow <= 5) {
            const dayKey = WORKING_DAYS[baseDow - 1].key;
            const blocksForDay = sortedBlocks.filter((b) => b.day === dayKey);
            const isActuallyToday = baseDate.toISOString().split('T')[0] === todayDateStr;

            blocksForDay.forEach((b) => {
                let status: SubjectClassSession['status'] = 'today';
                let statusLabel = 'HOY';

                if (isActuallyToday) {
                    if (currentTime >= b.startTime && currentTime <= b.endTime) {
                        status = 'current';
                        statusLabel = 'EN CURSO';
                    } else if (currentTime > b.endTime) {
                        status = 'past';
                        statusLabel = 'HOY (FINALIZADA)';
                    } else {
                        status = 'today';
                        statusLabel = 'HOY (PRÓXIMA)';
                    }
                } else if (baseDate.toISOString().split('T')[0] < todayDateStr) {
                    status = 'past';
                    statusLabel = 'HISTÓRICA';
                } else {
                    status = 'upcoming';
                    statusLabel = 'PROGRAMADA';
                }

                currentClasses.push({
                    date: new Date(baseDate),
                    dateStr: baseDate.toISOString().split('T')[0],
                    dayKey,
                    dayLabel: WORKING_DAYS[baseDow - 1].label,
                    formattedDate: `HOY ${baseDate.getUTCDate()}/${baseDate.getUTCMonth() + 1}`,
                    block: b,
                    status,
                    statusLabel,
                });
            });
        }

        // 3. Buscar hacia adelante hasta completar hasta 10 clases en total
        const futureClasses: SubjectClassSession[] = [];
        const totalNeededFuture = 10 - pastClasses.length - currentClasses.length;

        for (let offset = 1; offset <= 45 && futureClasses.length < totalNeededFuture; offset++) {
            const d = new Date(baseDate);
            d.setUTCDate(baseDate.getUTCDate() + offset);
            const dow = d.getUTCDay();
            if (dow >= 1 && dow <= 5) {
                const dayKey = WORKING_DAYS[dow - 1].key;
                const blocksForDay = sortedBlocks.filter((b) => b.day === dayKey);
                for (const b of blocksForDay) {
                    if (futureClasses.length < totalNeededFuture) {
                        const isNext = futureClasses.length === 0 && currentClasses.length === 0;
                        futureClasses.push({
                            date: new Date(d),
                            dateStr: d.toISOString().split('T')[0],
                            dayKey,
                            dayLabel: WORKING_DAYS[dow - 1].label,
                            formattedDate: `${WORKING_DAYS[dow - 1].key} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
                            block: b,
                            status: 'upcoming',
                            statusLabel: isNext ? 'PRÓXIMA CLASE' : 'SIGUIENTE',
                        });
                    }
                }
            }
        }

        const allClasses = [...pastClasses, ...currentClasses, ...futureClasses];
        const todayIndex = pastClasses.length;

        return {
            classes: allClasses,
            todayIndex,
        };
    }, [schedule, selectedHistoryDate, currentTime, todayDateStr]);

    // Scroll automático para centrar en las 2 anteriores + Hoy + 2 siguientes
    useEffect(() => {
        if (carouselRef.current && classSequence.classes.length > 0) {
            const container = carouselRef.current;
            const targetIndex = Math.max(0, classSequence.todayIndex - 2);
            const firstChild = container.firstElementChild as HTMLElement;
            if (firstChild) {
                const cardWidth = firstChild.offsetWidth + 12;
                container.scrollTo({
                    left: targetIndex * cardWidth,
                    behavior: 'smooth',
                });
            }
        }
    }, [classSequence]);

    const scrollCarousel = (direction: 'prev' | 'next') => {
        if (!carouselRef.current) return;
        const container = carouselRef.current;
        const firstChild = container.firstElementChild as HTMLElement;
        const cardWidth = firstChild ? firstChild.offsetWidth + 12 : 220;
        container.scrollBy({
            left: direction === 'next' ? cardWidth : -cardWidth,
            behavior: 'smooth',
        });
    };

    const handleCardClick = (session: SubjectClassSession) => {
        if (role !== 'teacher' || !classroomId || !subject.id) return;
        router.push(
            `/dashboard/clase-en-vivo/${classroomId}/${subject.id}?date=${session.dateStr}&start=${encodeURIComponent(
                session.block.startTime
            )}&end=${encodeURIComponent(session.block.endTime)}`
        );
    };

    const currentActiveSession = classSequence.classes[classSequence.todayIndex] || classSequence.classes[0];
    const headerDateText = selectedHistoryDate
        ? `Clase seleccionada: ${selectedHistoryDate.split('-').reverse().join('/')}`
        : currentActiveSession
        ? `${currentActiveSession.status === 'today' || currentActiveSession.status === 'current' ? 'Hoy' : 'Próxima'}, ${currentActiveSession.dayLabel} (${currentActiveSession.date.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', timeZone: 'UTC' })})`
        : 'Horario semanal';

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-4 sm:p-5">
            {/* Cabecera del Horario */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 shadow-xs">
                        <Calendar size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight">
                            Horario en Vivo <span className="text-indigo-600 font-medium text-xs sm:text-sm">• {subject.name}</span>
                        </h3>
                        <p className="text-[11px] text-gray-500 font-medium">
                            {headerDateText}
                        </p>
                    </div>
                </div>

                {/* Controles y Botones */}
                <div className="flex items-center gap-2">
                    {/* Flechas de navegación para desplazarse entre clases */}
                    {classSequence.classes.length > 5 && (
                        <div className="flex items-center gap-1 bg-gray-50 p-0.5 rounded-lg border border-gray-200/60">
                            <button
                                type="button"
                                onClick={() => scrollCarousel('prev')}
                                className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 rounded-md transition-colors"
                                title="Clase anterior"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => scrollCarousel('next')}
                                className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-200/80 rounded-md transition-colors"
                                title="Clase siguiente"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}

                    <DescargarHorario bloques={schedule} titulo={subject.name} subtitulo={subtitulo} />

                    {showActions && (
                        <div className="flex items-center gap-1 mr-1 pr-1 border-r border-gray-200">
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

                    {/* Botón de Historial */}
                    <div className="flex items-center gap-1.5">
                        {selectedHistoryDate && (
                            <button
                                type="button"
                                onClick={() => setSelectedHistoryDate(null)}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors shadow-2xs"
                            >
                                Volver a Hoy
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsHistoryOpen(true)}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 ${
                                selectedHistoryDate
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 border border-gray-200/60'
                            }`}
                            title="Ver días en que se imparte esta materia"
                        >
                            <CalendarDays size={13} />
                            <span>Historial</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* VISTA DE CLASES SECUENCIALES (2 ANTERIORES + HOY + SIGUIENTES HASTA 10) */}
            <div
                ref={carouselRef}
                /* De pie, en vertical: cinco tarjetas de 190 px no caben en 390,
                   y arrastrar de lado para ver la clase de las 10 es un fastidio. */
                className="flex w-full flex-col gap-3 pb-2 pt-0.5 min-[700px]:flex-row min-[700px]:snap-x min-[700px]:snap-mandatory min-[700px]:overflow-x-auto min-[700px]:scroll-smooth min-[700px]:no-scrollbar"
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
            >
                {classSequence.classes.length === 0 ? (
                    <div className="w-full text-center py-8 text-gray-400 text-xs font-medium flex flex-col items-center justify-center">
                        <Clock className="w-8 h-8 mb-2 text-gray-300" />
                        <span>Esta materia no tiene bloques de horario asignados.</span>
                    </div>
                ) : (
                    classSequence.classes.map((session, index) => {
                        const isClickable = role === 'teacher' && classroomId;
                        const isCurrent = session.status === 'current';
                        const isToday = session.status === 'today';
                        const isPast = session.status === 'past';

                        const temaGenerador = subjectInfo?.temaGenerador || 'Tema de clase programado';
                        const firstColLabel = subjectInfo?.firstColumnLabel || 'Tema Generador';
                        const todayActCount = subjectInfo?.todayActivitiesCount ?? 0;
                        const nextActCount = subjectInfo?.nextActivitiesCount ?? 0;
                        const hasClassroom =
                            session.block.classroom &&
                            session.block.classroom !== 'Sin asignar' &&
                            session.block.classroom !== 'Sin aula' &&
                            session.block.classroom.trim() !== '';

                        return (
                            <div
                                key={`${session.dateStr}-${session.block.id}-${index}`}
                                onClick={() => handleCardClick(session)}
                                style={
                                    session.block?.color
                                        ? {
                                              backgroundColor: isCurrent ? '#f0fdf4' : `${session.block.color}08`,
                                              borderColor: isCurrent ? '#10b981' : isToday ? '#6366f1' : `${session.block.color}35`,
                                          }
                                        : undefined
                                }
                                className={`w-full min-h-[96px] min-[700px]:snap-start min-[700px]:flex-shrink-0 min-[700px]:w-[calc((100%-48px)/5)] min-[700px]:min-w-[190px] min-[700px]:min-h-[160px] p-3.5 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                                    isClickable ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:shadow-xs' : ''
                                } ${
                                    isCurrent
                                        ? 'bg-emerald-50/90 border-emerald-500 shadow-xs ring-2 ring-emerald-200'
                                        : isToday
                                        ? 'bg-indigo-50/70 border-indigo-400 shadow-xs ring-1 ring-indigo-200'
                                        : isPast
                                        ? 'bg-gray-50/70 border-gray-200 opacity-70 hover:opacity-100'
                                        : 'bg-blue-50/40 border-blue-200/90'
                                }`}
                            >
                                {/* Cabecera del Bloque: Fecha/Hora + Badge de Estado */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide truncate">
                                            {session.formattedDate}
                                        </span>
                                        {isCurrent ? (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-black rounded-full shadow-2xs animate-pulse">
                                                <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                                                EN CURSO
                                            </span>
                                        ) : isToday ? (
                                            <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full shadow-2xs">
                                                HOY
                                            </span>
                                        ) : isPast ? (
                                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[8px] font-bold rounded-full">
                                                ANTERIOR
                                            </span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[8px] font-extrabold rounded-full">
                                                {session.statusLabel}
                                            </span>
                                        )}
                                    </div>

                                    <div className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
                                        <Clock size={11} className="text-gray-400 shrink-0" />
                                        <span>{session.block.startTime} - {session.block.endTime}</span>
                                    </div>
                                </div>

                                {/* Cuerpo: Materia y Tema Generador */}
                                <div className="my-2">
                                    <h4 className="font-extrabold text-gray-900 text-sm leading-tight truncate">
                                        {subject.name}
                                    </h4>
                                    <div className="mt-1">
                                        <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                                            {firstColLabel}:
                                        </p>
                                        <p className="text-[11px] font-semibold text-gray-800 line-clamp-2 leading-tight">
                                            {temaGenerador}
                                        </p>
                                    </div>
                                </div>

                                {/* Footer: Actividades y Aula (solo si está asignada) */}
                                <div className="flex items-center justify-between border-t border-gray-100/80 pt-2 text-[10px] text-gray-500">
                                    <div className="flex items-center gap-1.5 font-bold">
                                        <span className="text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">
                                            Hoy: {isToday || isCurrent ? todayActCount : 0}
                                        </span>
                                        <span className="text-gray-500 bg-gray-100 px-1 py-0.2 rounded">
                                            Próx: {nextActCount}
                                        </span>
                                    </div>
                                    {hasClassroom && (
                                        <div className="flex items-center gap-1 font-semibold text-gray-600 truncate max-w-[85px]" title={session.block.classroom}>
                                            <MapPin size={10} className="shrink-0 text-gray-400" />
                                            <span className="truncate">{session.block.classroom}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal de Historial con Días Restringidos */}
            {isHistoryOpen && (
                <ScheduleHistoryModal
                    classroomId={classroomId}
                    schedule={schedule}
                    title={`Historial de ${subject.name}`}
                    subtitle="Solo días en los que se imparte esta materia"
                    onSelectDay={(dateStr) => {
                        setSelectedHistoryDate(dateStr);
                        setIsHistoryOpen(false);
                    }}
                    onClose={() => setIsHistoryOpen(false)}
                />
            )}
        </div>
    );
}
