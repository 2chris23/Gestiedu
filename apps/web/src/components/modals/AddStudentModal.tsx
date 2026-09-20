'use client';

import { useState } from 'react';
import { Search, X, UserPlus, AlertCircle, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { useAvailableStudents, useAssignStudent } from '@/hooks/useStudents';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Card } from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import UserAvatar from '@/components/ui/UserAvatar';

interface AddStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    academicYearId: string;
    onSuccess?: () => void;
}

export function AddStudentModal({
    isOpen,
    onClose,
    classroomId,
    academicYearId,
    onSuccess
}: AddStudentModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    // Debounce para no golpear el servidor por cada tecleo
    const debouncedSearch = useDebouncedValue(searchTerm, 300);

    // Fetch available students
    const { data: students, isLoading } = useAvailableStudents(
        debouncedSearch,
        academicYearId
    );

    // Mutation para inscribir
    const assignMutation = useAssignStudent();

    const toggleStudent = (studentId: string) => {
        setSelectedStudents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(studentId)) {
                newSet.delete(studentId);
            } else {
                newSet.add(studentId);
            }
            return newSet;
        });
    };

    const handleAddStudents = async () => {
        if (selectedStudents.size === 0) {
            toast.error('Selecciona al menos un estudiante');
            return;
        }

        try {
            setError(null);
            let successCount = 0;
            let errorCount = 0;

            // Agregar estudiantes uno por uno
            for (const studentId of Array.from(selectedStudents)) {
                try {
                    await assignMutation.mutateAsync({
                        studentId,
                        sectionId: classroomId
                    });
                    successCount++;
                } catch (err) {
                    errorCount++;
                    console.error(`Error agregando estudiante ${studentId}:`, err);
                }
            }

            // Mostrar resultado
            if (successCount > 0) {
                toast.success(`${successCount} estudiante${successCount > 1 ? 's' : ''} agregado${successCount > 1 ? 's' : ''} exitosamente`);
            }
            if (errorCount > 0) {
                toast.error(`${errorCount} estudiante${errorCount > 1 ? 's' : ''} no pudo${errorCount > 1 ? 'ieron' : ''} ser agregado${errorCount > 1 ? 's' : ''}`);
            }

            if (successCount > 0) {
                onSuccess?.();
                handleClose();
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Error al inscribir estudiantes';
            setError(errorMessage);
            toast.error(errorMessage);
        }
    };

    const handleClose = () => {
        setSearchTerm('');
        setSelectedStudents(new Set());
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-white">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">
                                Agregar Estudiantes
                            </h2>
                            <p className="text-sm text-gray-600 mt-1">
                                Selecciona uno o varios estudiantes para agregarlos a esta sección.
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="p-6 border-b bg-gray-50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o código..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            />
                        </div>
                        {selectedStudents.size > 0 && (
                            <p className="text-sm text-blue-600 font-medium mt-2">
                                {selectedStudents.size} estudiante{selectedStudents.size > 1 ? 's' : ''} seleccionado{selectedStudents.size > 1 ? 's' : ''}
                            </p>
                        )}
                    </div>

                    {/* Error Alert */}
                    <AnimatePresence>
                        {error && (
                            <div className="mx-6 mt-4">
                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                                    <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-red-800">Error al inscribir</p>
                                        <p className="text-sm text-red-700 mt-1">{error}</p>
                                    </div>
                                    <button
                                        onClick={() => setError(null)}
                                        className="text-red-400 hover:text-red-600"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Students List */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {isLoading ? (
                            <div className="text-center py-12">
                                <Loader2 className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-3" />
                                <p className="text-gray-600 font-medium">Cargando...</p>
                            </div>
                        ) : students && students.length > 0 ? (
                            <div className="space-y-2">
                                {students.map((student) => {
                                    const isSelected = selectedStudents.has(student.id);
                                    return (
                                        <div key={student.id}>
                                            <Card
                                                onClick={() => toggleStudent(student.id)}
                                                className={`p-4 cursor-pointer transition-all border-l-4 ${isSelected
                                                    ? 'border-l-blue-600 bg-blue-50 shadow-md'
                                                    : 'border-l-gray-300 hover:shadow-md hover:border-l-blue-400'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    {/* Checkbox */}
                                                    <div className="flex-shrink-0">
                                                        {isSelected ? (
                                                            <CheckCircle2 className="text-blue-600" size={24} />
                                                        ) : (
                                                            <Circle className="text-gray-400" size={24} />
                                                        )}
                                                    </div>

                                                    {/* Avatar */}
                                                    <UserAvatar
                                                        name={`${student.firstName} ${student.lastName}`}
                                                        src={(student as any).avatar}
                                                        className="h-12 w-12"
                                                        initialsClassName="text-lg"
                                                    />

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-gray-900 truncate">
                                                            {student.firstName} {student.lastName}
                                                        </p>
                                                        <p className="text-sm text-gray-600">{student.studentCode || student.id}</p>
                                                    </div>
                                                </div>
                                            </Card>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Search size={32} className="text-gray-400" />
                                </div>
                                <p className="text-gray-600 font-medium">
                                    No hay estudiantes inscritos en esta sección.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t bg-gray-50 flex gap-3">
                        <button
                            onClick={handleClose}
                            disabled={assignMutation.isPending}
                            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleAddStudents}
                            disabled={assignMutation.isPending || selectedStudents.size === 0}
                            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors font-medium"
                        >
                            {assignMutation.isPending ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Agregando...
                                </>
                            ) : (
                                <>
                                    <UserPlus size={20} />
                                    Agregar {selectedStudents.size > 0 ? `(${selectedStudents.size})` : ''}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </AnimatePresence>
    );
}
