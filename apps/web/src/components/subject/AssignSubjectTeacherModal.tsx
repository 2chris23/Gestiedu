'use client';

import { useState } from 'react';
import { Clock, User, Search, CheckCircle, X, Loader2, BookOpen, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeachers } from '@/hooks/useTeachers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAssignTeacherToSubject, useUpdateClassroomSubject } from '@/hooks/useClassroomSubjects';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface AssignModalProps {
    sectionId: string;
    sectionName: string;
    subjectSlug: string;
    currentTeacherId?: string;
    initialWeeklyBlocks?: number;
    onClose: () => void;
}

export function AssignSubjectTeacherModal({ sectionId, sectionName, subjectSlug, currentTeacherId, initialWeeklyBlocks, onClose }: AssignModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTeacherId, setSelectedTeacherId] = useState(currentTeacherId || '');
    const [weeklyBlocks, setWeeklyBlocks] = useState(initialWeeklyBlocks || 4); // Default to 4 blocks
    const BLOCK_DURATION_MINUTES = 45;

    const totalMinutes = weeklyBlocks * BLOCK_DURATION_MINUTES;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const formattedDuration = `${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m` : ''}`;

    const debouncedSearch = useDebouncedValue(searchTerm, 300);
    const { data: teachersData, isLoading: loadingTeachers } = useTeachers(debouncedSearch);
    const assignTeacher = useAssignTeacherToSubject();
    const updateConfig = useUpdateClassroomSubject();
    const queryClient = useQueryClient();

    const teachers: any[] = Array.isArray(teachersData) ? teachersData : [];

    const handleSave = async () => {
        if (!selectedTeacherId) {
            toast.error('Selecciona un profesor');
            return;
        }

        try {
            // Assign teacher to this classroom-subject pair
            await assignTeacher.mutateAsync({
                classroomId: sectionId,
                subjectId: subjectSlug,
                data: { teacherId: selectedTeacherId },
            });

            // Update weekly hours (converting blocks to hours conceptually, backend expects hoursPerWeek for now)
            await updateConfig.mutateAsync({
                classroomId: sectionId,
                subjectId: subjectSlug,
                data: { 
                    hoursPerWeek: totalMinutes / 60, // Store actual hours in hoursPerWeek
                    weeklyBlocks: weeklyBlocks       // Ensure backend schema can accept this or handle it
                },
            });

            // Invalidate queries so parent page refreshes
            queryClient.invalidateQueries({ queryKey: ['subject'] });
            queryClient.invalidateQueries({ queryKey: ['subjects'] });
            queryClient.invalidateQueries({ queryKey: ['classroomSubject'] });

            toast.success('Profesor y bloques asignados correctamente');
            onClose();
        } catch (err) {
            // errors are handled by the mutation hooks
        }
    };

    const isSaving = assignTeacher.isPending || updateConfig.isPending;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Asignar Profesor">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-white font-bold text-lg">Asignar Profesor</h2>
                        <p className="text-indigo-200 text-sm mt-0.5">Sección: <span className="font-semibold text-white">{sectionName}</span></p>
                    </div>
                    <button aria-label="Cerrar" onClick={onClose} className="p-2 rounded-lg hover:bg-indigo-500 text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Bloques semanales */}
                    <div>
                        <label htmlFor="weeklyBlocks" className="block text-sm font-semibold text-gray-700 mb-2">
                            <Clock size={14} className="inline mr-1 text-indigo-500" />
                            Bloques de clase semanales
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                id="weeklyBlocks"
                                min={1}
                                max={20}
                                value={weeklyBlocks}
                                onChange={(e) => setWeeklyBlocks(Number(e.target.value))}
                                className="flex-1 accent-indigo-600"
                            />
                            <div className="w-20 text-center">
                                <span className="text-2xl font-bold text-indigo-600">{weeklyBlocks}</span>
                                <span className="text-xs text-gray-500 block">bloques</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-1">
                            <div className="flex justify-between w-full text-gray-400">
                                <span>1 bloque</span>
                                <span>20 bloques</span>
                            </div>
                        </div>
                        <p className="text-sm font-medium text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg mt-3 flex items-center justify-between">
                            <span>Tiempo total asignado:</span>
                            <span className="font-bold">{formattedDuration}</span>
                        </p>
                    </div>

                    {/* Búsqueda de profesores */}
                    <div>
                        <label htmlFor="teacherSearch" className="block text-sm font-semibold text-gray-700 mb-2">
                            <User size={14} className="inline mr-1 text-indigo-500" />
                            Seleccionar Profesor
                        </label>
                        <div className="relative mb-3">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                id="teacherSearch"
                                placeholder="Buscar profesor..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>

                        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                            {loadingTeachers ? (
                                <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                                    <Loader2 size={18} className="animate-spin" />
                                    <span className="text-sm">Cargando profesores...</span>
                                </div>
                            ) : !Array.isArray(teachers) || teachers.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">No hay profesores disponibles</p>
                                </div>
                            ) : (
                                teachers.map((teacher: any) => {
                                    const teacherId = teacher.id;
                                    const fullName = teacher.firstName
                                        ? `${teacher.firstName} ${teacher.lastName}`
                                        : teacher.name || 'Sin nombre';
                                    const isSelected = selectedTeacherId === teacherId;

                                    return (
                                        <button
                                            key={teacherId}
                                            onClick={() => setSelectedTeacherId(teacherId)}
                                            className={cn(
                                                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-b-0',
                                                isSelected
                                                    ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                                                    : 'hover:bg-gray-50'
                                            )}
                                        >
                                            <div className={cn(
                                                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                                                isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                                            )}>
                                                {fullName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    'text-sm font-semibold truncate',
                                                    isSelected ? 'text-indigo-700' : 'text-gray-900'
                                                )}>
                                                    {fullName}
                                                </p>
                                                <p className="text-xs text-gray-400 truncate">{teacher.email}</p>
                                                <div className="text-right flex-shrink-0">
                                                    <span className="text-xs font-semibold text-gray-600 block">
                                                        {(teacher.totalWeeklyHours || 0).toFixed(1)}h actuales
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">
                                                        {teacher.totalWeeklyBlocks || 0} bloques
                                                    </span>
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 ml-2" />
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Panel Predictivo de Carga Horaria */}
                        {(() => {
                            const selectedTeacher = teachers.find((t: any) => t.id === selectedTeacherId);
                            if (!selectedTeacher) return null;

                            const currentHours = selectedTeacher.totalWeeklyHours || 0;
                            const additionalHours = totalMinutes / 60;
                            const projectedTotalHours = currentHours + additionalHours;
                            const isNearLimit = projectedTotalHours >= 30 && projectedTotalHours <= 40;
                            const isOverLimit = projectedTotalHours > 40;

                            return (
                                <div className={cn(
                                    "mt-4 p-4 rounded-xl border transition-all",
                                    isOverLimit
                                        ? "bg-rose-50 border-rose-200 text-rose-900"
                                        : isNearLimit
                                            ? "bg-amber-50 border-amber-200 text-amber-900"
                                            : "bg-indigo-50/70 border-indigo-100 text-indigo-950"
                                )}>
                                    <div className="flex items-center justify-between text-xs font-bold mb-2">
                                        <span>Proyección de Carga Horaria Docente</span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[11px]",
                                            isOverLimit ? "bg-rose-200 text-rose-800" : isNearLimit ? "bg-amber-200 text-amber-800" : "bg-indigo-200 text-indigo-800"
                                        )}>
                                            Límite recomendado: 30 - 40h
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center py-2 bg-white/80 rounded-lg border border-gray-100">
                                        <div>
                                            <p className="text-[11px] text-gray-500 font-medium">Horas Actuales</p>
                                            <p className="text-sm font-bold text-gray-800">{currentHours.toFixed(1)}h</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-indigo-600 font-medium">+ Suma Esta Clase</p>
                                            <p className="text-sm font-bold text-indigo-600">+{additionalHours.toFixed(1)}h</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-gray-500 font-medium">Total Resultante</p>
                                            <p className={cn(
                                                "text-sm font-black",
                                                isOverLimit ? "text-rose-600" : isNearLimit ? "text-amber-600" : "text-indigo-700"
                                            )}>
                                                {projectedTotalHours.toFixed(1)}h / sem
                                            </p>
                                        </div>
                                    </div>

                                    {isOverLimit && (
                                        <p className="text-xs text-rose-700 font-medium mt-2 flex items-center gap-1.5">
                                            <AlertCircle size={14} className="shrink-0" />
                                            Atención: El docente superará el límite máximo pedagógico de 40 horas semanales.
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !selectedTeacherId}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                        ) : (
                            'Confirmar Asignación'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
