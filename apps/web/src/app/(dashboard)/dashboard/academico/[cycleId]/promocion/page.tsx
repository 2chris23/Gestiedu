'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    ArrowLeft, GraduationCap, CheckCircle2, Users, Wand2, Loader2,
    AlertTriangle, ChevronRight, Check, School,
} from 'lucide-react';
import { academicYearService } from '@/services/academic-year.service';

interface Suggestion {
    studentId: string;
    name: string;
    gender: string | null;
    currentSection: string | null;
    gradeLevel: number;
    subjectGrades: Array<{ subjectId: string; subjectName: string; average: number; approved: boolean }>;
    pendingCount: number;
    finalAverage: number;
    suggestedStatus: 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';
}

interface DestYear {
    id: string;
    name: string;
    sections: Array<{ id: string; name: string; section: string; grade: number }>;
}

interface StrategyInfo {
    key: string;
    name: string;
    description: string;
}

/** Anillo de progreso SVG (0-100%). */
function ProgressRing({ pct, size = 64 }: { pct: number; size?: number }) {
    const r = (size - 8) / 2;
    const c = 2 * Math.PI * r;
    const done = pct >= 100;
    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={6} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={done ? '#10B981' : '#6366F1'}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c - (Math.min(pct, 100) / 100) * c}
                    className="transition-all duration-500"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                {done ? (
                    <Check className="w-5 h-5 text-emerald-500" />
                ) : (
                    <span className="text-[11px] font-black text-indigo-700">{Math.round(pct)}%</span>
                )}
            </div>
        </div>
    );
}

const STATUS_LABEL: Record<string, string> = {
    PROMOVIDO: 'Promocionado limpio',
    PROMOVIDO_CON_PENDIENTES: 'Promocionado con pendientes',
    NO_PROMOVIDO: 'No promocionado',
};

const STATUS_COLOR: Record<string, string> = {
    PROMOVIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PROMOVIDO_CON_PENDIENTES: 'bg-amber-50 text-amber-700 border-amber-200',
    NO_PROMOVIDO: 'bg-rose-50 text-rose-700 border-rose-200',
};

/**
 * FASE 3.5 PARTE 2 — PÁGINA DEDICADA DE PROMOCIÓN
 * Navegación en cascada: Años → Secciones → Estudiantes, con anillos de
 * progreso, estrategias automáticas como punto de partida (siempre editables)
 * y confirmación bloqueada hasta el 100% de destinos asignados.
 */
