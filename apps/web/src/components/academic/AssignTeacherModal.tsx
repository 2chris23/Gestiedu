import React, { useState } from 'react';
import Image from 'next/image';
import { X, Search, UserPlus, Check } from 'lucide-react';
import { useTeachers, useAssignTeacher } from '@/hooks/useTeachers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Teacher } from '@/services/teachers.service';
import UserAvatar from '@/components/ui/UserAvatar';

interface AssignTeacherModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    classroomName: string;
    currentTeacher?: {
        id: string;
        firstName: string;
        lastName: string;
    };
    onSuccess?: () => void;
}

export default function AssignTeacherModal({
    isOpen,
    onClose,
    classroomId,
    classroomName,
    currentTeacher
}: AssignTeacherModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(currentTeacher?.id || null);

    const debouncedSearch = useDebouncedValue(searchTerm, 300);
    const { data: teachers, isLoading } = useTeachers(debouncedSearch);
    const assignMutation = useAssignTeacher();

    const handleAssign = async () => {
        if (!selectedTeacherId) return;

        try {
            await assignMutation.mutateAsync({
                classroomId,
                teacherId: selectedTeacherId
            });
            onClose();
        } catch (error) {
            // Error handled by mutation
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={currentTeacher ? 'Cambiar Profesor Guía' : 'Asignar Profesor Guía'}>
            <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <UserPlus size={20} className="text-indigo-600" />
                            {currentTeacher ? 'Cambiar Profesor Guía' : 'Asignar Profesor Guía'}
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Sección: <span className="font-semibold">{classroomName}</span>
                        </p>
                    </div>
                    <button aria-label="Cerrar"
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                            placeholder="Buscar profesor por nombre..."
                        />
                    </div>
                </div>

                {/* Teachers List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Cargando profesores...</div>
                    ) : teachers && teachers.length > 0 ? (
                        <div className="space-y-2">
                            {teachers.map((teacher: Teacher) => {
                                const isSelected = selectedTeacherId === teacher.id;
                                const isCurrent = currentTeacher?.id === teacher.id;

                                return (
                                    <button
                                        key={teacher.id}
                                        onClick={() => setSelectedTeacherId(teacher.id)}
                                        className={`w-full p-4 rounded-lg border-2 transition-all text-left ${isSelected
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {/* Avatar */}
                                                <UserAvatar
                                                    name={`${teacher.firstName} ${teacher.lastName}`}
                                                    src={teacher.avatar}
                                                    className="h-12 w-12 shadow-md"
                                                    initialsClassName="text-sm"
                                                />

                                                {/* Info */}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-gray-900">
                                                            {teacher.firstName} {teacher.lastName}
                                                        </h3>
                                                        {isCurrent && (
                                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                                                Actual
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-600">{teacher.email}</p>
                                                </div>
                                            </div>

                                            {/* Check Icon */}
                                            {isSelected && (
                                                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                                                    <Check size={16} className="text-white" />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No se encontraron profesores
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={!selectedTeacherId || assignMutation.isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {assignMutation.isPending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Asignando...
                            </>
                        ) : (
                            <>
                                <UserPlus size={16} />
                                {currentTeacher ? 'Cambiar Profesor' : 'Asignar Profesor'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
