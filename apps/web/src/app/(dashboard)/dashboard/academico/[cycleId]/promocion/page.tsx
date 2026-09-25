'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
    ArrowLeft, GraduationCap, CheckCircle2, Users, Wand2, Loader2,
    AlertTriangle, ChevronRight, Check, School, UserMinus, Plus, Trash2, ShieldAlert,
    Printer, FileText
} from 'lucide-react';
import { academicYearService } from '@/services/academic-year.service';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

interface Suggestion {
    studentId: string;
    name: string;
    gender: string | null;
    currentSection: string | null;
    gradeLevel: number;
    isLastGrade: boolean;
    defaultTargetGrade: number | null;
    defaultTargetSection: string | null;
    subjectGrades: Array<{ subjectId: string; subjectName: string; average: number; approved: boolean; revision?: number | null; definitivaDeLapsos?: number }>;
    failedSubjects: Array<{ subjectId?: string; name: string; average: number; revision?: number | null }>;
    pendingCount: number;
    finalAverage: number;
    suggestedStatus: 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';
}

interface DestSection {
    id: string;
    name: string;
    section: string;
    grade: number;
    capacity: number | null;
    totalStudents: number;
    maleCount: number;
    femaleCount: number;
}

interface DestYear {
    id: string;
    name: string;
    sections: DestSection[];
}

interface StrategyInfo {
    key: string;
    name: string;
    description: string;
}

interface StudentAssignment {
    action: 'ENROLL' | 'GRADUATE' | 'RETIRE_KEEP_HISTORY' | 'RETIRE_DELETE';
    targetGrade: number | null;
    targetSectionLetter: string;
    classroomId: string | null;
}

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
    NO_PROMOVIDO: 'No promovido / Repite',
};

