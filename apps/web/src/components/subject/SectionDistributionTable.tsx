'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, UserPlus, AlertCircle, ChevronDown, ChevronUp, User, BookOpen, GraduationCap, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssignSubjectTeacherModal } from './AssignSubjectTeacherModal';
import SubjectSectionStudentsModal from './SubjectSectionStudentsModal';
import UserAvatar from '@/components/ui/UserAvatar';

interface Section {
    id: string;
    name: string;
    slug?: string;
    grade?: number;
    weeklyBlocks?: number;
    hoursPerWeek?: number;
    teacher?: {
        id?: string;
        name: string;
        email?: string;
        avatar?: string | null;
    } | null;
    schedule: string;
    average: number;
    studentCount: number;
}

interface DistributionTableProps {
    sections: Section[];
    subjectId: string;
    cycleId?: string;
}

const GRADE_NAMES: Record<number, string> = {
    1: 'Primer Año',
    2: 'Segundo Año',
    3: 'Tercer Año',
    4: 'Cuarto Año',
    5: 'Quinto Año',
};

export function SectionDistributionTable({ sections, subjectId, cycleId = '2025-2026' }: DistributionTableProps) {
    const [assigningSection, setAssigningSection] = useState<Section | null>(null);
    const [viewingStudentsSection, setViewingStudentsSection] = useState<Section | null>(null);
    const [expandedGrades, setExpandedGrades] = useState<Record<number, boolean>>({
        1: true,
        2: true,
        3: true,
        4: true,
        5: true,
    });

    const toggleGrade = (grade: number) => {
        setExpandedGrades(prev => ({
            ...prev,
            [grade]: !prev[grade]
        }));
    };

    // Agrupar secciones por grado
    const sectionsByGrade = useMemo(() => {
        const grouped: Record<number, Section[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        sections.forEach(sec => {
            let grade = sec.grade;
            if (!grade) {
                const match = sec.name.match(/(\d+)/);
                grade = match ? parseInt(match[1], 10) : 1;
            }
            if (grouped[grade]) {
                grouped[grade].push(sec);
            } else {
                grouped[grade] = [sec];
            }
        });

        // Ordenar secciones alfabéticamente (A, B, C, D)
        Object.keys(grouped).forEach(k => {
            grouped[Number(k)].sort((a, b) => a.name.localeCompare(b.name));
        });

        return grouped;
    }, [sections]);

    return (
        <>
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
                    <div>
                        <h3 className="text-base font-bold text-gray-900">Distribución por Niveles Académicos</h3>
                        <p className="text-xs text-gray-500">Organización por año y secciones asignadas</p>
                    </div>
                    <span className="bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs border border-indigo-100">
                        {sections.length} Secciones Activas
                    </span>
                </div>

                {[1, 2, 3, 4, 5].map((grade) => {
                    const gradeSections = sectionsByGrade[grade] || [];
                    const isExpanded = expandedGrades[grade] ?? true;
                    const totalStudentsInGrade = gradeSections.reduce((sum, s) => sum + s.studentCount, 0);
                    const teachersAssignedCount = gradeSections.filter(s => !!s.teacher).length;

                    return (
                        <div key={grade} className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden transition-all">
                            {/* Cabecera del Año (Click para colapsar/expandir) */}
                            <button
                                type="button"
                                onClick={() => toggleGrade(grade)}
                                className="w-full px-5 py-4 flex items-center justify-between bg-gray-50/60 hover:bg-gray-100/70 transition-colors border-b border-gray-100 text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                                        {grade}º
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-base">{GRADE_NAMES[grade]}</h4>
                                        <p className="text-xs text-gray-500">
                                            {gradeSections.length} {gradeSections.length === 1 ? 'sección' : 'secciones'} • {totalStudentsInGrade} estudiantes
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "text-xs font-semibold px-2.5 py-1 rounded-full border",
                                        teachersAssignedCount === gradeSections.length && gradeSections.length > 0
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-amber-50 text-amber-700 border-amber-200"
                                    )}>
                                        {teachersAssignedCount}/{gradeSections.length} Docentes asignados
                                    </span>
                                    <div className="p-1 rounded-lg bg-white border border-gray-200 text-gray-400">
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>
                            </button>

                            {/* Secciones del Año */}
                            {isExpanded && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50/40 text-gray-400 text-xs font-semibold uppercase tracking-wider border-b border-gray-100">
                                            <tr>
                                                <th className="px-5 py-2.5 w-1/4">Sección</th>
                                                <th className="px-5 py-2.5 w-1/3">Profesor Titular</th>
                                                <th className="px-5 py-2.5">Carga Horaria</th>
                                                <th className="px-5 py-2.5 text-center">Promedio</th>
                                                <th className="px-5 py-2.5 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {gradeSections.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-5 py-6 text-center text-gray-400 text-xs italic">
                                                        No hay secciones creadas para este año en este ciclo.
                                                    </td>
                                                </tr>
                                            ) : (
                                                gradeSections.map((section) => {
                                                    const hasTeacher = !!section.teacher;
                                                    const hours = section.hoursPerWeek ?? ((section.weeklyBlocks ?? 4) * 45 / 60);
                                                    const blocks = section.weeklyBlocks ?? 4;

                                                    return (
                                                        <tr
                                                            key={section.id}
                                                            className={cn(
                                                                "group transition-colors",
                                                                !hasTeacher ? "bg-red-50/20 hover:bg-red-50/40" : "hover:bg-gray-50/50"
                                                            )}
                                                        >
                                                            <td className="px-5 py-3.5">
                                                                <div className="font-bold text-gray-900 text-sm">{section.name}</div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setViewingStudentsSection(section)}
                                                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold hover:underline mt-0.5"
                                                                    title="Ver estudiantes y sus notas en esta materia"
                                                                >
                                                                    <Users size={12} />
                                                                    {section.studentCount} Estudiantes
                                                                </button>
                                                            </td>
                                                            <td className="px-5 py-3.5">
                                                                {hasTeacher ? (
                                                                    <button
                                                                        onClick={() => setAssigningSection(section)}
                                                                        className="flex items-center gap-2.5 group/teacher hover:opacity-80 transition-opacity text-left"
                                                                        title="Cambiar profesor"
                                                                    >
                                                                        <UserAvatar
                                                                            name={section.teacher!.name}
                                                                            src={section.teacher!.avatar}
                                                                            className="h-8 w-8 shrink-0"
                                                                            initialsClassName="text-xs"
                                                                        />
                                                                        <div className="min-w-0">
                                                                            <span className="font-semibold text-gray-800 text-xs group-hover/teacher:text-indigo-600 transition-colors block truncate">
                                                                                {section.teacher!.name}
                                                                            </span>
                                                                            <span className="text-[11px] text-gray-400 block truncate">
                                                                                {section.teacher!.email}
                                                                            </span>
                                                                        </div>
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md w-fit border border-rose-100">
                                                                        <AlertCircle size={13} />
                                                                        <span className="text-[11px] font-bold">Sin profesor asignado</span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-5 py-3.5">
                                                                <div className="flex items-center gap-1.5 text-gray-700 bg-gray-50 px-2.5 py-1 rounded-md w-fit border border-gray-200/60">
                                                                    <Clock size={13} className="text-indigo-500" />
                                                                    <span className="text-xs font-semibold">
                                                                        {hours.toFixed(1)}h / sem
                                                                    </span>
                                                                    <span className="text-[11px] text-gray-400">
                                                                        ({blocks} blq)
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setViewingStudentsSection(section)}
                                                                    title="Ver notas de los estudiantes"
                                                                    className={cn(
                                                                        "font-bold px-2 py-0.5 rounded text-xs transition-transform hover:scale-105",
                                                                        section.average >= 15 ? "text-emerald-700 bg-emerald-50 border border-emerald-200" :
                                                                            section.average >= 10 ? "text-amber-700 bg-amber-50 border border-amber-200" :
                                                                                "text-gray-600 bg-gray-100"
                                                                    )}
                                                                >
                                                                    {section.average > 0 ? `${section.average.toFixed(1)} pts` : '—'}
                                                                </button>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right">
                                                                {hasTeacher ? (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <button
                                                                            onClick={() => setAssigningSection(section)}
                                                                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition-colors bg-white"
                                                                        >
                                                                            <User size={12} />
                                                                            Cambiar
                                                                        </button>
                                                                        <Link
                                                                            href={`/dashboard/academico/${cycleId}/${
                                                                                cycleId && section.slug?.endsWith(`-${cycleId}`)
                                                                                    ? section.slug.slice(0, -(cycleId.length + 1))
                                                                                    : section.slug || section.id
                                                                            }/${subjectId}`}
                                                                            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                                                                        >
                                                                            Ver Detalles
                                                                            <ArrowRight size={14} />
                                                                        </Link>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setAssigningSection(section)}
                                                                        className="inline-flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg shadow-xs transition-all"
                                                                    >
                                                                        <UserPlus size={13} />
                                                                        Asignar
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Modal de Asignación con cálculo predictivo */}
            {assigningSection && (
                <AssignSubjectTeacherModal
                    sectionId={assigningSection.id}
                    sectionName={assigningSection.name}
                    subjectSlug={subjectId}
                    currentTeacherId={assigningSection.teacher?.id}
                    initialWeeklyBlocks={assigningSection.weeklyBlocks}
                    onClose={() => setAssigningSection(null)}
                />
            )}

            {/* Modal de Estudiantes y Notas de la Materia */}
            {viewingStudentsSection && (
                <SubjectSectionStudentsModal
                    isOpen={Boolean(viewingStudentsSection)}
                    onClose={() => setViewingStudentsSection(null)}
                    section={viewingStudentsSection}
                    subjectId={subjectId}
                    cycleId={cycleId}
                />
            )}
        </>
    );
}
