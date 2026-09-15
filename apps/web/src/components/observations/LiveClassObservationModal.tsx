'use client';

import React, { useState } from 'react';
import {
  X,
  AlertCircle,
  Plus,
  Users,
  Search,
  Check,
  Trash2,
  Calendar,
  Loader2,
  FileText,
  UserPlus
} from 'lucide-react';
import { useCreateObservation, useDeleteObservation } from '@/hooks/useObservations';
import { useSearchStudents, SearchStudentResult } from '@/hooks/useLiveClass';
import { toast } from 'sonner';

interface StudentItem {
  id: string;
  firstName: string;
  lastName: string;
  studentCode?: string;
  avatar?: string | null;
  external?: boolean;
  originClassroom?: string | null;
}

interface SessionObservation {
  id: string;
  groupId: string | null;
  title: string;
  description: string | null;
  type: string;
  date: string;
  createdAt: string;
  teacher: string | null;
  students: Array<{
    id: string;
    name: string;
    studentCode?: string;
    avatar?: string | null;
  }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  subjectId: string;
  date: string;
  classSessionId?: string | null;
  students: StudentItem[];
  existingObservations: SessionObservation[];
  initialStudentId?: string | null;
  onObservationAdded?: () => void;
}

export default function LiveClassObservationModal({
  isOpen,
  onClose,
  classroomId,
  subjectId,
  date,
  classSessionId,
  students,
  existingObservations = [],
  initialStudentId,
  onObservationAdded,
}: Props) {
  const [isCreating, setIsCreating] = useState(Boolean(initialStudentId) || existingObservations.length === 0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(
    initialStudentId ? [initialStudentId] : []
  );

  React.useEffect(() => {
    if (isOpen) {
      if (initialStudentId) {
        const hasExisting = existingObservations.some(obs =>
          obs.students?.some(st => st.id === initialStudentId)
        );
        setIsCreating(!hasExisting);
        setSelectedStudentIds([initialStudentId]);
      } else {
        setIsCreating(existingObservations.length === 0);
      }
    }
  }, [isOpen, initialStudentId, existingObservations]);

  // External student modal
  const [showStudentSearch, setShowStudentSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { data: searchResults, isLoading: isSearching } = useSearchStudents(searchTerm);
  const [additionalStudents, setAdditionalStudents] = useState<StudentItem[]>([]);

  const createMutation = useCreateObservation();
  const deleteMutation = useDeleteObservation();

  if (!isOpen) return null;

  const allAvailableStudents = [
    ...students,
    ...additionalStudents.filter(as => !students.some(s => s.id === as.id)),
  ];

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const allIds = allAvailableStudents.map(s => s.id);
    if (selectedStudentIds.length === allIds.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(allIds);
    }
  };

  const handleAddExternalStudent = (s: SearchStudentResult) => {
    if (!allAvailableStudents.some(item => item.id === s.id)) {
      const newExternal: StudentItem = {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        studentCode: s.studentCode,
        avatar: s.avatar,
        external: true,
        originClassroom: s.classroomName ?? null,
      };
      setAdditionalStudents(prev => [...prev, newExternal]);
    }
    if (!selectedStudentIds.includes(s.id)) {
      setSelectedStudentIds(prev => [...prev, s.id]);
    }
    setShowStudentSearch(false);
    setSearchTerm('');
    toast.success(`${s.firstName} ${s.lastName} añadido a la lista`);
  };

  const handleSaveObservation = async () => {
    if (!title.trim()) {
      toast.error('Por favor escribe un título para la observación');
      return;
    }
    if (selectedStudentIds.length === 0) {
      toast.error('Selecciona al menos un estudiante involucrado');
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        type: 'OBSERVACION',
        date,
        studentIds: selectedStudentIds,
        classroomId,
        subjectId,
        classSessionId: classSessionId || undefined,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setSelectedStudentIds([]);
      setIsCreating(false);
      onObservationAdded?.();
    } catch {
      // handled in hook
    }
  };

  const handleDelete = async (obsId: string) => {
    if (window.confirm('¿Deseas eliminar esta observación?')) {
      await deleteMutation.mutateAsync(obsId);
      onObservationAdded?.();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Observaciones de la Clase</h3>
              <p className="text-xs text-gray-500">
                Registra incidentes, conducta o notas de los estudiantes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Top Bar: Lista de Observaciones ya guardadas vs Crear nueva */}
          {existingObservations.length > 0 && !isCreating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Observaciones en esta clase ({existingObservations.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Observación
                </button>
              </div>

              <div className="space-y-3">
                {existingObservations.map(obs => (
                  <div
                    key={obs.id}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <h4 className="font-bold text-sm text-gray-900">{obs.title}</h4>
                      <button
                        type="button"
                        onClick={() => handleDelete(obs.id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Eliminar observación"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {obs.description && (
                      <p className="text-xs text-gray-600 whitespace-pre-wrap">{obs.description}</p>
                    )}

                    {obs.students && obs.students.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-gray-200/60">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Involucrados:</span>
                        {obs.students.map(st => (
                          <span
                            key={st.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-md text-[11px] font-medium text-gray-800 shadow-2xs"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {st.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulario de Creación */}
          {isCreating && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {existingObservations.length > 0 && (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    ← Ver observaciones registradas ({existingObservations.length})
                  </button>
                </div>
              )}

              {/* Título */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Título de la Observación *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Pelea durante el receso, Falta de respeto, Tardanza..."
                  className="block w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Descripción Detallada
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe lo ocurrido en la sesión..."
                  className="block w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Selector de Estudiantes Involucrados */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-500" />
                    Estudiantes Involucrados ({selectedStudentIds.length})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      {selectedStudentIds.length === allAvailableStudents.length
                        ? 'Deseleccionar Todos'
                        : 'Seleccionar Todos'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStudentSearch(true)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 px-2 py-1 rounded-lg"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Agregar de Otra Sección
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50/50">
                  {allAvailableStudents.map(student => {
                    const isSelected = selectedStudentIds.includes(student.id);
                    return (
                      <div
                        key={student.id}
                        onClick={() => toggleStudent(student.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-gray-800 border-gray-200 hover:border-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
                            }`}
                          >
                            {student.firstName[0]}
                            {student.lastName[0]}
                          </div>
                          <div className="min-w-0 truncate">
                            <p className="text-xs font-bold truncate">
                              {student.firstName} {student.lastName}
                            </p>
                            {student.originClassroom && (
                              <p
                                className={`text-[10px] truncate ${
                                  isSelected ? 'text-indigo-200' : 'text-gray-400'
                                }`}
                              >
                                {student.originClassroom}
                              </p>
                            )}
                          </div>
                        </div>

                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                            isSelected
                              ? 'bg-white text-indigo-600 border-white'
                              : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-xl transition-colors"
          >
            Cerrar
          </button>

          {isCreating && (
            <button
              type="button"
              onClick={handleSaveObservation}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Observación
            </button>
          )}
        </div>
      </div>

      {/* Mini Modal para agregar estudiante de otra sección */}
      {showStudentSearch && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h4 className="text-sm font-bold text-gray-900">Buscar Estudiante de Otra Sección</h4>
              <button
                type="button"
                onClick={() => setShowStudentSearch(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  autoFocus
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nombre o cédula..."
                  className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {isSearching ? (
                  <div className="p-6 text-center text-xs text-gray-400">Buscando...</div>
                ) : !searchResults || searchResults.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    {searchTerm ? 'No se encontraron estudiantes.' : 'Escribe un nombre o cédula...'}
                  </div>
                ) : (
                  searchResults.map(s => (
                    <div
                      key={s.id}
                      onClick={() => handleAddExternalStudent(s)}
                      className="p-2.5 hover:bg-indigo-50/60 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div>
                        <p className="text-xs font-bold text-gray-900">
                          {s.firstName} {s.lastName}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {s.classroomName ?? 'Sin aula'}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-indigo-600" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