export default function PromotionPage() {
    const params = useParams();
    const router = useRouter();
    const cycleIdParam = decodeURIComponent(params.cycleId as string);

    const [loading, setLoading] = useState(true);
    const [yearName, setYearName] = useState('');
    const [yearId, setYearId] = useState('');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [destYears, setDestYears] = useState<DestYear[]>([]);
    const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
    const [applyingStrategy, setApplyingStrategy] = useState<string | null>(null);

    // Navegación en cascada
    const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);

    // Asignaciones: studentId → { yearId, classroomId }
    const [assignments, setAssignments] = useState<Record<string, { yearId: string; classroomId: string | null }>>({});
    const [finalResults, setFinalResults] = useState<Record<string, string>>({});

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [confirming, setConfirming] = useState(false);

    const [visibleLimit, setVisibleLimit] = useState(30);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const years = await academicYearService.getAcademicYears();
            const found = years.find((y: any) => y.id === cycleIdParam || y.name === cycleIdParam);
            if (!found) {
                toast.error('Ciclo no encontrado');
                router.push('/dashboard/academico');
                return;
            }
            setYearName(found.name);
            setYearId(found.id);

            const [context, strat] = await Promise.all([
                academicYearService.getPromotionContext(found.id),
                academicYearService.getCloseStrategies(),
            ]);
            setSuggestions(context.suggestions || []);
            setDestYears(context.destinationYears || []);
            setStrategies(strat || []);
            setFinalResults(Object.fromEntries(
                (context.suggestions || []).map((s: Suggestion) => [s.studentId, s.suggestedStatus])
            ));
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error al cargar la promoción');
        } finally {
            setLoading(false);
        }
    }, [cycleIdParam, router]);

    useEffect(() => {
        load();
    }, [load]);

    // Niveles 1 y 2 derivados
    const grades = useMemo(() => {
        const map = new Map<number, { sections: Map<string, Suggestion[]>; total: number; assigned: number }>();
        suggestions.forEach(s => {
            const g = s.gradeLevel;
            const sec = s.currentSection || '—';
            if (!map.has(g)) map.set(g, { sections: new Map(), total: 0, assigned: 0 });
            const entry = map.get(g)!;
            entry.total++;
            if (assignments[s.studentId]?.classroomId) entry.assigned++;
            if (!entry.sections.has(sec)) entry.sections.set(sec, []);
            entry.sections.get(sec)!.push(s);
        });
        return [...map.entries()]
            .map(([grade, entry]) => ({ grade, ...entry }))
            .sort((a, b) => a.grade - b.grade);
    }, [suggestions, assignments]);

    const selectedGradeEntry = grades.find(g => g.grade === selectedGrade);

    const sectionList = useMemo(() => {
        if (!selectedGradeEntry) return [];
        return [...selectedGradeEntry.sections.entries()]
            .map(([section, students]) => ({
                section,
                students,
                assigned: students.filter(s => assignments[s.studentId]?.classroomId).length,
                total: students.length,
            }))
            .sort((a, b) => a.section.localeCompare(b.section));
    }, [selectedGradeEntry, assignments]);

    const level3Students = useMemo(() => {
        if (!selectedGradeEntry || selectedSection === null) return [];
        return (selectedGradeEntry.sections.get(selectedSection) || []).slice(0, visibleLimit);
    }, [selectedGradeEntry, selectedSection, visibleLimit]);

    const allAssignedCount = useMemo(() => suggestions.filter(s => assignments[s.studentId]?.classroomId).length, [suggestions, assignments]);
    const allComplete = suggestions.length > 0 && allAssignedCount === suggestions.length;

    const applyStrategy = async (key: string) => {
        setApplyingStrategy(key);
        try {
            const res = await academicYearService.previewPromotionStrategy(yearId, key, key === 'by-performance' ? 'balanced' : undefined);
            const next: Record<string, { yearId: string; classroomId: string | null }> = {};
            (res.assignments || []).forEach((a: any) => {
                next[a.studentId] = { yearId: res.yearId || '', classroomId: a.sectionId };
            });
            setAssignments(prev => ({ ...prev, ...next }));
            toast.success('Estrategia aplicada — revisa y ajusta casos puntuales');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error al aplicar la estrategia');
        } finally {
            setApplyingStrategy(null);
        }
    };

    const handleConfirm = async () => {
        if (confirmText !== yearName) {
            toast.error(`Escribe "${yearName}" para confirmar`);
            return;
        }
        setConfirming(true);
        try {
            const decisions = suggestions.map(s => ({
                studentId: s.studentId,
                finalResult: finalResults[s.studentId] || s.suggestedStatus,
                assignedClassroomId: assignments[s.studentId]?.classroomId || null,
            }));
            await academicYearService.confirmClose(yearId, decisions, 'manual');
            toast.success('Ciclo finalizado: estudiantes promocionados con sus destinos');
            router.push(`/dashboard/academico/${yearName}`);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error al confirmar el cierre');
        } finally {
            setConfirming(false);
        }
    };

    const assignStudent = (studentId: string, yearId: string, classroomId: string | null) => {
        setAssignments(prev => ({ ...prev, [studentId]: { yearId, classroomId } }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando promoción...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 pb-24">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <button onClick={() => router.push(`/dashboard/academico/${yearName}`)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-500">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <GraduationCap className="w-6 h-6 text-indigo-600" />
                                    Promoción — {yearName}
                                </h1>
                                <p className="text-sm text-gray-500">
                                    {suggestions.length} estudiantes · {allAssignedCount} con destino asignado
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setConfirmOpen(true)}
                            disabled={!allComplete}
                            className={`px-4 py-2 text-sm font-bold rounded-xl shadow-xs transition-colors ${
                                allComplete
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            Confirmar y Cerrar Ciclo {allComplete ? '✓' : `(${suggestions.length - allAssignedCount} pendientes)`}
                        </button>
                    </div>

                    {/* Botones de estrategia automática (punto de partida, siempre editable) */}
                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                            <Wand2 className="w-3.5 h-3.5" /> Estrategia automática:
                        </span>
                        {strategies.map(s => (
                            <button
                                key={s.key}
                                onClick={() => applyStrategy(s.key)}
                                disabled={applyingStrategy !== null}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                                title={s.description}
                            >
                                {applyingStrategy === s.key ? 'Aplicando...' : s.name}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* NIVEL 1 — Años */}
                <section>
                    <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <School className="w-4 h-4" /> Años
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {grades.map(g => {
                            const pct = g.total > 0 ? (g.assigned / g.total) * 100 : 0;
                            return (
                                <button
                                    key={g.grade}
                                    onClick={() => { setSelectedGrade(g.grade); setSelectedSection(null); setVisibleLimit(30); }}
                                    className={`p-4 rounded-2xl border bg-white text-left transition-all ${
                                        selectedGrade === g.grade ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-indigo-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-gray-900">{g.grade}º Año</div>
                                            <div className="text-xs text-gray-400">{g.assigned}/{g.total} asignados</div>
                                        </div>
                                        <ProgressRing pct={pct} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* NIVEL 2 — Secciones */}
                {selectedGradeEntry && (
                    <section>
                        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Secciones del {selectedGrade}º Año
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {sectionList.map(s => {
                                const pct = s.total > 0 ? (s.assigned / s.total) * 100 : 0;
                                return (
                                    <button
                                        key={s.section}
                                        onClick={() => { setSelectedSection(s.section); setVisibleLimit(30); }}
                                        className={`p-4 rounded-2xl border bg-white text-left transition-all ${
                                            selectedSection === s.section ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-bold text-gray-900">Sección {s.section}</div>
                                                <div className="text-xs text-gray-400">{s.assigned}/{s.total} asignados</div>
                                            </div>
                                            <ProgressRing pct={pct} size={52} />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* NIVEL 3 — Estudiantes */}
                {selectedGradeEntry && selectedSection !== null && (
                    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-gray-700">
                                Estudiantes — {selectedGrade}º Año · Sección {selectedSection}
                            </h2>
                            <span className="text-xs text-gray-400">{level3Students.length} mostrados</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {level3Students.map(s => {
                                const current = assignments[s.studentId];
                                const chosenYear = destYears.find(y => y.id === current?.yearId);
                                const chosenSection = chosenYear?.sections.find(c => c.id === current?.classroomId);
                                return (
                                    <div key={s.studentId} className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                                            <div className="text-xs text-gray-500">
                                                Promedio <span className="font-bold text-indigo-700">{s.finalAverage.toFixed(1)}</span>
                                                {' · '}
                                                {s.pendingCount > 0 ? (
                                                    <span className="text-amber-700 font-semibold">{s.pendingCount} pendientes</span>
                                                ) : (
                                                    <span className="text-emerald-600">Sin pendientes</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${STATUS_COLOR[s.suggestedStatus]}`}>
                                                {STATUS_LABEL[s.suggestedStatus]}
                                            </span>
                                            <select
                                                className="ml-2 text-[11px] font-bold border border-gray-200 rounded-lg px-1.5 py-1"
                                                value={finalResults[s.studentId] || s.suggestedStatus}
                                                onChange={e => setFinalResults(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                                                title="Resultado final (editable)"
                                            >
                                                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                                                    <option key={k} value={k}>{v}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Selector AÑO destino (cualquier año, no solo el inmediato) */}
                                            <select
                                                className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5"
                                                value={current?.yearId || ''}
                                                onChange={e => assignStudent(s.studentId, e.target.value, null)}
                                            >
                                                <option value="">Año destino...</option>
                                                {destYears.map(y => (
                                                    <option key={y.id} value={y.id}>{y.name}</option>
                                                ))}
                                            </select>
                                            {/* Selector SECCIÓN destino */}
                                            <select
                                                className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1.5 disabled:opacity-40"
                                                disabled={!current?.yearId}
                                                value={current?.classroomId || ''}
                                                onChange={e => assignStudent(s.studentId, current!.yearId, e.target.value || null)}
                                            >
                                                <option value="">Sección...</option>
                                                {(chosenYear?.sections || []).map(c => (
                                                    <option key={c.id} value={c.id}>{c.grade}º · Sección {c.section}</option>
                                                ))}
                                            </select>
                                            {chosenSection && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                                                    <Check className="w-3.5 h-3.5" />
                                                    Asignado: {chosenYear!.name} · {chosenSection.section}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {selectedGradeEntry.sections.get(selectedSection)!.length > visibleLimit && (
                            <div className="px-5 py-3 text-center">
                                <button
                                    onClick={() => setVisibleLimit(v => v + 30)}
                                    className="text-xs font-bold text-indigo-600 hover:underline"
                                >
                                    Cargar más estudiantes
                                </button>
                            </div>
                        )}
                    </section>
                )}
            </main>

            {/* Modal de confirmación final */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-emerald-50/70 to-transparent">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            <h3 className="text-base font-bold text-gray-900">Confirmar cierre del ciclo</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                Se crearán los registros académicos y se matriculará a los {suggestions.length} estudiantes
                                en sus destinos asignados. Esta acción es <strong>irreversible</strong>.
                            </p>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                                    Escribe el nombre del ciclo para confirmar: <span className="font-mono">{yearName}</span>
                                </label>
                                <input
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                                    value={confirmText}
                                    onChange={e => setConfirmText(e.target.value)}
                                    placeholder={yearName}
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={confirming || confirmText !== yearName}
                                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50"
                            >
                                {confirming ? 'Cerrando...' : 'Confirmar y Cerrar Ciclo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
