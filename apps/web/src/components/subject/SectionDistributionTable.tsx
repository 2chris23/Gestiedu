'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, UserPlus, AlertCircle, X, User, BookOpen, Search, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeachers } from '@/hooks/useTeachers';
import { useAssignTeacherToSubject, useUpdateClassroomSubject } from '@/hooks/useClassroomSubjects';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AssignSubjectTeacherModal } from './AssignSubjectTeacherModal';
import UserAvatar from '@/components/ui/UserAvatar';

interface Section {
    id: string;
    name: string;
    slug?: string;
    weeklyBlocks?: number;
    hoursPerWeek?: number;
    teacher?: {
        id?: string;
        name: string;
        email?: string;
        avatar?: string;
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

export function SectionDistributionTable({ sections, subjectId, cycleId = '2025-2026' }: DistributionTableProps) {
    const [assigningSection, setAssigningSection] = useState<Section | null>(null);

    return (
        <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Distribución de Secciones</h3>
                        <p className="text-sm text-gray-500">Secciones donde se imparte esta materia</p>
                    </div>
                    <span className="bg-white px-2.5 py-1 rounded-md text-xs font-bold border border-gray-200 text-gray-600 shadow-sm">
                        {sections.length} Secciones
                    </span>
                </div>

                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-3 w-1/4">Sección</th>
                                <th className="px-6 py-3 w-1/4">Profesor Titular</th>
                                <th className="px-6 py-3">Horario</th>
                                <th className="px-6 py-3 text-center">Promedio</th>
                                <th className="px-6 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sections.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                                        No hay secciones asignadas en este ciclo.
                                    </td>
                                </tr>
                            ) : (
                                sections.map((section) => {
                                    const hasTeacher = !!section.teacher;
                                    return (
                                        <tr
                                            key={section.id}
                                            className={cn(
                                                "group transition-colors",
                                                !hasTeacher ? "bg-red-50/30 hover:bg-red-50/60" : "hover:bg-gray-50/50"
                                            )}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 text-base">{section.name}</div>
                                                <div className="text-xs text-gray-400 mt-0.5">{section.studentCount} Estudiantes</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {hasTeacher ? (
                                                    <button
                                                        onClick={() => setAssigningSection(section)}
                                                        className="flex items-center gap-3 group/teacher hover:opacity-80 transition-opacity"
                                                        title="Cambiar profesor"
                                                    >
                                                        <UserAvatar
                                                            name={section.teacher!.name}
                                                            src={section.teacher!.avatar}
                                                            className="h-8 w-8"
                                                            initialsClassName="text-xs"
                                                        />
                                                        <span className="font-medium text-gray-700 group-hover/teacher:text-indigo-600 transition-colors">
                                                            {section.teacher!.name}
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-red-500 bg-red-50 px-3 py-1.5 rounded-lg w-fit border border-red-100">
                                                        <AlertCircle size={14} />
                                                        <span className="text-xs font-bold">Sin asignar</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-gray-600 bg-gray-50 px-2.5 py-1 rounded-md w-fit border border-gray-100">
                                                    <Clock size={14} className="text-gray-400" />
                                                    <span className="text-xs font-medium font-mono">
                                                        {section.schedule !== 'Por definir'
                                                            ? section.schedule
                                                            : (section.hoursPerWeek && section.hoursPerWeek > 0
                                                                ? `${section.hoursPerWeek}h semanales`
                                                                : 'Por definir')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn(
                                                    "font-bold px-2 py-0.5 rounded text-sm",
                                                    section.average >= 15 ? "text-emerald-600 bg-emerald-50" :
                                                        section.average >= 10 ? "text-amber-600 bg-amber-50" :
                                                            "text-red-600 bg-red-50"
                                                )}>
                                                    {section.average.toFixed(1)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {hasTeacher ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => setAssigningSection(section)}
                                                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            <User size={13} />
                                                            Cambiar
                                                        </button>
                                                        <Link
                                                            href={`/dashboard/academico/${cycleId}/${
                                                                cycleId && section.slug?.endsWith(`-${cycleId}`)
                                                                    ? section.slug.slice(0, -(cycleId.length + 1))
                                                                    : section.slug || section.id
                                                            }/${subjectId}`}
                                                            className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            Ver Detalles
                                                            <ArrowRight size={16} />
                                                        </Link>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setAssigningSection(section)}
                                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg shadow-sm shadow-indigo-200 transition-all"
                                                    >
                                                        <UserPlus size={14} />
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
            </div>

            {/* Modal */}
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
        </>
    );
}
