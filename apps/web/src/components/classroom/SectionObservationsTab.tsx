'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Calendar,
  AlertCircle,
  Plus,
  Trash2,
  Users,
  BookOpen,
  User as UserIcon,
  Loader2,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { useClassroomObservations, useDeleteObservation, ClassroomObservationItem, InvolvedStudentInfo } from '@/hooks/useObservations';
import { useAuthStore } from '@/store/auth.store';
import UserAvatar from '@/components/ui/UserAvatar';

interface Props {
  classroomId: string;
}

export default function SectionObservationsTab({ classroomId }: Props) {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const { data, isLoading } = useClassroomObservations(classroomId, { search: searchTerm });
  const deleteMutation = useDeleteObservation();

  const observations = data?.observations || [];
  const canDelete = user?.role === 'ADMIN' || user?.role === 'TEACHER';

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar esta observación? Se eliminará del expediente de todos los estudiantes involucrados.')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden">
      {/* Header con buscador */}
      <div className="p-5 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/80">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">Historial de Observaciones</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              {observations.length} {observations.length === 1 ? 'incidencia' : 'incidencias'}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Registro de incidencias, notas de conducta y méritos en todas las asignaturas de la sección.
          </p>
        </div>

        <div className="relative max-w-sm w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs transition"
            placeholder="Buscar por alumno, título o descripción..."
          />
        </div>
      </div>

      {/* Listado */}
      <div className="p-6">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-9 h-9 animate-spin text-indigo-600 mb-2.5" />
            <p className="text-xs font-medium">Cargando observaciones de la sección...</p>
          </div>
        ) : observations.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3.5 shadow-2xs border border-amber-100">
              <Sparkles className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-gray-800">No hay observaciones registradas</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-md leading-relaxed">
              Las incidencias y observaciones registradas por los profesores durante las clases aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {observations.map((obs: ClassroomObservationItem) => {
              const rawDate = obs.date ? obs.date.split('T')[0] : '';
              const dateObj = new Date(`${rawDate}T12:00:00`);
              const dateFormatted = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('es-VE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : obs.date;

              const students = obs.students || [];
              const isExpanded = Boolean(expandedCards[obs.id]);
              const visibleStudents = isExpanded ? students : students.slice(0, 3);
              const hasMoreStudents = students.length > 3;

              const targetSubId = obs.subjectId || obs.subject?.id || '';
              const liveClassUrl = targetSubId
                ? `/dashboard/clase-en-vivo/${obs.classroomId || classroomId}/${targetSubId}?date=${rawDate}`
                : `/dashboard/academico`;

              return (
                <div
                  key={obs.id}
                  className="bg-white rounded-2xl border border-gray-200/90 hover:border-indigo-300/80 hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between gap-4 group"
                >
                  {/* Top: Fecha, Materia y Botón Eliminar */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-200/70 text-gray-700 shadow-2xs">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {dateFormatted}
                      </span>

                      {obs.subject && (
                        <span
                          className="px-2.5 py-0.5 rounded-lg text-xs font-bold text-white shadow-2xs"
                          style={{ backgroundColor: obs.subject.color || '#4f46e5' }}
                        >
                          {obs.subject.name}
                        </span>
                      )}

                      {students.length > 1 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          <Users className="w-3.5 h-3.5" />
                          {students.length} involucrados
                        </span>
                      )}
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(obs.id)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Eliminar observación"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Título y Descripción */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-gray-900 group-hover:text-indigo-950 transition-colors">
                      {obs.title}
                    </h4>
                    {obs.description && (
                      <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {obs.description}
                      </div>
                    )}
                  </div>

                  {/* Estudiantes Involucrados */}
                  <div className="space-y-2 pt-1 border-t border-gray-100">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                      {students.length === 1 ? 'Estudiante Implicado:' : `Estudiantes Implicados (${students.length}):`}
                    </span>

                    <div className="flex items-center gap-2 flex-wrap">
                      {visibleStudents.map((st: InvolvedStudentInfo) => (
                        <div
                          key={st.id}
                          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-gray-200/90 shadow-2xs hover:border-indigo-300 transition-colors"
                        >
                          <UserAvatar
                            name={st.name || 'Estudiante'}
                            src={st.avatar}
                            className="h-6 w-6"
                            initialsClassName="text-[10px]"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-gray-800 block truncate max-w-[140px]">
                              {st.name}
                            </span>
                            {st.classroomName && (
                              <span className="text-[10px] text-gray-400 block truncate">
                                {st.classroomName}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}

                      {hasMoreStudents && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(obs.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              Ver menos <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              +{students.length - 3} más <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Footer con Docente y Botón Directo a Clase en Vivo */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                      <span>
                        Profesor: <strong className="font-semibold text-gray-700">{obs.teacher?.name || 'Docente'}</strong>
                      </span>
                    </div>

                    {targetSubId && (
                      <Link
                        href={liveClassUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200/60 shadow-2xs transition-all duration-150"
                        title="Ir a la clase en vivo donde se registró"
                      >
                        <span>Ir a la clase</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
