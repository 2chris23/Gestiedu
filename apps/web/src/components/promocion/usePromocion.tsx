'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { academicYearService } from '@/services/academic-year.service';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

/** Lo que PromotionPage sabe y hace; su JSX vive en el componente. */
export function usePromocion() {
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
    // Por qué el admin decide distinto de lo sugerido (obligatorio; queda en el expediente).
    const [motivos, setMotivos] = useState<Record<string, string>>({});
    // Sin año siguiente no se cierra: se crea en el paso 5 del fin de año.
    const [nextYear, setNextYear] = useState<{ id: string; name: string } | null>(null);

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
            setNextYear(context.nextYear ?? null);
            setStrategies(strat || []);

            // Inicializar asignaciones lógicas iniciales
            const initialAssignments: Record<string, StudentAssignment> = {};
            const initialResults: Record<string, string> = {};

            loadedSuggestions.forEach((s: Suggestion) => {
                initialResults[s.studentId] = s.condicionFinal ?? s.suggestedStatus;
                if (s.defaultTargetGrade === null) {
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
                    const destino = gradoDestino(s, finalResults[s.studentId] || s.suggestedStatus);
                    if (destino === null) {
                        nextAssignments[a.studentId] = {
                            action: 'GRADUATE',
                            targetGrade: null,
                            targetSectionLetter: '',
                            classroomId: null,
                        };
                    } else {
                        const deEseGrado = destYears.some(y => y.sections.some(sec => sec.id === a.sectionId && sec.grade === destino));
                        nextAssignments[a.studentId] = {
                            action: 'ENROLL',
                            targetGrade: destino,
                            targetSectionLetter: a.targetSectionLetter || s.currentSection || 'A',
                            classroomId: deEseGrado ? a.sectionId : null,
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
        const sinMotivo = suggestions.filter(s => faltaElMotivo(s));
        if (sinMotivo.length > 0) {
            toast.error(`Falta el motivo de ${sinMotivo.length === 1 ? sinMotivo[0].name : `${sinMotivo.length} alumnos`}: decides distinto de lo que sugiere el sistema.`);
            return;
        }
        setConfirming(true);
        try {
            const decisions = suggestions.map(s => {
                const asg = assignments[s.studentId] || {
                    action: s.defaultTargetGrade === null ? 'GRADUATE' : 'ENROLL',
                    targetGrade: s.defaultTargetGrade,
                    targetSectionLetter: s.currentSection || 'A',
                    classroomId: null,
                };
                const finalResult = finalResults[s.studentId] || s.suggestedStatus;
                return {
                    studentId: s.studentId,
                    finalResult,
                    motivo: motivos[s.studentId]?.trim() || (s.decision?.condicion === finalResult ? s.decision.motivo : undefined),
                    action: asg.action,
                    targetGrade: asg.targetGrade,
                    targetSectionLetter: asg.targetSectionLetter,
                    assignedClassroomId: asg.classroomId,
                };
            });

            await academicYearService.confirmClose(yearId, decisions, 'manual');

            toast.success(`¡Ciclo escolar ${yearName} finalizado exitosamente!`);
            router.push(`/dashboard/academico/${yearName}/cierre`);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || e?.message || 'Error al confirmar el cierre');
        } finally {
            setConfirming(false);
        }
    };

    /** Distinto de lo sugerido y sin motivo (ni escrito aquí ni guardado en el paso 4). */
    const faltaElMotivo = (s: Suggestion) => {
        const fr = finalResults[s.studentId] || s.suggestedStatus;
        const accion = assignments[s.studentId]?.action;
        if (accion === 'RETIRE_KEEP_HISTORY' || accion === 'RETIRE_DELETE') return false;
        if (fr === s.suggestedStatus) return false;
        return !(motivos[s.studentId]?.trim() || (s.decision?.condicion === fr && s.decision.motivo));
    };

    /** Cambiar la condición mueve también su destino (repite, pasa o egresa). */
    const cambiarCondicion = (s: Suggestion, condicion: string) => {
        setFinalResults(prev => ({ ...prev, [s.studentId]: condicion }));
        const destino = gradoDestino(s, condicion);
        updateStudentAssignment(s.studentId, destino === null
            ? { action: 'GRADUATE', targetGrade: null, targetSectionLetter: '', classroomId: null }
            : { action: 'ENROLL', targetGrade: destino, targetSectionLetter: s.currentSection || 'A', classroomId: null });
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

    return {
        router,
        loading,
        yearName,
        suggestedNextYearName,
        suggestions,
        strategies,
        applyingStrategy,
        selectedGrade,
        setSelectedGrade,
        selectedSection,
        setSelectedSection,
        assignments,
        finalResults,
        motivos,
        setMotivos,
        nextYear,
        statusFilter,
        setStatusFilter,
        pendingModalStudent,
        setPendingModalStudent,
        revisionStudent,
        setRevisionStudent,
        revisionScores,
        setRevisionScores,
        savingRevision,
        confirmOpen,
        setConfirmOpen,
        confirmText,
        setConfirmText,
        confirming,
        retireModalStudent,
        setRetireModalStudent,
        retireMode,
        setRetireMode,
        newSectionModalOpen,
        setNewSectionModalOpen,
        newSectionGrade,
        setNewSectionGrade,
        newSectionLetter,
        setNewSectionLetter,
        customSections,
        setVisibleLimit,
        materiasDeRevision,
        abrirRevision,
        guardarRevisiones,
        grades,
        selectedGradeEntry,
        sectionList,
        level3Students,
        allAssignedCount,
        applyStrategy,
        handleConfirm,
        faltaElMotivo,
        cambiarCondicion,
        updateStudentAssignment,
        confirmStudentRetire,
        handleCreateSection,
    };
}

export interface Suggestion {
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
    /** Lo que decidió el admin en el paso 4 (con su motivo) y la condición que vale. */
    decision?: { condicion: string; motivo: string } | null;
    condicionFinal?: 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';
    motivoDeLaSugerencia?: string;
}

/**
 * El grado al que va según la condición: repite el suyo; el del último año que
 * no repite no va a ninguna sección (egresa o solo cursa sus pendientes).
 * La misma cuenta que el servidor (`gradoDeDestino`).
 */
export const gradoDestino = (s: { gradeLevel: number; isLastGrade: boolean }, condicion: string): number | null =>
    condicion === 'NO_PROMOVIDO' ? s.gradeLevel : s.isLastGrade ? null : s.gradeLevel + 1;

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

export interface DestYear {
    id: string;
    name: string;
    sections: DestSection[];
}

export interface StrategyInfo {
    key: string;
    name: string;
    description: string;
}

export interface StudentAssignment {
    action: 'ENROLL' | 'GRADUATE' | 'RETIRE_KEEP_HISTORY' | 'RETIRE_DELETE';
    targetGrade: number | null;
    targetSectionLetter: string;
    classroomId: string | null;
}
