'use client';

import React, { useState, useMemo } from 'react';
import { X, Search, GraduationCap, Users, ArrowRight, BookOpen, AlertTriangle, CheckCircle } from 'lucide-react';
import { useStudents } from '@/hooks/useStudents';
import { SectionStudent } from '@/services/students.service';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import UserAvatar from '@/components/ui/UserAvatar';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    section: {
        id: string;
        name: string;
        slug?: string;
        average: number;
        studentCount: number;
    } | null;
    subjectId: string;
    cycleId?: string;
}

export default function SubjectSectionStudentsModal({
    isOpen,
    onClose,
    section,
    subjectId,
    cycleId = '2026-2027',
}: Props) {
    const [searchTerm, setSearchTerm] = useState('');

    const { data: studentsData, isLoading } = useStudents(section?.id || '', {
        page: 1,
        limit: 100,
        subjectId,
    });

    const students = useMemo(() => {
        return (studentsData?.students || studentsData?.users || []) as SectionStudent[];
    }, [studentsData]);

    const filteredStudents = useMemo(() => {
        if (!searchTerm.trim()) return students;
        const q = searchTerm.toLowerCase();
        return students.filter(
            s =>
                s.firstName.toLowerCase().includes(q) ||
                s.lastName.toLowerCase().includes(q) ||
                (s.studentCode && s.studentCode.toLowerCase().includes(q))
        );
    }, [students, searchTerm]);

    if (!isOpen || !section) return null;

    const targetSlug = cycleId && section.slug?.endsWith(`-${cycleId}`)
        ? section.slug.slice(0, -(cycleId.length + 1))
        : section.slug || section.id;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                            <GraduationCap className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                Promedios en {section.name}
                                {section.average > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        Promedio Sección: {section.average.toFixed(1)} pts
                                    </span>
                                )}
                            </h3>
                            <p className="text-xs text-gray-500">
                                Calificaciones y rendimiento de los alumnos en esta materia
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
                        title="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-gray-100 bg-white">
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar estudiante por nombre o cédula..."
                            className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-gray-50/50"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isLoading ? (
                        <div className="py-12 text-center text-gray-400 text-xs">
                            Cargando estudiantes y notas...
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-xs">
                            {searchTerm ? 'No se encontraron estudiantes con ese criterio.' : 'No hay estudiantes inscritos en esta sección.'}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredStudents.map((student) => {
                                const avg = student.average || 0;
                                const hasGrade = avg > 0;

                                return (
                                    <div
                                        key={student.id}
                                        className="py-3 px-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <UserAvatar
                                                name={`${student.firstName} ${student.lastName}`}
                                                src={(student as any).avatar}
                                                className="h-9 w-9"
                                                initialsClassName="text-xs"
                                            />
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-gray-900 truncate">
                                                    {student.firstName} {student.lastName}
                                                </div>
                                                <div className="text-[11px] text-gray-400 truncate">
                                                    {student.studentCode || 'Sin cédula'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* Asistencia */}
                                            {student.attendancePercentage != null && (
                                                <span className="text-xs text-gray-500 font-medium hidden sm:inline-block">
                                                    {student.attendancePercentage}% asist.
                                                </span>
                                            )}

                                            {/* Badge Promedio Materia */}
                                            <span
                                                className={cn(
                                                    "px-2.5 py-1 rounded-lg text-xs font-bold shrink-0",
                                                    !hasGrade
                                                        ? "bg-gray-100 text-gray-500"
                                                        : avg >= 15
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                            : avg >= 10
                                                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                                : "bg-rose-50 text-rose-700 border border-rose-200"
                                                )}
                                            >
                                                {hasGrade ? `${avg.toFixed(1)} pts` : 'Sin calificar'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium">
                        Total: {filteredStudents.length} estudiantes
                    </span>
                    <Link
                        href={`/dashboard/academico/${cycleId}/${targetSlug}/${subjectId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline"
                    >
                        Ver panel completo de la materia
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
