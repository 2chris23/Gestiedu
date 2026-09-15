'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ListTodo,
  Calendar,
  Clock,
  Sparkles,
  BookOpen,
  Award,
  ArrowRight,
  CheckCircle2,
  Loader2,
  FileText,
  ExternalLink
} from 'lucide-react';
import { useClassActivities, ClassActivity } from '@/hooks/useLiveClass';
import { useEvaluationPlanRows } from '@/hooks/useEvaluationPlan';

interface Props {
  classroomId: string;
  subjectId: string;
  cycleId: string;
  sectionId: string;
  totalStudents?: number;
}

const TAG_STYLES: Record<string, string> = {
  Examen: 'bg-rose-50 text-rose-700 border-rose-200',
  Tarea: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Taller: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Proyecto: 'bg-purple-50 text-purple-700 border-purple-200',
  Quiz: 'bg-amber-50 text-amber-700 border-amber-200',
  Aviso: 'bg-sky-50 text-sky-700 border-sky-200',
};

function formatDayDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const raw = typeof value === 'string' ? value.split('T')[0] : value.toISOString().split('T')[0];
  const parts = raw.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export default function SubjectActivitiesTab({
  classroomId,
  subjectId,
  cycleId,
  sectionId,
  totalStudents = 30,
}: Props) {
  const [selectedLapso, setSelectedLapso] = useState('1');

  // Obtener actividades
  const { data: activitiesData, isLoading: isLoadingActivities } = useClassActivities(classroomId, subjectId);
  const activities: ClassActivity[] = activitiesData?.activities || [];

  // Obtener plan de evaluación para vincular el Tema Generador
  const { data: planData, isLoading: isLoadingPlan } = useEvaluationPlanRows({
    classroomId,
    subjectId,
    lapso: selectedLapso,
  });

  const planRows = planData?.rows || [];
  const planRowMap = new Map<string, any>(planRows.map(r => [r.id, r]));

  // Filtrar actividades por lapso seleccionado (si están vinculadas por planRow o por fecha estimada)
  const filteredActivities = activities.filter(act => {
    if (act.planRowId) {
      const row = planRowMap.get(act.planRowId);
      if (row) return row.lapso === selectedLapso;
    }
    if (!act.planRowId) {
      if (selectedLapso === '1') return true;
    }
    return false;
  });

  const isLoading = isLoadingActivities || isLoadingPlan;

  return (
    <div className="space-y-6">
      {/* Selector de los 3 Lapsos */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-gray-900">Actividades por Lapso</h3>
        </div>

        <div className="flex items-center gap-2">
          {[
            { id: '1', label: '1er Momento', color: 'from-blue-600 to-indigo-600' },
            { id: '2', label: '2do Momento', color: 'from-purple-600 to-indigo-600' },
            { id: '3', label: '3er Momento', color: 'from-amber-500 to-orange-600' },
          ].map(l => (
            <button
              key={l.id}
              onClick={() => setSelectedLapso(l.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedLapso === l.id
                  ? `bg-gradient-to-r ${l.color} text-white shadow-md`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Actividades */}
      {isLoading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 flex flex-col items-center justify-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
          <p className="text-xs font-medium">Cargando actividades del {selectedLapso}º Momento...</p>
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <ListTodo className="w-7 h-7 text-gray-400" />
          </div>
          <h4 className="text-base font-bold text-gray-800">No hay actividades registradas en este lapso</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Las actividades, exámenes y tareas creadas por el docente durante las clases en vivo se organizarán aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredActivities.map((act, idx) => {
            // Contar notas / entregas
            let gradedCount = 0;
            if (act.scores) {
              try {
                const parsed = typeof act.scores === 'string' ? JSON.parse(act.scores) : act.scores;
                gradedCount = Object.values(parsed).filter(val => val !== null && val !== undefined).length;
              } catch {
                gradedCount = 0;
              }
            }

            const targetStudents = totalStudents || 30;
            const progressPct = targetStudents > 0 ? Math.min(100, Math.round((gradedCount / targetStudents) * 100)) : 0;

            // Tema Generador asociado
            let temaGenerador: string | null = null;
            if (act.planRowId) {
              const row = planRowMap.get(act.planRowId);
              temaGenerador = row?.title || row?.actividadEval || null;
            }

            const tagClass = TAG_STYLES[act.tag || act.type] || 'bg-gray-100 text-gray-700 border-gray-200';

            // Fechas exactas: asignación vs entrega
            const createdRawDate = act.classSession?.date
              ? act.classSession.date.split('T')[0]
              : (act.createdDate ? act.createdDate.split('T')[0] : act.createdAt.split('T')[0]);

            const dueRawDate = act.dueDate ? act.dueDate.split('T')[0] : createdRawDate;

            const isSameDate = createdRawDate === dueRawDate;

            return (
              <div
                key={act.id}
                className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Header: Tag + Número de Actividad */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border shadow-2xs ${tagClass}`}>
                        {act.tag || act.type}
                      </span>
                      <span className="text-[11px] font-bold text-gray-400 font-mono">
                        Actividad #{idx + 1}
                      </span>
                    </div>

                    {/* Badge de Puntos / Ponderación */}
                    {act.maxScore && (
                      <span className="text-xs font-bold text-gray-600 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200/80">
                        {act.maxScore} pts
                      </span>
                    )}
                  </div>

                  {/* Bloque de Fechas: Creada vs Para el */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Asignada el:
                      </span>
                      <span className="font-semibold text-gray-700 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-500" />
                        {formatDayDate(createdRawDate)}
                      </span>
                    </div>
                    <div className="space-y-0.5 border-l border-slate-200/80 pl-2.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Para el (Entrega):
                      </span>
                      <span className="font-bold text-indigo-700 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-indigo-500" />
                        {formatDayDate(dueRawDate)}
                      </span>
                    </div>
                  </div>

                  {/* Título y Descripción */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 leading-snug">{act.title}</h4>
                    {act.description && (
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-2">
                        {act.description}
                      </p>
                    )}
                  </div>

                  {/* Tema Generador Vinculado */}
                  <div className="bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100/70">
                    <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Tema Generador:
                    </span>
                    <p className="text-xs font-semibold text-indigo-950 mt-0.5 line-clamp-1">
                      {temaGenerador || 'Vinculado a la planificación general'}
                    </p>
                  </div>
                </div>

                {/* Footer: Barra de progreso de entregas y botones de acción a clase en vivo */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  {/* Barra de progreso */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500 font-medium">Estudiantes Calificados:</span>
                      <span className="font-bold text-gray-900">
                        {gradedCount}/{targetStudents} ({progressPct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPct >= 100
                            ? 'bg-emerald-500'
                            : progressPct > 0
                            ? 'bg-indigo-600'
                            : 'bg-gray-300'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Botones de navegación a Clase en Vivo (Creación vs Entrega) */}
                  {isSameDate ? (
                    <Link
                      href={`/dashboard/clase-en-vivo/${classroomId}/${subjectId}?date=${dueRawDate}`}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-bold rounded-xl transition-all shadow-2xs border border-indigo-200/60"
                      title="Abrir clase de esta actividad"
                    >
                      <span>Abrir en Clase en Vivo ({formatDayDate(dueRawDate)})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/dashboard/clase-en-vivo/${classroomId}/${subjectId}?date=${createdRawDate}`}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded-xl border border-gray-200/80 transition-all shadow-2xs truncate"
                        title={`Ir al día en que se mandó la actividad (${formatDayDate(createdRawDate)})`}
                      >
                        <span className="truncate">Día asignado ({formatDayDate(createdRawDate)})</span>
                        <ExternalLink className="w-3 h-3 shrink-0 text-gray-400" />
                      </Link>

                      <Link
                        href={`/dashboard/clase-en-vivo/${classroomId}/${subjectId}?date=${dueRawDate}`}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-bold rounded-xl border border-indigo-200/70 transition-all shadow-2xs truncate"
                        title={`Ir al día en que se entrega/evalúa la actividad (${formatDayDate(dueRawDate)})`}
                      >
                        <span className="truncate">Día entrega ({formatDayDate(dueRawDate)})</span>
                        <ArrowRight className="w-3 h-3 shrink-0" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
