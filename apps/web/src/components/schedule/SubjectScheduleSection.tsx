'use client';

import React, { useMemo, useState } from 'react';
import {
    Calendar,
    Clock,
    Edit,
    MapPin,
    CalendarDays,
} from 'lucide-react';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { Carril } from '@/components/ui/carril';
import { DescargarHorario } from '@/components/schedule/DescargarHorario';
import ScheduleHistoryModal from '@/components/schedule/ScheduleHistoryModal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveOverview } from '@/hooks/useLiveClass';

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
                        <p className="text-xs text-gray-500 font-medium">
                            {headerDateText}
                        </p>
                    </div>
                </div>

                {/* Controles y Botones */}
                <div className="flex items-center gap-2">
                    <DescargarHorario bloques={schedule} titulo={subject.name} subtitulo={subtitulo} />

                    {showActions && (
                        <div className="flex items-center">
                            {editUrl && (
                                <Link
                                    href={editUrl}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100"
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
                                className="min-h-[44px] px-3 text-xs font-bold rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors shadow-2xs"
                            >
                                Volver a Hoy
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsHistoryOpen(true)}
                            className={`min-h-[44px] px-3.5 text-xs font-bold rounded-full transition-all inline-flex items-center gap-1.5 ${
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

            {/* Las clases, EN UN CARRIL DE LADO, como el horario de la sección
                (Cristian, 16-oct-2026: en el teléfono iban una debajo de otra y
                ocupaban media pantalla). En el teléfono se ven dos y se asoma la
                tercera; arranca en la de hoy (o la próxima). */}
            {classSequence.classes.length === 0 ? (
                <div className="w-full text-center py-8 text-gray-500 text-xs font-medium flex flex-col items-center justify-center">
                    <Clock className="w-8 h-8 mb-2 text-gray-300" aria-hidden />
                    <span>Esta materia no tiene bloques de horario asignados.</span>
                </div>
            ) : (
                <Carril
                    etiqueta={`Clases de ${subject.name}`}
                    conFlechas={false}
                    anchoDeCada="w-[44%] min-w-[148px] min-[700px]:w-[calc((100%-48px)/5)] min-[700px]:min-w-[170px]"
                    hueco="gap-2.5 min-[700px]:gap-3"
                    inicio={Math.max(0, classSequence.todayIndex)}
                    className="pb-1"
                >
                    {classSequence.classes.map((session, index) => {
                        // La primera que todavía no pasó (hoy o después).
                        const laProxima = classSequence.classes.findIndex((c) => c.status !== 'past');
                        const isClickable = role === 'teacher' && !!classroomId;
                        const isCurrent = session.status === 'current';
                        const isToday = session.status === 'today';
                        const isPast = session.status === 'past';
                        const temaGenerador = subjectInfo?.antesDelPlan
                            ? subjectInfo.nombreAntesDelPlan || 'Diagnóstico'
                            : subjectInfo?.temaGenerador || '—';
                        const firstColLabel = subjectInfo?.firstColumnLabel || 'Tema Generador';
                        const todayActCount = subjectInfo?.todayActivitiesCount ?? 0;
                        const nextActCount = subjectInfo?.nextActivitiesCount ?? 0;
                        const hasClassroom =
                            !!session.block.classroom &&
                            session.block.classroom !== 'Sin asignar' &&
                            session.block.classroom !== 'Sin aula' &&
                            session.block.classroom.trim() !== '';
                        const esDeHoy = session.dateStr === todayDateStr;
                        const etiqueta = isCurrent ? 'En curso' : esDeHoy ? 'Hoy' : index === laProxima ? 'Próxima' : null;

                        return (
                            <div
                                key={`${session.dateStr}-${session.block.id}-${index}`}
                                onClick={() => handleCardClick(session)}
                                className={`h-full w-full min-h-[104px] p-2.5 min-[700px]:min-h-[145px] min-[700px]:p-3 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                                    isClickable ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400' : ''
                                } ${
                                    isCurrent
                                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200'
                                        : isToday
                                        ? 'bg-indigo-50/70 border-indigo-400'
                                        : isPast
                                        ? 'bg-gray-50 border-gray-200 opacity-70'
                                        : 'bg-white border-gray-200'
                                }`}
                            >
                                <div>
                                    <div className="flex flex-wrap items-center justify-between gap-1">
                                        <span className="text-[11px] font-black uppercase tracking-wide text-gray-600">{session.formattedDate.replace(/^HOY /, '')}</span>
                                        {etiqueta && (
                                            <span
                                                className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                                                    isCurrent ? 'bg-emerald-100 text-emerald-800' : isPast ? 'bg-gray-200 text-gray-700' : esDeHoy ? 'bg-indigo-600 text-white' : 'bg-sky-100 text-sky-800'
                                                }`}
                                            >
                                                {etiqueta.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 font-mono text-[11px] font-bold text-gray-600">
                                        {session.block.startTime} - {session.block.endTime}
                                    </div>
                                    <div className="mt-1.5 rounded-lg border border-gray-100 bg-white/80 px-1.5 py-1">
                                        <span className="hidden text-[10px] font-bold uppercase tracking-tight text-gray-500 min-[700px]:block">{firstColLabel}:</span>
                                        <p className="line-clamp-2 text-[11px] font-bold leading-tight text-gray-800">
                                            <span className="sr-only min-[700px]:hidden">{firstColLabel}: </span>
                                            {temaGenerador}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-1 border-t border-gray-100 pt-2">
                                    <div className="flex items-center gap-1">
                                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${(isToday || isCurrent) && todayActCount > 0 ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-600'}`} title="Actividades que tocan en esta clase">
                                            {isToday || isCurrent ? todayActCount : 0} hoy
                                        </span>
                                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${nextActCount > 0 ? 'bg-purple-100 text-purple-900' : 'bg-gray-100 text-gray-600'}`} title="Actividades que se dejaron en esta clase para otro día">
                                            {nextActCount} después
                                        </span>
                                    </div>
                                    {hasClassroom && (
                                        <span className="flex max-w-[70px] items-center gap-1 truncate text-[11px] text-gray-600" title={session.block.classroom}>
                                            <MapPin size={10} className="shrink-0" aria-hidden />
                                            <span className="truncate">{session.block.classroom}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </Carril>
            )}

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
