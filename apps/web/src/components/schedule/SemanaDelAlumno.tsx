'use client';

import {
    Coffee,
} from 'lucide-react';
import HorarioPorDias from '@/components/schedule/HorarioPorDias';
import { WORKING_DAYS, MODERN_SUBJECT_STYLES } from './useHorarioDelAlumno';
import type { useHorarioDelAlumno } from './useHorarioDelAlumno';

export function SemanaDelAlumno({ c }: { c: ReturnType<typeof useHorarioDelAlumno> }) {
    const {
        viewMode,
        seccionDe,
        esFamilia,
        handleClassClick,
        getDisplayDay,
        isWeekend,
        dynamicPeriods,
        isLoading,
        subjectStyleMap,
        matrixData,
        schedule,
    } = c;

    return (
        <>
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
                                            const isClickable = Boolean(classItem.subjectId && (esFamilia || seccionDe(classItem)));

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
        </>
    );
}
