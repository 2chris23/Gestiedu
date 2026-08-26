'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, CheckCircle2, AlertTriangle, Users, Award } from 'lucide-react';
import { useBulkCreateGrades, useGrades, useUpdateGrade } from '@/hooks/useGrades';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import { Activity } from '@/hooks/useActivities';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentCode?: string;
    avatar?: string;
}

interface GradeEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    activity: Activity;
    students: Student[];
    periodId: string;
    onSuccess?: () => void;
}

export default function GradeEntryModal({
    isOpen,
    onClose,
    activity,
    students,
    periodId,
    onSuccess,
}: GradeEntryModalProps) {
    const { data: config } = useAcademicConfig();
    const bulkCreate = useBulkCreateGrades();
    const updateGrade = useUpdateGrade();

    const passingGrade = config?.passingGrade || 10;
    const maxGrade = activity.maxGrade || config?.gradeScale?.max || 20;

    // Fetch existing grades for this activity
    const { data: existingGradesData } = useGrades({ activityId: activity.id, limit: 200 });

    // Map existing grades by studentId
    const existingGradesMap = useMemo(() => {
        const map = new Map<string, { id: string; score: number | null; comments?: string }>();
        if (existingGradesData?.grades) {
            existingGradesData.grades.forEach(g => {
                map.set(g.studentId, { id: g.id, score: g.score, comments: g.comments });
            });
        }
        return map;
    }, [existingGradesData]);

    // Local state for scores
    const [scores, setScores] = useState<Record<string, string>>({});
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState('');

    // Initialize scores from existing grades
    useEffect(() => {
        const initial: Record<string, string> = {};
        students.forEach(s => {
            const existing = existingGradesMap.get(s.id);
            initial[s.id] = existing?.score != null ? String(existing.score) : '';
        });
        setScores(initial);
    }, [students, existingGradesMap]);

    if (!isOpen) return null;

    const handleScoreChange = (studentId: string, value: string) => {
        const numValue = parseFloat(value);
        if (value === '' || (!isNaN(numValue) && numValue >= 0 && numValue <= maxGrade)) {
            setScores(prev => ({ ...prev, [studentId]: value }));
        }
    };

    const handleSave = async () => {
        setError('');
        try {
            const newGrades: any[] = [];
            const updatePromises: Promise<any>[] = [];

            for (const student of students) {
                const scoreStr = scores[student.id];
                if (scoreStr === '' || scoreStr === undefined) continue;

                const score = parseFloat(scoreStr);
                if (isNaN(score)) continue;

                const existing = existingGradesMap.get(student.id);

                if (existing) {
                    // Update existing grade if score changed
                    if (existing.score !== score) {
                        updatePromises.push(
                            updateGrade.mutateAsync({ gradeId: existing.id, data: { score } })
                        );
                    }
                } else {
                    // New grade
                    newGrades.push({
                        score,
                        studentId: student.id,
                        activityId: activity.id,
                        periodId,
                        subjectId: activity.subjectId!,
                    });
                }
            }

            // Execute updates
            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
            }

            // Bulk create new grades
            if (newGrades.length > 0) {
                await bulkCreate.mutateAsync({ grades: newGrades });
            }

            setSaveSuccess(true);
            setTimeout(() => {
                setSaveSuccess(false);
                onSuccess?.();
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Error al guardar calificaciones');
        }
    };

    // Stats
    const filledScores = Object.values(scores).filter(s => s !== '').map(Number).filter(n => !isNaN(n));
    const average = filledScores.length > 0 ? filledScores.reduce((a, b) => a + b, 0) / filledScores.length : 0;
    const passing = filledScores.filter(s => s >= passingGrade).length;
    const failing = filledScores.filter(s => s < passingGrade).length;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4">
                <div
                    className="fixed inset-0 bg-gray-500 bg-opacity-75"
                    onClick={onClose}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClose();
                        }
                    }}
                />

                <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-auto z-10 max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-xl">
                                <Award className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Registrar Calificaciones</h3>
                                <p className="text-xs text-gray-500">
                                    {activity.title} • Máx: {maxGrade} pts • Aprobatorio: {passingGrade}+
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Stats Bar */}
                    <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-6 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-600">{students.length} estudiantes</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Promedio:</span>
                            <span className={`text-sm font-bold ${average >= passingGrade ? 'text-green-600' : 'text-red-600'}`}>
                                {average > 0 ? average.toFixed(1) : '—'}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 ml-auto">
                            <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                ✓ {passing} aprobados
                            </span>
                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                                ✗ {failing} reprobados
                            </span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        {saveSuccess && (
                            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                ¡Calificaciones guardadas correctamente!
                            </div>
                        )}

                        <div className="space-y-2">
                            {/* Table Header */}
                            <div className="grid grid-cols-12 gap-3 px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <div className="col-span-1">#</div>
                                <div className="col-span-7">Estudiante</div>
                                <div className="col-span-2 text-center">Nota</div>
                                <div className="col-span-2 text-center">Estado</div>
                            </div>

                            {students
                                .sort((a, b) => a.lastName.localeCompare(b.lastName))
                                .map((student, index) => {
                                    const scoreStr = scores[student.id] || '';
                                    const score = parseFloat(scoreStr);
                                    const hasScore = scoreStr !== '' && !isNaN(score);
                                    const isPassing = hasScore && score >= passingGrade;
                                    const existing = existingGradesMap.get(student.id);

                                    return (
                                        <div
                                            key={student.id}
                                            className={`grid grid-cols-12 gap-3 items-center px-3 py-2.5 rounded-xl transition-colors ${
                                                hasScore
                                                    ? isPassing
                                                        ? 'bg-green-50/50 border border-green-100'
                                                        : 'bg-red-50/50 border border-red-100'
                                                    : 'bg-white border border-gray-100 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="col-span-1 text-xs font-bold text-gray-400">
                                                {index + 1}
                                            </div>
                                            <div className="col-span-7">
                                                <p className="text-sm font-bold text-gray-800">
                                                    {student.lastName}, {student.firstName}
                                                </p>
                                                {student.studentCode && (
                                                    <p className="text-xs text-gray-400">{student.studentCode}</p>
                                                )}
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                <input
                                                    type="number"
                                                    value={scoreStr}
                                                    onChange={e => handleScoreChange(student.id, e.target.value)}
                                                    min={0}
                                                    max={maxGrade}
                                                    step={0.5}
                                                    placeholder="—"
                                                    className={`w-16 px-2 py-1.5 text-center text-sm font-bold rounded-lg border-2 outline-none transition-all ${
                                                        hasScore
                                                            ? isPassing
                                                                ? 'border-green-300 bg-green-50 text-green-700 focus:ring-2 focus:ring-green-300'
                                                                : 'border-red-300 bg-red-50 text-red-700 focus:ring-2 focus:ring-red-300'
                                                            : 'border-gray-200 bg-white text-gray-600 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400'
                                                    }`}
                                                />
                                            </div>
                                            <div className="col-span-2 flex justify-center">
                                                {hasScore ? (
                                                    <span
                                                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                                                            isPassing
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-red-100 text-red-700'
                                                        }`}
                                                    >
                                                        {isPassing ? 'Aprobado' : 'Reprobado'}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-300">Sin nota</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-shrink-0 bg-gray-50/50 rounded-b-2xl">
                        <p className="text-xs text-gray-500">
                            {filledScores.length} de {students.length} calificados
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={bulkCreate.isPending || updateGrade.isPending || filledScores.length === 0}
                                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                            >
                                {bulkCreate.isPending || updateGrade.isPending ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Guardar Notas
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
