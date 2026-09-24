'use client';

import { use } from 'react';
import { ChevronLeft, Calendar, Edit } from 'lucide-react';
import Link from 'next/link';
import { useClassroom } from '@/hooks/useClassrooms';
import { useClassroomSubjects } from '@/hooks/useClassroomSubjects';
import { useClassroomSchedule } from '@/hooks/useSchedules';
import ClassroomScheduleEditor from '@/components/schedule/ClassroomScheduleEditor';

export default function ScheduleEditorPage({ params }: { params: Promise<{ classroomId: string }> }) {
    const { classroomId } = use(params);
    const { data: classroom, isLoading: isLoadingClassroom } = useClassroom(classroomId);
    const { data: subjectsData, isLoading: isLoadingSubjects } = useClassroomSubjects(classroomId);
    const { data: scheduleData, isLoading: isLoadingSchedule } = useClassroomSchedule(classroomId);

    const isLoading = isLoadingClassroom || isLoadingSubjects || isLoadingSchedule;

    const subjects = subjectsData || [];
    const blocks = scheduleData || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/horarios"
                        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Volver a Horarios
                    </Link>
                </div>
            </div>

            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Edit className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-seccion font-bold sm:text-pantalla">
                            Editor de Horario{classroom ? `: ${classroom.name}` : ''}
                        </h1>
                        <p className="text-blue-100 text-sm mt-0.5">
                            {classroom?.teacher
                                ? `Prof. Guía: ${classroom.teacher.firstName} ${classroom.teacher.lastName}`
                                : 'Sin profesor guía'}
                            {subjects.length > 0 && ` · ${subjects.length} materias asignadas`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span className="ml-3 text-gray-500">Cargando editor...</span>
                </div>
            )}

            {/* Editor */}
                    {!isLoading && classroomId && (
                <ClassroomScheduleEditor
                    classroomId={classroomId}
                    initialBlocks={blocks}
                    subjects={subjects}
                    titulo={classroom?.name}
                />
            )}
        </div>
    );
}