const STATUS_COLOR: Record<string, string> = {
    PROMOVIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PROMOVIDO_CON_PENDIENTES: 'bg-amber-50 text-amber-700 border-amber-200',
    NO_PROMOVIDO: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function PromotionPage() {
    const params = useParams();
    const router = useRouter();
    const cycleIdParam = decodeURIComponent(params.cycleId as string);

    const [loading, setLoading] = useState(true);
    const [yearName, setYearName] = useState('');
    const [yearId, setYearId] = useState('');
    const [suggestedNextYearName, setSuggestedNextYearName] = useState('2027-2028');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [destYears, setDestYears] = useState<DestYear[]>([]);
    const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
    const [applyingStrategy, setApplyingStrategy] = useState<string | null>(null);

    // Navegación en cascada por Año y Sección
    const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);

    // Asignaciones por estudiante
    const [assignments, setAssignments] = useState<Record<string, StudentAssignment>>({});
    const [finalResults, setFinalResults] = useState<Record<string, string>>({});

    // Filtro por condición académica en Nivel 3
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO'>('ALL');

    // Modal de Acta de Materia Pendiente (Arrastre venezolano)
    const [pendingModalStudent, setPendingModalStudent] = useState<Suggestion | null>(null);

    // Revisión de las materias reprobadas: su nota es la definitiva.
    const [revisionStudent, setRevisionStudent] = useState<Suggestion | null>(null);
    const [revisionScores, setRevisionScores] = useState<Record<string, string>>({});
    const [savingRevision, setSavingRevision] = useState(false);

    // Modales
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [confirming, setConfirming] = useState(false);

    // Modal de Retiro
    const [retireModalStudent, setRetireModalStudent] = useState<Suggestion | null>(null);
    const [retireMode, setRetireMode] = useState<'RETIRE_KEEP_HISTORY' | 'RETIRE_DELETE'>('RETIRE_KEEP_HISTORY');

    // Modal para crear nueva sección
    const [newSectionModalOpen, setNewSectionModalOpen] = useState(false);
    const [newSectionGrade, setNewSectionGrade] = useState<number>(1);
    const [newSectionLetter, setNewSectionLetter] = useState<string>('C');
    const [customSections, setCustomSections] = useState<Array<{ grade: number; section: string }>>([]);

    const [visibleLimit, setVisibleLimit] = useState(30);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const years = await academicYearService.getAcademicYears();
            const found = years.find((y: any) => y.id === cycleIdParam || y.name === cycleIdParam);
            if (!found) {
                toast.error('Ciclo escolar no encontrado');
                router.push('/dashboard/academico');
                return;
            }
            setYearName(found.name);
            setYearId(found.id);

            const [context, strat] = await Promise.all([
                academicYearService.getPromotionContext(found.id),
                academicYearService.getCloseStrategies(),
            ]);

            const loadedSuggestions: Suggestion[] = context.suggestions || [];
            setSuggestions(loadedSuggestions);
            setDestYears(context.destinationYears || []);
            setSuggestedNextYearName(context.suggestedNextYearName || '2027-2028');
            setStrategies(strat || []);

            // Inicializar asignaciones lógicas iniciales
            const initialAssignments: Record<string, StudentAssignment> = {};
            const initialResults: Record<string, string> = {};

            loadedSuggestions.forEach((s: Suggestion) => {
                initialResults[s.studentId] = s.suggestedStatus;
                if (s.isLastGrade) {
                    initialAssignments[s.studentId] = {
                        action: 'GRADUATE',
                        targetGrade: null,
                        targetSectionLetter: '',
                        classroomId: null,
                    };
                } else {
                    initialAssignments[s.studentId] = {
                        action: 'ENROLL',
                        targetGrade: s.defaultTargetGrade,
                        targetSectionLetter: s.currentSection || 'A',
                        classroomId: null,
                    };
                }
            });

            setAssignments(initialAssignments);
            setFinalResults(initialResults);

            if (loadedSuggestions.length > 0) {
                // Ordenar por año ascendente y sección alfabética para seleccionar 1er Año Sección A por defecto
                const sorted = [...loadedSuggestions].sort((a, b) => {
                    if (a.gradeLevel !== b.gradeLevel) return a.gradeLevel - b.gradeLevel;
                    return (a.currentSection || 'A').localeCompare(b.currentSection || 'A');
                });
                setSelectedGrade(sorted[0].gradeLevel);
                setSelectedSection(sorted[0].currentSection || 'A');
            }
        } catch (e: any) {
            if (!esQueNoContesta(e)) toast.error(e?.response?.data?.error || 'Error al cargar el panel de promoción');
        } finally {
            setLoading(false);
        }
    }, [cycleIdParam, router]);

    useEffect(() => {
        load();
    }, [load]);

    /** Materias que se pueden revisar: las reprobadas y las que ya tienen revisión. */
    const materiasDeRevision = (s: Suggestion) =>
        s.subjectGrades.filter(g => g.revision != null || s.failedSubjects.some(f => f.subjectId === g.subjectId));

    const abrirRevision = (s: Suggestion) => {
        const iniciales: Record<string, string> = {};
        materiasDeRevision(s).forEach(g => { iniciales[g.subjectId] = g.revision != null ? String(g.revision) : ''; });
        setRevisionScores(iniciales);
        setRevisionStudent(s);
    };

    const guardarRevisiones = async () => {
        if (!revisionStudent) return;
        const cambios = materiasDeRevision(revisionStudent).filter(g => {
            const v = revisionScores[g.subjectId];
            return v !== undefined && v.trim() !== '' && Number(v) !== g.revision;
        });
        for (const g of cambios) {
            const n = Number(revisionScores[g.subjectId].replace(',', '.'));
            if (!Number.isFinite(n) || n < 0 || n > 20) {
                toast.error(`La nota de revisión de ${g.subjectName} va de 0 a 20`);
                return;
            }
        }
        setSavingRevision(true);
        try {
            for (const g of cambios) {
                await academicYearService.guardarRevision(yearId, {
                    studentId: revisionStudent.studentId,
                    subjectId: g.subjectId,
                    score: Number(revisionScores[g.subjectId].replace(',', '.')),
                });
            }
            // Se vuelven a pedir las sugerencias, sin tocar lo que el admin ya
            // asignó: solo cambia la condición de este alumno.
            const context = await academicYearService.getPromotionContext(yearId);
            const nuevas: Suggestion[] = context.suggestions || [];
            setSuggestions(nuevas);
            const suya = nuevas.find(n => n.studentId === revisionStudent.studentId);
            if (suya) setFinalResults(prev => ({ ...prev, [suya.studentId]: suya.suggestedStatus }));
            toast.success(cambios.length > 0 ? 'Revisión guardada' : 'No había cambios');
            setRevisionStudent(null);
        } catch (e: any) {
            if (!esQueNoContesta(e)) toast.error(e?.response?.data?.error || 'No se pudo guardar la revisión');
        } finally {
            setSavingRevision(false);
        }
    };

    // Niveles 1 y 2 derivados
    const grades = useMemo(() => {
        const map = new Map<number, { sections: Map<string, Suggestion[]>; total: number; assigned: number }>();
        suggestions.forEach(s => {
            const g = s.gradeLevel;
            const sec = s.currentSection || '—';
            if (!map.has(g)) map.set(g, { sections: new Map(), total: 0, assigned: 0 });
            const entry = map.get(g)!;
            entry.total++;
            const asg = assignments[s.studentId];
            if (asg && (asg.action === 'GRADUATE' || asg.action === 'RETIRE_KEEP_HISTORY' || asg.action === 'RETIRE_DELETE' || asg.targetGrade !== null)) {
                entry.assigned++;
            }
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
            .map(([section, students]) => {
                const total = students.length;
                const assigned = students.filter(s => {
                    const asg = assignments[s.studentId];
                    return asg && (asg.action === 'GRADUATE' || asg.action === 'RETIRE_KEEP_HISTORY' || asg.action === 'RETIRE_DELETE' || asg.targetGrade !== null);
                }).length;
                const males = students.filter(s => s.gender === 'MASCULINO').length;
                const females = students.filter(s => s.gender === 'FEMENINO').length;
                return {
                    section,
                    students,
                    assigned,
                    total,
                    males,
                    females,
                };
            })
            .sort((a, b) => a.section.localeCompare(b.section));
    }, [selectedGradeEntry, assignments]);

    const level3Students = useMemo(() => {
        if (!selectedGradeEntry || selectedSection === null) return [];
        let list = selectedGradeEntry.sections.get(selectedSection) || [];
        if (statusFilter !== 'ALL') {
            list = list.filter(s => (finalResults[s.studentId] || s.suggestedStatus) === statusFilter);
        }
        return list.slice(0, visibleLimit);
    }, [selectedGradeEntry, selectedSection, visibleLimit, statusFilter, finalResults]);

    const allAssignedCount = useMemo(() => {
        return suggestions.filter(s => {
            const asg = assignments[s.studentId];
            return asg && (asg.action === 'GRADUATE' || asg.action === 'RETIRE_KEEP_HISTORY' || asg.action === 'RETIRE_DELETE' || asg.targetGrade !== null);
        }).length;
    }, [suggestions, assignments]);

    const allComplete = suggestions.length > 0 && allAssignedCount === suggestions.length;

    // Aplicar Estrategia Automática
    const applyStrategy = async (key: string) => {
        setApplyingStrategy(key);
        try {
            const res = await academicYearService.previewPromotionStrategy(yearId, key, key === 'by-performance' ? 'balanced' : undefined);
            const nextAssignments: Record<string, StudentAssignment> = { ...assignments };

            (res.assignments || []).forEach((a: any) => {
                const s = suggestions.find(st => st.studentId === a.studentId);
                if (s) {
                    if (s.isLastGrade) {
                        nextAssignments[a.studentId] = {
                            action: 'GRADUATE',
                            targetGrade: null,
                            targetSectionLetter: '',
                            classroomId: null,
                        };
                    } else {
                        nextAssignments[a.studentId] = {
                            action: 'ENROLL',
                            targetGrade: a.targetGrade ?? s.defaultTargetGrade,
                            targetSectionLetter: a.targetSectionLetter || s.currentSection || 'A',
                            classroomId: a.sectionId || null,
                        };
                    }
                }
            });

            setAssignments(nextAssignments);
            toast.success('Estrategia aplicada — puedes revisar y ajustar cualquier alumno');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error al aplicar la estrategia');
        } finally {
            setApplyingStrategy(null);
        }
    };

    // Confirmar y Cerrar Ciclo
    const handleConfirm = async () => {
        if (confirmText.trim() !== yearName.trim()) {
            toast.error(`Escribe "${yearName}" exactamente para confirmar`);
            return;
        }
        setConfirming(true);
        try {
            const decisions = suggestions.map(s => {
                const asg = assignments[s.studentId] || {
                    action: s.isLastGrade ? 'GRADUATE' : 'ENROLL',
                    targetGrade: s.defaultTargetGrade,
                    targetSectionLetter: s.currentSection || 'A',
                    classroomId: null,
                };
                return {
                    studentId: s.studentId,
                    finalResult: finalResults[s.studentId] || s.suggestedStatus,
                    action: asg.action,
                    targetGrade: asg.targetGrade,
                    targetSectionLetter: asg.targetSectionLetter,
                    assignedClassroomId: asg.classroomId,
                };
            });

            await academicYearService.confirmClose(
                yearId,
                decisions,
                'manual',
                undefined,
                true, // autoCreateNextYear
                suggestedNextYearName
            );

            toast.success(`¡Ciclo escolar ${yearName} finalizado exitosamente!`);
            router.push(`/dashboard/academico`);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || e?.message || 'Error al confirmar el cierre');
        } finally {
            setConfirming(false);
        }
    };

    // Actualizar asignación individual de alumno
    const updateStudentAssignment = (studentId: string, patch: Partial<StudentAssignment>) => {
        setAssignments(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {
                    action: 'ENROLL',
                    targetGrade: 1,
                    targetSectionLetter: 'A',
                    classroomId: null,
                }),
                ...patch,
            },
        }));
    };

    // Confirmar retiro de estudiante
    const confirmStudentRetire = () => {
        if (!retireModalStudent) return;
        updateStudentAssignment(retireModalStudent.studentId, {
            action: retireMode,
            targetGrade: null,
            targetSectionLetter: '',
            classroomId: null,
        });
        toast.info(`Estudiante marcado para ${retireMode === 'RETIRE_KEEP_HISTORY' ? 'Retiro con historial' : 'Eliminación completa'}`);
        setRetireModalStudent(null);
    };

    // Crear nueva sección al vuelo
    const handleCreateSection = () => {
        if (!newSectionLetter.trim()) return;
        setCustomSections(prev => [...prev, { grade: newSectionGrade, section: newSectionLetter.toUpperCase() }]);
        toast.success(`Sección ${newSectionLetter.toUpperCase()} para ${newSectionGrade}º Año agregada a la lista`);
        setNewSectionModalOpen(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center text-gray-500 font-medium">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-indigo-600" /> Cargando panel de promoción...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 pb-24">
            {/* Header Sticky */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.push(`/dashboard/academico/${yearName}`)}
                                className="p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                                title="Volver al panel académico"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <GraduationCap className="w-7 h-7 text-indigo-600" />
                                    Promoción Escolar — Ciclo {yearName}
                                </h1>
                                <p className="text-sm text-gray-500">
                                    {suggestions.length} estudiantes matriculados · <strong className="text-indigo-600">{allAssignedCount}</strong> con destino asignado
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setConfirmOpen(true)}
                            className="px-5 py-2.5 text-sm font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmar y Cerrar Ciclo
                        </button>
                    </div>

                    {/* Barra de Estrategias Automáticas */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1">
                            <Wand2 className="w-3.5 h-3.5 text-indigo-600" /> Estrategia Automática:
                        </span>
                        {strategies.map(s => (
                            <button
                                key={s.key}
                                onClick={() => applyStrategy(s.key)}
                                disabled={applyingStrategy !== null}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 transition-colors disabled:opacity-50"
                                title={s.description}
                            >
                                {applyingStrategy === s.key ? 'Aplicando...' : s.name}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* NIVEL 1 — Selector de Años */}
                <section>
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <School className="w-4 h-4 text-indigo-600" /> Años Escolares
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {grades.map(g => {
                            const pct = g.total > 0 ? (g.assigned / g.total) * 100 : 0;
                            return (
                                <button
                                    key={g.grade}
                                    onClick={() => {
                                        setSelectedGrade(g.grade);
                                        const firstSec = Array.from(g.sections.keys())[0] || 'A';
                                        setSelectedSection(firstSec);
                                        setVisibleLimit(30);
                                    }}
                                    className={`p-4 rounded-2xl border text-left transition-all ${
                                        selectedGrade === g.grade
                                            ? 'bg-indigo-50/30 border-indigo-500 ring-2 ring-indigo-200 shadow-xs'
                                            : 'bg-white border-gray-200 hover:border-indigo-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-gray-900 text-base">{g.grade}º Año</div>
                                            <div className="text-xs text-gray-500 font-medium">{g.assigned}/{g.total} asignados</div>
                                        </div>
                                        <ProgressRing pct={pct} size={48} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* NIVEL 2 — Secciones del Año Seleccionado */}
                {selectedGradeEntry && (
                    <section>
                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4 text-indigo-600" /> Secciones de {selectedGrade}º Año
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {sectionList.map(s => {
                                const pct = s.total > 0 ? (s.assigned / s.total) * 100 : 0;
                                const malePct = s.total > 0 ? Math.round((s.males / s.total) * 100) : 0;
                                const femalePct = s.total > 0 ? Math.round((s.females / s.total) * 100) : 0;

                                return (
                                    <button
                                        key={s.section}
                                        onClick={() => { setSelectedSection(s.section); setVisibleLimit(30); }}
                                        className={`p-4 rounded-2xl border text-left transition-all ${
                                            selectedSection === s.section
                                                ? 'bg-indigo-50/30 border-indigo-500 ring-2 ring-indigo-200 shadow-xs'
                                                : 'bg-white border-gray-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <div className="font-bold text-gray-900">Sección {s.section}</div>
                                                <div className="text-xs text-gray-500">{s.assigned}/{s.total} alumnos</div>
                                            </div>
                                            <ProgressRing pct={pct} size={42} />
                                        </div>

                                        {/* Barra de Balance de Género Azul / Rosa */}
                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                                                <span className="text-blue-600 flex items-center gap-1">
                                                    👦 {s.males} ({malePct}%)
                                                </span>
                                                <span className="text-pink-600 flex items-center gap-1">
                                                    👧 {s.females} ({femalePct}%)
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                                                <div style={{ width: `${malePct}%` }} className="bg-blue-500 h-full" />
                                                <div style={{ width: `${femalePct}%` }} className="bg-pink-500 h-full" />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* NIVEL 3 — Lista de Estudiantes con Asignación Manual y Libertad Total */}
                {selectedGradeEntry && selectedSection !== null && (
                    <section className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-wrap gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-indigo-600" />
                                    Estudiantes de {selectedGrade}º Año · Sección {selectedSection}
                                </h2>

                                {/* Filtros por Condición Académica */}
                                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
                                    <button
                                        onClick={() => setStatusFilter('ALL')}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('PROMOVIDO')}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'PROMOVIDO' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
                                    >
                                        Aprobados
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('PROMOVIDO_CON_PENDIENTES')}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'PROMOVIDO_CON_PENDIENTES' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:bg-amber-50'}`}
                                    >
                                        Con Pendientes (Arrastre)
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('NO_PROMOVIDO')}
                                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'NO_PROMOVIDO' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
                                    >
                                        Repitientes
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setNewSectionGrade(selectedGrade! >= 5 ? 5 : selectedGrade! + 1);
                                        setNewSectionModalOpen(true);
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Crear Sección para {selectedGrade! >= 5 ? 5 : selectedGrade! + 1}º Año
                                </button>
                                <span className="text-xs text-gray-400 font-medium">({level3Students.length} mostrados)</span>
                            </div>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {level3Students.map(s => {
                                const currentAsg = assignments[s.studentId] || {
                                    action: s.isLastGrade ? 'GRADUATE' : 'ENROLL',
                                    targetGrade: s.defaultTargetGrade,
                                    targetSectionLetter: s.currentSection || 'A',
                                    classroomId: null,
                                };

                                const isMale = s.gender === 'MASCULINO';
                                const isRetired = currentAsg.action === 'RETIRE_KEEP_HISTORY' || currentAsg.action === 'RETIRE_DELETE';
                                const isGraduate = s.isLastGrade || currentAsg.action === 'GRADUATE';
                                const hasPending = s.failedSubjects.length > 0;
                                const conRevision = s.subjectGrades.some(g => g.revision != null);

                                // Secciones disponibles para el año destino elegido
                                const availableSections = [
                                    'A', 'B',
                                    ...customSections.filter(cs => cs.grade === currentAsg.targetGrade).map(cs => cs.section)
                                ];
                                const uniqueSectionLetters = Array.from(new Set(availableSections));

                                return (
                                    <div
                                        key={s.studentId}
                                        className={`px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                                            isRetired ? 'bg-red-50/30 opacity-80' : 'hover:bg-gray-50/70'
                                        }`}
                                    >
                                        {/* Info del Estudiante */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${isMale ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'}`}>
                                                    {isMale ? '👦 Varón' : '👧 Hembra'}
                                                </span>
                                                <span className="font-bold text-gray-900 text-sm truncate">{s.name}</span>
                                            </div>

                                            <div className="mt-1 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                                                <span>
                                                    Promedio: <strong className="text-indigo-700">{s.finalAverage.toFixed(1)} / 20</strong>
                                                </span>
                                                {hasPending ? (
                                                    <div className="inline-flex items-center gap-1.5 flex-wrap">
                                                        <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md font-semibold">
                                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                            Materia Pendiente ({s.failedSubjects.length}): {s.failedSubjects.map(f => `${f.name} (${f.average} pts${f.revision != null ? ', en revisión' : ''})`).join(', ')}
                                                        </span>
                                                        <button
                                                            onClick={() => setPendingModalStudent(s)}
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-colors shadow-2xs"
                                                            title="Ver e Imprimir Acta de Compromiso de Materias Pendientes"
                                                        >
                                                            <FileText className="w-3 h-3 text-indigo-600" />
                                                            Acta de Arrastre
                                                        </button>
                                                        <button
                                                            onClick={() => abrirRevision(s)}
                                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors"
                                                            title="Anotar la nota de la revisión de las materias reprobadas"
                                                        >
                                                            Revisión
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-emerald-600 font-medium">
                                                            ✓ Todas las materias aprobadas{conRevision ? ' (con revisión)' : ''}
                                                        </span>
                                                        {conRevision && (
                                                            <button
                                                                onClick={() => abrirRevision(s)}
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-colors"
                                                            >
                                                                Revisión
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Selector de Estado Sugerido */}
                                        {!isRetired && !isGraduate && (
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${STATUS_COLOR[s.suggestedStatus]}`}>
                                                    {STATUS_LABEL[s.suggestedStatus]}
                                                </span>
                                                <select
                                                    className="text-xs font-semibold border border-gray-200 rounded-lg px-2 py-1 bg-white"
                                                    value={finalResults[s.studentId] || s.suggestedStatus}
                                                    onChange={e => setFinalResults(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                                                    title="Resultado evaluativo final"
                                                >
                                                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                                                        <option key={k} value={k}>{v}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* Destino y Asignación */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isGraduate ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold">
                                                    <GraduationCap className="w-4 h-4" />
                                                    🎓 {s.gradeLevel}º Año — Egresado del Liceo
                                                </span>
                                            ) : isRetired ? (
                                                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                                                    <UserMinus className="w-4 h-4" />
                                                    {currentAsg.action === 'RETIRE_KEEP_HISTORY' ? 'Retirado (Guarda Historial)' : 'Eliminado de BD'}
                                                </span>
                                            ) : (
                                                <>
                                                    {/* Selector de Año Destino */}
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-500 font-medium">Pasa a:</span>
                                                        <select
                                                            className="text-xs font-bold border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800"
                                                            value={currentAsg.targetGrade || 1}
                                                            onChange={e => updateStudentAssignment(s.studentId, { targetGrade: parseInt(e.target.value) })}
                                                        >
                                                            <option value={1}>1º Año</option>
                                                            <option value={2}>2º Año</option>
                                                            <option value={3}>3º Año</option>
                                                            <option value={4}>4º Año</option>
                                                            <option value={5}>5º Año</option>
                                                            <option value={6}>6º Año</option>
                                                        </select>
                                                    </div>

                                                    {/* Selector de Sección Destino */}
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-500 font-medium">Sección:</span>
                                                        <select
                                                            className="text-xs font-bold border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-800"
                                                            value={currentAsg.targetSectionLetter || 'A'}
                                                            onChange={e => updateStudentAssignment(s.studentId, { targetSectionLetter: e.target.value })}
                                                        >
                                                            {uniqueSectionLetters.map(sec => (
                                                                <option key={sec} value={sec}>Sección {sec}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                                                        <Check className="w-3.5 h-3.5" />
                                                        Destino: {currentAsg.targetGrade}º {currentAsg.targetSectionLetter}
                                                    </span>
                                                </>
                                            )}

                                            {/* Botón Retirar / Restaurar */}
                                            {isRetired ? (
                                                <button
                                                    onClick={() => updateStudentAssignment(s.studentId, { action: 'ENROLL', targetGrade: s.defaultTargetGrade, targetSectionLetter: s.currentSection || 'A' })}
                                                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
                                                >
                                                    Restaurar
                                                </button>
                                            ) : !isGraduate ? (
                                                <button
                                                    onClick={() => {
                                                        setRetireModalStudent(s);
                                                        setRetireMode('RETIRE_KEEP_HISTORY');
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Retirar estudiante"
                                                >
                                                    <UserMinus className="w-4 h-4" />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </main>

            {/* Modal de Retiro de Estudiante */}
            {retireModalStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-red-50/50">
                            <ShieldAlert className="w-5 h-5 text-red-600" />
                            <h3 className="text-base font-bold text-gray-900">Retirar Estudiante</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                ¿Cómo deseas gestionar el retiro de <strong>{retireModalStudent.name}</strong>?
                            </p>

                            <div className="space-y-3">
                                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${retireMode === 'RETIRE_KEEP_HISTORY' ? 'border-indigo-500 bg-indigo-50/40' : 'border-gray-200'}`}>
                                    <input
                                        type="radio"
                                        name="retireMode"
                                        checked={retireMode === 'RETIRE_KEEP_HISTORY'}
                                        onChange={() => setRetireMode('RETIRE_KEEP_HISTORY')}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-gray-900">Mantener información histórica (Recomendado)</div>
                                        <div className="text-xs text-gray-500">Conserva su récord académico y notas de este ciclo escolar, pero no lo matricula para el ciclo siguiente.</div>
                                    </div>
                                </label>

                                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${retireMode === 'RETIRE_DELETE' ? 'border-red-500 bg-red-50/40' : 'border-gray-200'}`}>
                                    <input
                                        type="radio"
                                        name="retireMode"
                                        checked={retireMode === 'RETIRE_DELETE'}
                                        onChange={() => setRetireMode('RETIRE_DELETE')}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="text-sm font-bold text-red-700">Eliminar completamente del sistema</div>
                                        <div className="text-xs text-gray-500">Borra de la base de datos al estudiante y todo su historial (usar si fue registrado por error).</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setRetireModalStudent(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={confirmStudentRetire}
                                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs"
                            >
                                Confirmar Retiro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Crear Nueva Sección al Vuelo */}
            {newSectionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 bg-indigo-50/50">
                            <Plus className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-base font-bold text-gray-900">Crear Sección para el Siguiente Ciclo</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Año Escolar Destino</label>
                                <select
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold"
                                    value={newSectionGrade}
                                    onChange={e => setNewSectionGrade(parseInt(e.target.value))}
                                >
                                    <option value={1}>1º Año</option>
                                    <option value={2}>2º Año</option>
                                    <option value={3}>3º Año</option>
                                    <option value={4}>4º Año</option>
                                    <option value={5}>5º Año</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">Letra de la Sección (ej. C, D)</label>
                                <input
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-bold uppercase"
                                    value={newSectionLetter}
                                    onChange={e => setNewSectionLetter(e.target.value.toUpperCase())}
                                    maxLength={2}
                                    placeholder="C"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setNewSectionModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateSection}
                                className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                            >
                                Crear Sección
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación y Cierre de Ciclo */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-emerald-50/80 to-transparent">
                            <AlertTriangle className="w-6 h-6 text-amber-500" />
                            <h3 className="text-base font-bold text-gray-900">Confirmar Cierre de Ciclo Escolar</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                Al confirmar, el sistema:
                            </p>
                            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside bg-gray-50 p-3.5 rounded-xl border border-gray-100 font-medium">
                                <li>Creará automáticamente el ciclo escolar siguiente (<strong>{suggestedNextYearName}</strong>) y las secciones destino.</li>
                                <li>Promocionará a los estudiantes a sus años respectivos (1º → 2º, 2º → 3º).</li>
                                <li>Registrará a los estudiantes de último año como <strong>Egresados</strong> y sellará su récord histórico.</li>
                                <li>Marcará el ciclo <strong>{yearName}</strong> como finalizado.</li>
                            </ul>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    Escribe el nombre del ciclo para confirmar: <span className="font-mono text-indigo-700 font-black">{yearName}</span>
                                </label>
                                <input
                                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-semibold"
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
                                disabled={confirming || confirmText.trim() !== yearName.trim()}
                                className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-2"
                            >
                                {confirming ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Cerrando ciclo...
                                    </>
                                ) : (
                                    'Aceptar y Finalizar Ciclo'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Acta de Materia Pendiente (Arrastre venezolano) */}
            {revisionStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
                    <div role="dialog" aria-modal="true" aria-labelledby="titulo-revision" className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h3 id="titulo-revision" className="font-bold text-gray-900">Revisión de {revisionStudent.name}</h3>
                            <p className="mt-1 text-xs text-gray-600">
                                La nota de la revisión es la definitiva de la materia para la promoción. Del 0 al 20; se redondea como las definitivas del liceo.
                            </p>
                        </div>
                        <div className="px-6 py-4 space-y-3">
                            {materiasDeRevision(revisionStudent).map(g => (
                                <div key={g.subjectId} className="flex items-center justify-between gap-3">
                                    <label htmlFor={`revision-${g.subjectId}`} className="text-sm text-gray-800">
                                        <span className="font-semibold">{g.subjectName}</span>
                                        <span className="block text-xs text-gray-600">Definitiva del año: {g.definitivaDeLapsos ?? g.average}</span>
                                    </label>
                                    <input
                                        id={`revision-${g.subjectId}`}
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={20}
                                        step="0.5"
                                        value={revisionScores[g.subjectId] ?? ''}
                                        onChange={e => setRevisionScores(prev => ({ ...prev, [g.subjectId]: e.target.value }))}
                                        className="w-24 min-h-[44px] border border-gray-300 rounded-lg px-3 text-center"
                                        placeholder="—"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setRevisionStudent(null)} className="min-h-[44px] px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 rounded-xl">
                                Cancelar
                            </button>
                            <button
                                onClick={guardarRevisiones}
                                disabled={savingRevision}
                                className="min-h-[44px] px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-60"
                            >
                                {savingRevision ? 'Guardando…' : 'Guardar revisión'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingModalStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto print:p-0 print:bg-white">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 print:shadow-none print:max-w-full">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50/70 print:hidden">
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                                <FileText className="w-5 h-5 text-amber-600" />
                                Acta de Compromiso de Materias Pendientes (Arrastre)
                            </div>
                            <button
                                onClick={() => window.print()}
                                className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                            >
                                <Printer className="w-3.5 h-3.5" /> Imprimir Acta
                            </button>
                        </div>

                        {/* Documento Oficial Formateado para Venezuela */}
                        <div className="p-8 space-y-6 text-gray-800 font-sans text-xs leading-relaxed print:p-8">
                            <div className="text-center border-b border-gray-200 pb-4 space-y-1">
                                <div className="font-extrabold uppercase tracking-wider text-gray-900 text-sm">República Bolivariana de Venezuela</div>
                                <div className="font-semibold text-gray-700">Ministerio del Poder Popular para la Educación</div>
                                <div className="font-bold text-indigo-900 text-sm">ACTA DE COMPROMISO ACADÉMICO — MATERIA PENDIENTE</div>
                                <div className="text-gray-500 font-medium text-[11px]">Año Escolar Cursado: <strong>{yearName}</strong></div>
                            </div>

                            <div className="space-y-2">
                                <p>
                                    En la fecha actual, se hace constar que el(la) estudiante:
                                </p>
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 gap-2 text-xs">
                                    <div><strong>Nombre y Apellido:</strong> {pendingModalStudent.name}</div>
                                    <div><strong>Año Cursado:</strong> {pendingModalStudent.gradeLevel}º Año</div>
                                    <div><strong>Condición Académica:</strong> Promovido(a) con Materia(s) Pendiente(s)</div>
                                    <div><strong>Promedio Final Obtenido:</strong> {pendingModalStudent.finalAverage.toFixed(2)} pts</div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-gray-900 mb-2 uppercase text-[11px] tracking-wide">
                                    Asignatura(s) Pendiente(s) para Evaluación Extraordinaria:
                                </h4>
                                <table className="w-full border-collapse border border-gray-300 text-left text-xs">
                                    <thead>
                                        <tr className="bg-gray-100 font-bold text-gray-700">
                                            <th className="border border-gray-300 p-2">Asignatura</th>
                                            <th className="border border-gray-300 p-2 text-center w-28">Nota Final (01-20)</th>
                                            <th className="border border-gray-300 p-2 text-center w-36">Estado de Arrastre</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingModalStudent.failedSubjects.map((f, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="border border-gray-300 p-2 font-semibold">{f.name}</td>
                                                <td className="border border-gray-300 p-2 text-center font-bold text-red-600">{f.average} pts</td>
                                                <td className="border border-gray-300 p-2 text-center text-amber-700 font-medium bg-amber-50/50">Materia Pendiente</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900 text-[11px] space-y-1">
                                <div className="font-bold">Normativa del Ministerio de Educación (MPPE):</div>
                                <p>
                                    El(la) estudiante tiene derecho a cursar el siguiente año escolar ({pendingModalStudent.gradeLevel + 1}º Año) y presentar las evaluaciones extraordinarias de las materias pendientes en los momentos pedagógicos reglamentarios.
                                </p>
                            </div>

                            {/* Firmas */}
                            <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
                                <div className="border-t border-gray-400 pt-2">
                                    <div className="font-bold text-gray-900">Firma del Representante Legal</div>
                                    <div className="text-gray-500 text-[10px]">C.I.: _______________________</div>
                                </div>
                                <div className="border-t border-gray-400 pt-2">
                                    <div className="font-bold text-gray-900">Dirección del Plantel / Control de Estudios</div>
                                    <div className="text-gray-500 text-[10px]">Sello y Firma Oficial</div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 print:hidden">
                            <button
                                onClick={() => setPendingModalStudent(null)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
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
