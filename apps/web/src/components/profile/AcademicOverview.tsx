
'use client';

import React, { useState } from 'react';
import { BookOpen, UserCheck, GraduationCap, TrendingUp, ChevronDown } from 'lucide-react';
import AcademicStats from '@/components/academic/AcademicStats';
import ObservationsTray from '@/components/profile/ObservationsTray';
import { cn } from '@/lib/utils';
import { StudentDashboardStats } from '@/types/student';

interface Props {
    grade: string;
    section: string;
    guideTeacher: string;
    studentStats?: StudentDashboardStats | null;
}

export default function AcademicOverview({ grade, section, guideTeacher, studentStats }: Props) {
    const [isOpen, setIsOpen] = useState(false);

    // Usar solo datos reales del API, sin fallback a datos simulados
    const subjects = studentStats?.subjects.map(s => ({
        name: s.name,
        score: s.average || 0
    })) || [];

    const displayGrade = studentStats?.student.currentSection?.name || grade;
    const displayGuide = studentStats?.student.currentSection?.guideTeacher || guideTeacher;
    const academicYearName = (studentStats?.student.currentSection as any)?.academicYearName || null;

    const avg = studentStats?.kpis.globalAverage ?? 0;
    const attendance = studentStats?.kpis.attendancePercentage ?? 0;
    const failedCount = studentStats?.kpis.failedSubjects ?? 0;

    return (
        <div className="space-y-6">
            {/* Acordeón de Rendimiento Académico y Sección */}
            <div className={cn(
                "border rounded-2xl bg-white shadow-xs transition-all duration-300 overflow-hidden",
                isOpen ? "ring-2 ring-indigo-500/10 border-indigo-200 shadow-sm" : "border-gray-200 hover:border-indigo-200"
            )}>
                {/* Header del Acordeón (Trigger) */}
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="group flex items-center justify-between gap-4 p-4 sm:p-5 cursor-pointer bg-white hover:bg-gray-50/70 transition-colors select-none"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setIsOpen(!isOpen);
                        }
                    }}
                >
                    {/* Lado izquierdo: Grado, Ciclo y Docente Guía */}
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 transition-colors",
                            isOpen ? "bg-indigo-600 text-white shadow-xs" : "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100"
                        )}>
                            <GraduationCap size={22} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-base text-gray-900 truncate">
                                    {displayGrade} {(!studentStats && section) ? `"${section}"` : ''}
                                </h3>
                                {academicYearName && (
                                    <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100/80 shrink-0">
                                        {academicYearName}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                <UserCheck size={13} className="text-gray-400 shrink-0" />
                                <span className="text-gray-400">Profesor Guía:</span>
                                <span className="font-medium text-gray-700 truncate">{displayGuide}</span>
                            </div>
                        </div>
                    </div>

                    {/* Lado derecho: Píldoras de resumen y chevron */}
                    <div className="flex items-center gap-2.5 shrink-0">
                        {studentStats && (
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "text-xs font-bold px-2.5 py-1 rounded-lg border shadow-2xs",
                                    avg >= 14
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                        : avg >= 10
                                            ? "bg-amber-50 text-amber-700 border-amber-200/80"
                                            : "bg-rose-50 text-rose-700 border-rose-200/80"
                                )}>
                                    Prom: {avg.toFixed(1)} pts
                                </span>
                                <span className="hidden sm:inline-flex text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                                    {attendance}% Asist.
                                </span>
                                {failedCount > 0 ? (
                                    <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-1 rounded-lg">
                                        {failedCount} reprobada{failedCount > 1 ? 's' : ''}
                                    </span>
                                ) : null}
                            </div>
                        )}
                        <div className="flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:text-indigo-700 pl-1">
                            <span className="hidden md:inline">{isOpen ? 'Ocultar' : 'Ver rendimiento'}</span>
                            <div className={cn(
                                "p-1.5 rounded-lg transition-all duration-200",
                                isOpen ? "bg-indigo-50 text-indigo-600 rotate-180" : "bg-gray-50 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                            )}>
                                <ChevronDown size={16} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Contenido expandible del Acordeón */}
                {isOpen && (
                    <div className="animate-in slide-in-from-top-2 duration-300 border-t border-gray-100 bg-gray-50/50 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                                Indicadores de Rendimiento General
                            </h4>
                        </div>

                        {/* 4 Tarjetas de Estadísticas */}
                        <AcademicStats
                            stats={studentStats ? {
                                average: studentStats.kpis.globalAverage,
                                riskCount: studentStats.kpis.failedSubjects,
                                occupancy: "N/A",
                                attendance: `${studentStats.kpis.attendancePercentage}%`,
                                observations: studentStats.kpis.totalObservations
                            } : undefined}
                            isStudentView={!!studentStats}
                        />

                        {/* Comparación histórica con año anterior cerrado */}
                        {studentStats && (studentStats.academicHistory || []).length > 0 &&
                         studentStats.academicHistory[0]?.finalGrade > 0 &&
                         studentStats.academicHistory[0]?.yearName &&
                         studentStats.academicHistory[0].yearName !== studentStats.student?.currentSection?.name &&
                         studentStats.academicHistory[0].yearName !== (studentStats.student?.currentSection as any)?.academicYearName && (
                            <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-100 rounded-xl p-3.5 flex items-start gap-3">
                                <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                <div className="text-xs sm:text-sm">
                                    <span className="font-bold text-gray-800">
                                        Tu promedio este año: {studentStats.kpis.globalAverage.toFixed(1)} —{' '}
                                        el año pasado ({studentStats.academicHistory[0].yearName}):{' '}
                                        {studentStats.academicHistory[0].finalGrade.toFixed(1)}
                                    </span>
                                    {(() => {
                                        const diff = studentStats.kpis.globalAverage - studentStats.academicHistory[0].finalGrade;
                                        if (diff > 0.01) return <span className="text-emerald-700 font-semibold"> — vas mejor que el año pasado 🎉</span>;
                                        if (diff < -0.01) return <span className="text-rose-600 font-semibold"> — vas por debajo del año pasado, ¡ánimo!</span>;
                                        return <span className="text-gray-500 font-semibold"> — vas igual que el año pasado.</span>;
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Content Grid: Subjects & Observations */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Subjects Grid (2/3) */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <BookOpen size={20} className="text-indigo-600" />
                        Materias Inscritas
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {subjects.length === 0 ? (
                            <div className="col-span-full text-center py-6 text-gray-400">
                                <BookOpen size={36} className="mx-auto mb-2 text-gray-300" />
                                <p className="font-semibold text-gray-500">Sin materias inscritas</p>
                                <p className="text-sm">Este estudiante aún no tiene materias asignadas</p>
                            </div>
                        ) : (
                            subjects.map((sub, idx) => {
                                const hasNote = sub.score > 0;
                                const ratio = Math.min(Math.max(sub.score, 0), 20) / 20;
                                const barColor = hasNote
                                    ? (ratio >= 0.75 ? 'bg-emerald-500' : ratio >= 0.5 ? 'bg-amber-500' : 'bg-rose-500')
                                    : 'bg-gray-200';
                                const badge = hasNote
                                    ? (ratio >= 0.75 ? 'bg-emerald-100 text-emerald-700' : ratio >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')
                                    : 'bg-gray-100 text-gray-400';
                                return (
                                    <div key={idx} className="p-4 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-semibold text-gray-800 leading-tight truncate">{sub.name}</p>
                                            <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold ${badge}`}>
                                                {hasNote ? sub.score : '—'}
                                            </span>
                                        </div>
                                        <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className={`h-1.5 rounded-full ${barColor} transition-all`}
                                                style={{ width: `${Math.round(ratio * 100)}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                            {hasNote ? (sub.score >= 10 ? 'Aprobada' : 'Reprobada') : 'Sin calificar'}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Observations Tray (1/3) */}
                <div className="lg:col-span-1">
                    <ObservationsTray
                        studentId={studentStats?.student?.id}
                        studentName={studentStats?.student?.fullName}
                        observations={studentStats?.recentObservations}
                    />
                </div>
            </div>
        </div>
    );
}
