'use client';

import { use, useMemo } from 'react';
import { ChevronLeft, Edit } from 'lucide-react';
import Link from 'next/link';
import { useTeachers } from '@/hooks/useTeachers';
import { useTeacherScheduleBlocks, useTeacherClassroomSubjects } from '@/hooks/useSchedules';
import TeacherScheduleEditor from '@/components/schedule/TeacherScheduleEditor';

export default function TeacherScheduleEditorPage({
    params,
}: {
    params: Promise<{ teacherId: string }>;
}) {
    const { teacherId } = use(params);
    const { data: teachersData, isLoading: isLoadingTeachers } = useTeachers();
    const { data: blocks, isLoading: isLoadingSchedule } = useTeacherScheduleBlocks(teacherId);
    const { data: assignments, isLoading: isLoadingAssignments } = useTeacherClassroomSubjects(teacherId);

    const teacher = useMemo(() => {
        const list = Array.isArray(teachersData) ? teachersData : teachersData?.users || [];
        return list.find((t: any) => t.id === teacherId) || null;
    }, [teachersData, teacherId]);

    const isLoading = isLoadingTeachers || isLoadingSchedule || isLoadingAssignments;
    const scheduleBlocks = blocks || [];

    const sectionCount = useMemo(() => {
        const ids = new Set(
            scheduleBlocks
                .map((b: any) => b.classroomSubject?.classroom?.id)
                .filter(Boolean)
        );
        return ids.size;
    }, [scheduleBlocks]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link
                    href="/dashboard/horarios"
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Volver a Horarios
                </Link>
            </div>

            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Edit className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-seccion font-bold sm:text-pantalla">
                            Horario del Profesor
                            {teacher ? `: ${teacher.firstName} ${teacher.lastName}` : ''}
                        </h1>
                        <p className="text-indigo-100 text-sm mt-0.5">
                            {scheduleBlocks.length} bloques
                            {sectionCount > 0 && ` · ${sectionCount} ${sectionCount === 1 ? 'sección' : 'secciones'}`}
                        </p>
                    </div>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span className="ml-3 text-gray-500">Cargando horario...</span>
                </div>
            )}

            {!isLoading && (
                <TeacherScheduleEditor teacherId={teacherId} initialBlocks={scheduleBlocks} assignments={assignments || []} />
            )}
        </div>
    );
}
