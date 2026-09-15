'use client';

import React, { useState } from 'react';
import {
  X,
  AlertCircle,
  Calendar,
  BookOpen,
  User as UserIcon,
  Users,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText
} from 'lucide-react';
import { useStudentObservations, useDeleteObservation, StudentObservationItem } from '@/hooks/useObservations';
import { useAuthStore } from '@/store/auth.store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentCode?: string;
    avatar?: string | null;
  } | null;
}

export default function StudentObservationsModal({ isOpen, onClose, student }: Props) {
  const { user } = useAuthStore();
  const { data, isLoading } = useStudentObservations(student?.id);
  const deleteMutation = useDeleteObservation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isOpen || !student) return null;

  const observations = data?.observations || [];
  const canDelete = user?.role === 'ADMIN' || user?.role === 'TEACHER';

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('¿Estás seguro de eliminar esta observación?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm">
              {student.avatar ? (
                <img src={student.avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900">
                  {student.firstName} {student.lastName}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                  {observations.length} {observations.length === 1 ? 'observación' : 'observaciones'}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono">
                {student.studentCode ? `Cédula / Código: ${student.studentCode}` : student.id}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 divide-y divide-gray-100">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-xs">Cargando observaciones...</p>
            </div>
          ) : observations.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <h4 className="text-sm font-bold text-gray-800">Sin observaciones</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                Este estudiante no tiene observaciones registradas en su expediente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {observations.map((obs: StudentObservationItem) => {
                const isExpanded = expandedId === obs.id;
                const dateObj = new Date(obs.date || obs.createdAt);
                const dateStr = dateObj.toLocaleDateString('es-VE', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });

                return (
                  <div
                    key={obs.id}
                    onClick={() => toggleExpand(obs.id)}
                    className="border border-gray-200 rounded-xl p-4 hover:border-indigo-200 transition-all cursor-pointer bg-white shadow-2xs"
                  >
                    {/* Fila principal: Título, fecha y toggle */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-gray-900">{obs.title}</span>
                          {obs.subject && (
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-2xs"
                              style={{ backgroundColor: obs.subject.color || '#4f46e5' }}
                            >
                              {obs.subject.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            {dateStr}
                          </span>
                          {obs.teacher && (
                            <span className="flex items-center gap-1">
                              <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                              Prof. {obs.teacher.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, obs.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar observación"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Detalle expandido */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100 text-xs space-y-3 animate-in fade-in duration-150">
                        {/* Descripción */}
                        <div>
                          <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider block mb-1">
                            Descripción
                          </span>
                          <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-2.5 rounded-lg border border-gray-100 leading-relaxed">
                            {obs.description || 'Sin descripción detallada.'}
                          </p>
                        </div>

                        {/* Otros involucrados */}
                        {obs.otherInvolved && obs.otherInvolved.length > 0 && (
                          <div>
                            <span className="font-bold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1 mb-1.5">
                              <Users className="w-3.5 h-3.5 text-indigo-500" />
                              Otros Estudiantes Involucrados ({obs.otherInvolved.length})
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {obs.otherInvolved.map((p) => (
                                <div
                                  key={p.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50/80 border border-indigo-100 rounded-lg text-indigo-900"
                                >
                                  <div className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-800 text-[9px] font-bold flex items-center justify-center">
                                    {p.name[0]}
                                  </div>
                                  <span className="font-medium text-xs">{p.name}</span>
                                  {p.classroomName && (
                                    <span className="text-[10px] text-indigo-500 font-mono">
                                      ({p.classroomName})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
