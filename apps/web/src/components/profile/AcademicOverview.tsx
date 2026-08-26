
import React from 'react';
import { BookOpen, UserCheck, GraduationCap, TrendingUp } from 'lucide-react';
import AcademicStats from '@/components/academic/AcademicStats';
import ObservationsTray from '@/components/profile/ObservationsTray';

import { StudentDashboardStats } from '@/types/student';

interface Props {
    // In a real app, strict types for enrollment
    grade: string;
    section: string;
    guideTeacher: string;
    studentStats?: StudentDashboardStats | null;
}


export default function AcademicOverview({ grade, section, guideTeacher, studentStats }: Props) {
    // Usar solo datos reales del API, sin fallback a datos simulados
    const subjects = studentStats?.subjects.map(s => ({
        name: s.name,
        score: s.average || 0
    })) || [];

    const displayGrade = studentStats?.student.currentSection?.name || grade; // Fallback to prop
    const displayGuide = studentStats?.student.currentSection?.guideTeacher || guideTeacher;
    // Section is often embedded in name in new API, so we might hide the separate section display if using new API
    // If studentStats exists, we assume name (displayGrade) is full title like '5to Año "A"'

    return (
        <div className="space-y-6">

            {/* Header / Context */}
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                            <GraduationCap size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-indigo-100 text-sm font-medium uppercase tracking-wide">Cursando Actualmente</p>
                            {/* If fetching from API which returns full string, don't verify section prop */}
                            <h2 className="text-2xl font-bold">{displayGrade} {(!studentStats && section) ? `"${section}"` : ''}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-indigo-700/50 px-4 py-2 rounded-lg border border-indigo-500/30">
                        <UserCheck size={18} className="text-indigo-200" />
                        <div className="text-right">
                            <p className="text-[10px] uppercase text-indigo-300 font-bold tracking-wider">Profesor Guía</p>
                            <p className="font-medium text-sm">{displayGuide}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Performance Stats Overlay */}
            <div className="-mt-0">
                <h3 className="text-lg font-bold text-gray-800 mb-4 px-1">Rendimiento General</h3>
                <AcademicStats
                    stats={studentStats ? {
                        average: studentStats.kpis.globalAverage,
                        riskCount: studentStats.kpis.failedSubjects,
                        occupancy: "N/A", // Not relevant for single student, maybe handle in component
                        attendance: `${studentStats.kpis.attendancePercentage}%`,
                        observations: studentStats.kpis.totalObservations
                    } : undefined}
                    isStudentView={!!studentStats}
                />
            </div>

            {/* Fase 3.5-C — Comparación de rendimiento histórico (AcademicRecord previo) */}
            {studentStats && (studentStats.academicHistory || []).length > 0 && (
                <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
                    <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
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
                    <ObservationsTray observations={studentStats?.recentObservations} />
                </div>
            </div>
        </div>
    );
}
