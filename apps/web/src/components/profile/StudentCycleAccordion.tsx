'use client';

import React, { useState, useCallback } from 'react';
import {
    GraduationCap,
    ChevronDown,
    Calendar,
    BookOpen,
    AlertCircle,
    TrendingUp,
    MessageSquare,
    ExternalLink,
    X,
    Loader2,
    Clock,
    User,
    CheckCircle2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { studentsService } from '@/services/students.service';
import { StudentDashboardStats } from '@/types/student';
import { toLocalYMD } from '@/utils/date.utils';

export interface StudentCycleEntry {
    id: string;
    name: string;
    sectionName: string;
    classroomId: string;
    periods: Array<{ id: string; name: string }>;
    isLatest?: boolean;
}

interface Props {
    studentId: string;
    studentName: string;
    cycles: StudentCycleEntry[];
    initialOpenCycleId?: string | null;
}

export default function StudentCycleAccordion({
    studentId,
    studentName,
    cycles,
    initialOpenCycleId = null,
}: Props) {
    const router = useRouter();

    // Estado de qué acordeones están abiertos (clave: cycleId -> boolean)
    const [openCycles, setOpenCycles] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        if (initialOpenCycleId) {
            init[initialOpenCycleId] = true;
        }
        return init;
    });

    // Lapso seleccionado por cada ciclo (cycleId -> periodId o undefined para "Todo el ciclo")
    const [selectedLapsos, setSelectedLapsos] = useState<Record<string, string | undefined>>({});

    // Estadísticas cacheadas por clave `${cycleId}-${periodId || 'all'}`
    const [cycleStats, setCycleStats] = useState<Record<string, StudentDashboardStats>>({});
    const [loadingCycles, setLoadingCycles] = useState<Record<string, boolean>>({});

    // Estado del modal de observaciones
    const [obsModalState, setObsModalState] = useState<{
        isOpen: boolean;
        cycleName?: string;
        sectionName?: string;
        classroomId?: string;
        observations: any[];
    }>({
        isOpen: false,
        observations: []
    });

    // Cargar estadísticas para un ciclo y período dados
    const loadStats = useCallback(async (cycleId: string, periodId?: string) => {
        const cacheKey = `${cycleId}-${periodId || 'all'}`;
        if (cycleStats[cacheKey]) return; // Ya en caché

        setLoadingCycles(prev => ({ ...prev, [cycleId]: true }));
        try {
            const data = await studentsService.getStudentDashboardStatsById(studentId, periodId, cycleId);
            setCycleStats(prev => ({ ...prev, [cacheKey]: data }));
        } catch (error) {
            console.error(`Error al cargar rendimiento para ciclo ${cycleId}:`, error);
        } finally {
            setLoadingCycles(prev => ({ ...prev, [cycleId]: false }));
        }
    }, [studentId, cycleStats]);

    // Alternar apertura de un acordeón
    const toggleCycle = (cycleId: string) => {
        const willBeOpen = !openCycles[cycleId];
        setOpenCycles(prev => ({ ...prev, [cycleId]: willBeOpen }));

        if (willBeOpen) {
            const currentPeriod = selectedLapsos[cycleId];
            loadStats(cycleId, currentPeriod);
        }
    };

    // Cambiar filtro de lapso dentro de un ciclo
    const handleLapsoChange = (cycleId: string, periodId?: string) => {
        setSelectedLapsos(prev => ({ ...prev, [cycleId]: periodId }));
        const cacheKey = `${cycleId}-${periodId || 'all'}`;
        if (!cycleStats[cacheKey]) {
            loadStats(cycleId, periodId);
        }
    };

    // Abrir modal de observaciones para un ciclo
    const openObservationsModal = (cycle: StudentCycleEntry, stats: StudentDashboardStats | undefined) => {
        const rawObsList = stats?.recentObservations || [];
        const obsList = rawObsList.filter((obs: any) => {
            if (obs.classroomId && cycle.classroomId) {
                return obs.classroomId === cycle.classroomId;
            }
            return true;
        });
        setObsModalState({
            isOpen: true,
            cycleName: cycle.name,
            sectionName: cycle.sectionName,
            classroomId: cycle.classroomId,
            observations: obsList
        });
    };

    // Navegar a la clase en vivo desde una observación
    const handleNavigateToClass = (obs: any) => {
        setObsModalState(prev => ({ ...prev, isOpen: false }));

        const rawDate = obs.date
            ? (typeof obs.date === 'string' && obs.date.includes('T') ? obs.date.split('T')[0] : String(obs.date).slice(0, 10))
            : toLocalYMD();

        const targetClassroomId = obs.classroomId || obsModalState.classroomId;
        const targetSubjectId = obs.subjectId;

        if (targetClassroomId && targetSubjectId) {
            const sessionParam = obs.classSessionId ? `&sessionId=${obs.classSessionId}` : '';
            router.push(`/dashboard/clase-en-vivo/${targetClassroomId}/${targetSubjectId}?date=${rawDate}${sessionParam}`);
        } else if (targetClassroomId) {
            // Esta dirección no existía: «secciones» caía en el hueco del
            // ciclo escolar y abría la pantalla equivocada.
            router.push(`/dashboard/aulas/${targetClassroomId}`);
        }
    };

    if (!cycles || cycles.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-700 text-base">Sin historial académico</h3>
                <p className="text-xs text-gray-400 mt-1">Este estudiante no tiene ciclos escolares registrados.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    Rendimiento por Ciclo Escolar
                </h3>
                <span className="text-xs text-gray-400 font-medium">
                    {cycles.length} {cycles.length === 1 ? 'ciclo registrado' : 'ciclos registrados'}
                </span>
            </div>

            {cycles.map((cycle) => {
                const isOpen = !!openCycles[cycle.id];
                const activePeriodId = selectedLapsos[cycle.id];
                const cacheKey = `${cycle.id}-${activePeriodId || 'all'}`;
                const stats = cycleStats[cacheKey];
                const isLoading = !!loadingCycles[cycle.id];

                const avg = stats?.kpis?.globalAverage ?? 0;
                const attendance = stats?.kpis?.attendancePercentage ?? 0;
                const riskCount = stats?.kpis?.failedSubjects ?? 0;
                const observationsCount = stats?.kpis?.totalObservations ?? (stats?.recentObservations?.length || 0);

                const subjects = stats?.subjects || [];

                return (
                    <div
                        key={cycle.id}
                        className={cn(
                            "border rounded-2xl bg-white shadow-xs transition-all duration-300 overflow-hidden",
                            isOpen ? "ring-2 ring-indigo-500/10 border-indigo-200 shadow-sm" : "border-gray-200 hover:border-indigo-200"
                        )}
                    >
                        {/* ========================================================= */}
                        {/* CABECERA DEL ACORDEÓN (Cuando está cerrado SOLO muestra ciclo, año y sección) */}
                        {/* ========================================================= */}
                        <div
                            onClick={() => toggleCycle(cycle.id)}
                            className="group flex items-center justify-between gap-4 p-4 sm:p-5 cursor-pointer bg-white hover:bg-gray-50/70 transition-colors select-none"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleCycle(cycle.id);
                                }
                            }}
                        >
                            {/* Lado Izquierdo: Ciclo Escolar y Grado/Sección */}
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className={cn(
                                    "w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 transition-colors",
                                    isOpen ? "bg-indigo-600 text-white shadow-xs" : "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100"
                                )}>
                                    <GraduationCap size={22} />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h4 className="font-bold text-base text-gray-900 truncate">
                                            {cycle.sectionName}
                                        </h4>
                                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            Ciclo Escolar: {cycle.name}
                                        </span>
                                        {cycle.isLatest && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                                Ciclo Actual
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Lado Derecho: Flecha de expansión */}
                            <div className="flex items-center pl-1 shrink-0">
                                <div className={cn(
                                    "p-1.5 rounded-lg transition-all duration-200",
                                    isOpen ? "bg-indigo-50 text-indigo-600 rotate-180" : "bg-gray-50 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                                )}>
                                    <ChevronDown size={18} />
                                </div>
                            </div>
                        </div>

                        {/* ========================================================= */}
                        {/* CONTENIDO DESPLEGABLE (Abierto al hacer click) */}
                        {/* ========================================================= */}
                        {isOpen && (
                            <div className="animate-in slide-in-from-top-2 duration-300 border-t border-gray-100 bg-gray-50/50 p-5 space-y-6">

                                {/* 1. FILTRO POR LAPSO O TODO EL CICLO ESCOLAR */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-2xs">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-indigo-600" />
                                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                            Filtrar Período:
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleLapsoChange(cycle.id, undefined)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                !activePeriodId
                                                    ? "bg-indigo-600 text-white shadow-2xs"
                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200/70"
                                            )}
                                        >
                                            Todo el ciclo escolar
                                        </button>

                                        {cycle.periods.map((period) => (
                                            <button
                                                key={period.id}
                                                type="button"
                                                onClick={() => handleLapsoChange(cycle.id, period.id)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                    activePeriodId === period.id
                                                        ? "bg-indigo-600 text-white shadow-2xs"
                                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200/70"
                                                )}
                                            >
                                                {period.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12 bg-white rounded-xl border border-gray-100">
                                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
                                        <span className="text-xs text-gray-500 font-medium">Cargando datos del ciclo {cycle.name}...</span>
                                    </div>
                                ) : (
                                    <>
                                        {/* 2. TABLA DE PROMEDIOS / 4 TARJETAS DE INDICADORES */}
                                        <div>
                                            <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                                                Indicadores de Rendimiento General
                                                {activePeriodId && (
                                                    <span className="text-indigo-600 font-semibold normal-case">
                                                        ({cycle.periods.find(p => p.id === activePeriodId)?.name})
                                                    </span>
                                                )}
                                            </h5>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                                                {/* Card 1: Promedio Global */}
                                                <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs flex flex-col justify-between">
                                                    <div className="flex items-center justify-between gap-1 mb-2">
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                                                            Promedio Global
                                                        </span>
                                                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                                                            <GraduationCap className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-black text-gray-900">
                                                            {avg.toFixed(1)} <span className="text-xs font-medium text-gray-400">pts</span>
                                                        </div>
                                                        <span className={cn(
                                                            "text-[10px] font-bold px-2 py-0.5 rounded-md inline-block mt-1.5",
                                                            avg >= 14
                                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                : avg >= 10
                                                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                                        )}>
                                                            {avg >= 10 ? 'Aprobatorio' : 'En Riesgo'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Card 2: Riesgo Académico */}
                                                <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs flex flex-col justify-between">
                                                    <div className="flex items-center justify-between gap-1 mb-2">
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                                                            Riesgo Académico
                                                        </span>
                                                        <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
                                                            <AlertCircle className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-black text-gray-900">
                                                            {riskCount}
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                                            {riskCount === 1 ? '1 materia reprobada' : `${riskCount} materias reprobadas`}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Card 3: Asistencia */}
                                                <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs flex flex-col justify-between">
                                                    <div className="flex items-center justify-between gap-1 mb-2">
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                                                            Asistencia
                                                        </span>
                                                        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                                            <Calendar className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-black text-gray-900">
                                                            {attendance}%
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                                            Asistencia acumulada
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Card 4: Observaciones (INTERACTIVO - Al dar click abre modal) */}
                                                <div
                                                    onClick={() => openObservationsModal(cycle, stats)}
                                                    className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs flex flex-col justify-between cursor-pointer hover:border-amber-400 hover:ring-2 hover:ring-amber-500/10 hover:shadow-md transition-all group"
                                                    role="button"
                                                    tabIndex={0}
                                                    title="Haz clic para ver las observaciones de este ciclo"
                                                >
                                                    <div className="flex items-center justify-between gap-1 mb-2">
                                                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">
                                                            Observaciones
                                                        </span>
                                                        <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 group-hover:scale-110 transition-transform">
                                                            <MessageSquare className="w-4 h-4" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-black text-gray-900 flex items-center justify-between">
                                                            <span>{observationsCount}</span>
                                                            <span className="text-[10px] font-bold text-indigo-600 group-hover:underline">
                                                                Ver detalles →
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-amber-700 font-medium mt-1.5 flex items-center gap-1">
                                                            <span>Click para ver historial</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Comparación Histórica (si aplica) */}
                                        {stats && (stats.academicHistory || []).length > 0 &&
                                         stats.academicHistory[0]?.finalGrade > 0 &&
                                         stats.academicHistory[0]?.yearName &&
                                         stats.academicHistory[0].yearName !== cycle.name && (
                                            <div className="bg-gradient-to-r from-indigo-50 to-emerald-50 border border-indigo-100 rounded-xl p-3.5 flex items-start gap-3">
                                                <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                                <div className="text-xs sm:text-sm">
                                                    <span className="font-bold text-gray-800">
                                                        Promedio en {cycle.name}: {avg.toFixed(1)} —{' '}
                                                        Año previo ({stats.academicHistory[0].yearName}):{' '}
                                                        {stats.academicHistory[0].finalGrade.toFixed(1)}
                                                    </span>
                                                    {(() => {
                                                        const diff = avg - stats.academicHistory[0].finalGrade;
                                                        if (diff > 0.01) return <span className="text-emerald-700 font-semibold"> — superó el año anterior 🎉</span>;
                                                        if (diff < -0.01) return <span className="text-rose-600 font-semibold"> — por debajo del año anterior.</span>;
                                                        return <span className="text-gray-500 font-semibold"> — mismo rendimiento.</span>;
                                                    })()}
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. CALIFICACIONES POR MATERIA */}
                                        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h5 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                                    <BookOpen size={18} className="text-indigo-600" />
                                                    Calificaciones por Materia
                                                    <span className="text-xs text-gray-400 font-normal">
                                                        ({subjects.length} materias inscritas)
                                                    </span>
                                                </h5>
                                                {activePeriodId && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                                                        {cycle.periods.find(p => p.id === activePeriodId)?.name}
                                                    </span>
                                                )}
                                            </div>

                                            {subjects.length === 0 ? (
                                                <div className="text-center py-8 text-gray-400">
                                                    <BookOpen size={32} className="mx-auto mb-2 text-gray-300" />
                                                    <p className="text-xs font-semibold text-gray-500">Sin materias registradas</p>
                                                    <p className="text-[11px]">No se encontraron notas registradas para este período.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                    {subjects.map((sub, idx) => {
                                                        const score = sub.average || 0;
                                                        const hasNote = score > 0;
                                                        const ratio = Math.min(Math.max(score, 0), 20) / 20;
                                                        const isPassing = score >= 10;

                                                        const barColor = hasNote
                                                            ? (score >= 14 ? 'bg-emerald-500' : isPassing ? 'bg-amber-500' : 'bg-rose-500')
                                                            : 'bg-gray-200';

                                                        const badgeStyle = hasNote
                                                            ? (score >= 14
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : isPassing
                                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                                    : 'bg-rose-50 text-rose-700 border-rose-200')
                                                            : 'bg-gray-50 text-gray-400 border-gray-200';

                                                        return (
                                                            <div
                                                                key={sub.id || idx}
                                                                className="p-3.5 rounded-xl bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col justify-between"
                                                            >
                                                                <div>
                                                                    <div className="flex items-start justify-between gap-1.5 mb-2">
                                                                        <p className="font-bold text-xs text-gray-800 leading-tight line-clamp-1" title={sub.name}>
                                                                            {sub.name}
                                                                        </p>
                                                                        <span className={cn(
                                                                            "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black border",
                                                                            badgeStyle
                                                                        )}>
                                                                            {hasNote ? score : '—'}
                                                                        </span>
                                                                    </div>

                                                                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-2">
                                                                        <div
                                                                            className={cn("h-1.5 rounded-full transition-all duration-500", barColor)}
                                                                            style={{ width: `${Math.round(ratio * 100)}%` }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between text-[10px] font-medium text-gray-400 mt-2.5 pt-1.5 border-t border-gray-100">
                                                                    <span>{hasNote ? (isPassing ? 'Aprobada' : 'Reprobada') : 'Sin nota'}</span>
                                                                    {hasNote && isPassing && (
                                                                        <CheckCircle2 size={12} className="text-emerald-500" />
                                                                    )}
                                                                    {hasNote && !isPassing && (
                                                                        <AlertCircle size={12} className="text-rose-500" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* ========================================================= */}
            {/* MODAL / VENTANA EMERGENTE DE OBSERVACIONES */}
            {/* Al dar clic en una observación, lleva al usuario a esa clase */}
            {/* ========================================================= */}
            {obsModalState.isOpen && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) setObsModalState(prev => ({ ...prev, isOpen: false })); }}
                >
                    <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                        {/* Header de la Modal */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-amber-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-xs">
                                    <MessageSquare size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-gray-900">
                                        Observaciones de {studentName}
                                    </h3>
                                    <p className="text-xs text-gray-500">
                                        {obsModalState.sectionName} • Ciclo {obsModalState.cycleName}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setObsModalState(prev => ({ ...prev, isOpen: false }))}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Cuerpo de la Modal: Lista de Observaciones */}
                        <div className="p-6 overflow-y-auto flex-1 divide-y divide-gray-100 space-y-3">
                            {obsModalState.observations.length === 0 ? (
                                <div className="py-12 text-center text-gray-400">
                                    <MessageSquare size={40} className="mx-auto mb-2 text-gray-300" />
                                    <h4 className="text-sm font-bold text-gray-700">Sin observaciones</h4>
                                    <p className="text-xs text-gray-500 mt-1">Este estudiante no tiene observaciones en este ciclo.</p>
                                </div>
                            ) : (
                                obsModalState.observations.map((obs: any) => {
                                    const dateStr = obs.date
                                        ? new Date(obs.date).toLocaleDateString('es-VE', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric'
                                        })
                                        : 'Sin fecha';

                                    const isNegative = obs.type === 'NEGATIVE' || obs.type === 'ALERTA';

                                    return (
                                        <div
                                            key={obs.id}
                                            onClick={() => handleNavigateToClass(obs)}
                                            className="pt-3 first:pt-0 group p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 hover:shadow-sm transition-all cursor-pointer"
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h5 className="font-bold text-sm text-gray-900 group-hover:text-indigo-700 transition-colors truncate">
                                                            {obs.title}
                                                        </h5>
                                                        <span className={cn(
                                                            "text-[10px] font-extrabold px-2 py-0.5 rounded-md",
                                                            isNegative ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                                                        )}>
                                                            {isNegative ? 'Incidencia' : 'Mérito'}
                                                        </span>
                                                        {obs.subjectName && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                                                                {obs.subjectName}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                                        {obs.description || 'Sin descripción adicional.'}
                                                    </p>

                                                    <div className="flex items-center gap-4 text-[11px] text-gray-400 pt-1 flex-wrap">
                                                        <span className="flex items-center gap-1 font-medium">
                                                            <Calendar size={13} />
                                                            {dateStr}
                                                        </span>
                                                        {obs.teacher && (
                                                            <span className="flex items-center gap-1 font-medium">
                                                                <User size={13} />
                                                                Prof. {obs.teacher}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Botón de acción: Ir a la clase */}
                                                <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-indigo-600 group-hover:text-indigo-800 bg-white group-hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-2xs transition-all">
                                                    <span>Ir a la clase</span>
                                                    <ExternalLink size={13} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer de la Modal */}
                        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                            <span>Haz clic en una observación para abrir su sesión de clase</span>
                            <button
                                id="close-obs-modal-btn"
                                type="button"
                                onClick={() => setObsModalState(prev => ({ ...prev, isOpen: false }))}
                                className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-xl transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
