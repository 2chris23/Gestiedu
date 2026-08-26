'use client';

import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Search, Book } from 'lucide-react';
import { toast } from 'sonner';
import { useAvailableSubjects } from '@/hooks/useAvailableSubjects';
import { useAssignSubjectToClassroom } from '@/hooks/useClassroomSubjects';

interface Subject {
    id: string;
    name: string;
    code: string;
    color: string;
    description?: string;
}

interface AssignSubjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    onSuccess: () => void;
}

export function AssignSubjectModal({ isOpen, onClose, classroomId, onSuccess }: AssignSubjectModalProps) {
    const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    // Use React Query hook for loading subjects
    const { data: subjects = [], isLoading, error, refetch } = useAvailableSubjects(classroomId);
    const assignMutation = useAssignSubjectToClassroom();

    useEffect(() => {
        if (isOpen) {
            setSelectedSubjects(new Set());
            setSearchTerm('');
            refetch();
        }
    }, [isOpen, refetch]);

    // Compute filtered subjects directly during render - no useEffect needed
    const filteredSubjects = searchTerm.trim() === ''
        ? subjects
        : subjects.filter((s) =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.code.toLowerCase().includes(searchTerm.toLowerCase())
        );

    const toggleSubject = (subjectId: string) => {
        const newSelected = new Set(selectedSubjects);
        if (newSelected.has(subjectId)) {
            newSelected.delete(subjectId);
        } else {
            newSelected.add(subjectId);
        }
        setSelectedSubjects(newSelected);
    };

    const handleAssign = async () => {
        if (selectedSubjects.size === 0) {
            toast.error('Selecciona al menos una materia');
            return;
        }

        setIsAssigning(true);
        try {
            // Asignar cada materia seleccionada usando el hook
            const promises = Array.from(selectedSubjects).map((subjectId) =>
                assignMutation.mutateAsync({
                    classroomId,
                    data: { subjectId }
                })
            );

            await Promise.all(promises);

            toast.success(`${selectedSubjects.size} materia(s) asignada(s) exitosamente`);
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error assigning subjects:', error);
            toast.error(error instanceof Error ? error.message : 'Error al asignar materias');
        } finally {
            setIsAssigning(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Agregar Materias">
            <div className="space-y-4">
                <p className="text-sm text-gray-600">
                    Selecciona una o varias materias para agregarlas a esta sección.
                </p>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>

                {/* Subjects List */}
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                    {isLoading ? (
                        <div className="p-8 text-center text-gray-500">
                            Cargando materias...
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center">
                            <div className="text-red-600 font-medium mb-2">Error</div>
                            <div className="text-sm text-gray-600">
                                {error instanceof Error ? error.message : 'Error al cargar materias disponibles'}
                            </div>
                            <button
                                onClick={() => refetch()}
                                className="mt-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                Reintentar
                            </button>
                        </div>
                    ) : filteredSubjects.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {searchTerm ? 'No se encontraron materias' : 'No hay materias disponibles'}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {filteredSubjects.map((subject) => (
                                <label
                                    key={subject.id}
                                    aria-label={subject.name}
                                    className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedSubjects.has(subject.id)}
                                        onChange={() => toggleSubject(subject.id)}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <div className="ml-3 flex items-center gap-3 flex-1">
                                        <div
                                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                                            style={{ backgroundColor: subject.color }}
                                        >
                                            <Book className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900">{subject.name}</p>
                                            <p className="text-xs text-gray-500">{subject.code}</p>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={onClose}
                        disabled={isAssigning}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={isAssigning || selectedSubjects.size === 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAssigning ? 'Asignando...' : `Agregar (${selectedSubjects.size})`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
