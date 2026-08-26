'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Clock, User, Users, FileText, Save, Loader2, Calendar, BookOpen, Plus, Trash2, CheckCircle2, ListTodo, Ban } from 'lucide-react';
import {
    useLiveClassDetail,
    useSaveLiveClass,
    useCreateClassActivity,
    useUpdateClassActivity,
    useDeleteClassActivity,
    useSuspendClass,
} from '@/hooks/useLiveClass';
import { toast } from 'sonner';

interface LiveClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    subjectId: string;
    subjectName: string;
    subjectColor?: string;
    date: string;
    startTime?: string;
    endTime?: string;
}

const STATUS_OPTIONS = [
    { value: 'PRESENT', label: 'Presente', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { value: 'ABSENT', label: 'Ausente', color: 'bg-red-100 text-red-700 border-red-300' },
    { value: 'LATE', label: 'Tardanza', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'EXCUSED', label: 'Justificado', color: 'bg-blue-100 text-blue-700 border-blue-300' },
];

export default function LiveClassModal({
    isOpen,
    onClose,
    classroomId,
    subjectId,
    subjectName,
    subjectColor,
    date,
    startTime,
    endTime,
}: LiveClassModalProps) {
    const { data, isLoading } = useLiveClassDetail(classroomId, subjectId, date);
    const saveMutation = useSaveLiveClass();
    const createActivity = useCreateClassActivity();
    const updateActivity = useUpdateClassActivity();
    const deleteActivity = useDeleteClassActivity();
    const suspendClass = useSuspendClass();

    const [topic, setTopic] = useState('');
    const [observations, setObservations] = useState('');
    const [attendance, setAttendance] = useState<Record<string, string>>({});

    // Actividades: formulario
    const [newActivityTitle, setNewActivityTitle] = useState('');
    const [newActivityDescription, setNewActivityDescription] = useState('');
    const [newActivityType, setNewActivityType] = useState('TAREA');
    const [newActivityTarget, setNewActivityTarget] = useState('NEXT');

    // Sync server data into local state when loaded
    useEffect(() => {
        if (data) {
            setTopic(data.session?.topic || '');
            setObservations(data.session?.observations || '');
            const map: Record<string, string> = {};
            data.students.forEach(s => {
                if (s.status) map[s.id] = s.status;
            });
            setAttendance(map);
        }
    }, [data]);

    const setStudentStatus = (studentId: string, status: string) => {
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    const presentCount = useMemo(() => {
        if (!data?.students?.length) return 0;
        return data.students.filter(s => (attendance[s.id] || s.status) === 'PRESENT').length;
    }, [data, attendance]);

    const handleSave = async () => {
        try {
            await saveMutation.mutateAsync({
                classroomId,
                subjectId,
                date,
                topic,
                observations,
                startTime,
                endTime,
                attendances: data?.students.map(s => ({
                    studentId: s.id,
                    status: attendance[s.id] || 'PRESENT',
                })) || [],
            });
            toast.success('Clase guardada correctamente');
            onClose();
        } catch {
            // error handled by mutation hook
        }
    };

    const handleAddActivity = async () => {
        if (!newActivityTitle.trim()) {
            toast.error('Escribe un título para la actividad');
            return;
        }
        try {
            await createActivity.mutateAsync({
                classroomId,
                subjectId,
                title: newActivityTitle.trim(),
                description: newActivityDescription.trim() || undefined,
                type: newActivityType,
                target: newActivityTarget,
            });
            setNewActivityTitle('');
            setNewActivityDescription('');
            toast.success('Actividad agregada');
        } catch {
            // handled by mutation
        }
    };

    const handleToggleActivity = async (id: string, isDone: boolean) => {
        try {
            await updateActivity.mutateAsync({ activityId: id, data: { isDone: !isDone } });
        } catch {
            // handled
        }
    };

    const handleDeleteActivity = async (id: string) => {
        try {
            await deleteActivity.mutateAsync(id);
            toast.success('Actividad eliminada');
        } catch {
            // handled
        }
    };

    const handleSuspend = async () => {
        try {
            const reason = window.prompt('Motivo de la suspensión (opcional):') || undefined;
            const res = await suspendClass.mutateAsync({ classroomId, subjectId, date, reason });
            if (res?.mergedTemaGenerador) {
                toast.success('Clase suspendida. Tema generador fusionado con la semana siguiente y actividades movidas.');
            } else {
                toast.success('Clase suspendida. Las actividades se movieron a la próxima clase.');
            }
            onClose();
        } catch {
            // handled
        }
    };

    if (!isOpen) return null;

    const teacherName = data?.teacher
        ? `${data.teacher.firstName} ${data.teacher.lastName}`
        : 'Sin profesor asignado';

    const isSuspended = data?.session?.status === 'SUSPENDED';
    const nextActivities = (data?.activities || []).filter(a => a.target === 'NEXT' && !a.isDone);
    const currentActivities = (data?.activities || []).filter(a => a.target === 'CURRENT');

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                <div
                    className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                    onClick={onClose}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
                />
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

                <div className="inline-block w-full max-w-3xl text-left align-middle transition-all transform bg-white rounded-2xl shadow-xl sm:my-8">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl" style={{ backgroundColor: subjectColor ? `${subjectColor}0d` : '#f9fafb' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: subjectColor ? `${subjectColor}20` : '#eef2ff' }}>
                                <BookOpen className="w-5 h-5" style={{ color: subjectColor || '#6366f1' }} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">{subjectName}</h3>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <User className="w-3.5 h-3.5" /> {teacherName}
                                    </span>
                                    {startTime && endTime && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" /> {startTime} - {endTime}
                                        </span>
                                    )}
                                    {data?.weekNumber && (
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" /> Semana {data.weekNumber}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                <p className="text-sm text-gray-500">Cargando detalles de la clase...</p>
                            </div>
                        ) : (
                            <>
                                {/* Plan de Evaluación de la Semana */}
                                <div>
                                    <h4 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                                        <FileText className="w-4 h-4 text-indigo-500" />
                                        Plan de Evaluación de la Semana
                                    </h4>

                                    {!data?.planContent ? (
                                        <div className="p-5 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                                            <FileText className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                                            <p className="text-xs text-gray-400">No hay plan cargado para esta semana.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {data.planContent.headers?.map(h => (
                                                <div key={h.id} className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl">
                                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-400">Tema Generador</span>
                                                    <h5 className="text-sm font-bold text-gray-800 mt-1">{h.title}</h5>
                                                </div>
                                            ))}
                                            {data.planContent.fields?.map(f => (
                                                <div key={f.id} className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-gray-400">{f.label}</span>
                                                    <p className="text-xs text-gray-700 mt-1 whitespace-pre-line">{f.content}</p>
                                                </div>
                                            ))}
                                            {data.planContent.evaluations?.map(e => (
                                                <div key={e.id} className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-600">Actividad Evaluativa</span>
                                                    <h5 className="text-sm font-bold text-gray-800 mt-1">{e.actividadEval}</h5>
                                                    {e.puntos !== undefined && (
                                                        <span className="text-xs text-amber-700 font-mono">{e.puntos} pts ({e.ponderacion}%)</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Tema y observaciones */}
                                <div className="grid gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                            Tema de la clase
                                        </label>
                                        <input
                                            type="text"
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            placeholder="Ej: Introducción a la suma"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                            Observaciones
                                        </label>
                                        <textarea
                                            value={observations}
                                            onChange={(e) => setObservations(e.target.value)}
                                            rows={3}
                                            placeholder="Notas, tareas, comportamiento..."
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Asistencia */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <Users className="w-4 h-4 text-indigo-500" />
                                            Asistencia de Estudiantes
                                        </h4>
                                        <span className="text-xs font-bold text-gray-500">
                                            {presentCount}/{data?.students?.length || 0} presentes
                                        </span>
                                    </div>

                                    {!data?.students?.length ? (
                                        <p className="text-sm text-gray-400 text-center py-6">No hay estudiantes en esta sección.</p>
                                    ) : (
                                        <div className="border border-gray-100 rounded-xl overflow-hidden">
                                            <table className="min-w-full divide-y divide-gray-100">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estudiante</th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-50">
                                                    {data.students.map(student => {
                                                        const current = attendance[student.id] || 'PRESENT';
                                                        return (
                                                            <tr key={student.id}>
                                                                <td className="px-4 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                                            {student.firstName?.[0]}{student.lastName?.[0]}
                                                                        </div>
                                                                        <span className="text-sm font-medium text-gray-800">
                                                                            {student.firstName} {student.lastName}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-right">
                                                                    <select
                                                                        value={current}
                                                                        onChange={(e) => setStudentStatus(student.id, e.target.value)}
                                                                        className={`text-xs font-semibold rounded-lg border px-2 py-1 outline-none ${STATUS_OPTIONS.find(o => o.value === current)?.color || 'bg-gray-50'}`}
                                                                    >
                                                                        {STATUS_OPTIONS.map(o => (
                                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Actividades / Tareas */}
                                <div>
                                    <h4 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                                        <ListTodo className="w-4 h-4 text-indigo-500" />
                                        Actividades
                                    </h4>

                                    {isSuspended && (
                                        <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg">
                                            <Ban className="w-4 h-4" />
                                            Clase suspendida{data.session?.suspendedReason ? `: ${data.session.suspendedReason}` : ''}
                                        </div>
                                    )}

                                    {/* Formulario nueva actividad */}
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 mb-3 space-y-2">
                                        <input
                                            type="text"
                                            value={newActivityTitle}
                                            onChange={(e) => setNewActivityTitle(e.target.value)}
                                            placeholder="Título de la actividad (ej: Leer libro de sumas)"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={newActivityDescription}
                                            onChange={(e) => setNewActivityDescription(e.target.value)}
                                            placeholder="Descripción (ej: tarea para el hogar sobre...)"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={newActivityType}
                                                onChange={(e) => setNewActivityType(e.target.value)}
                                                className="text-xs font-semibold rounded-lg border border-gray-200 px-2 py-1.5 outline-none"
                                            >
                                                <option value="TAREA">Tarea</option>
                                                <option value="EXAMEN">Examen</option>
                                                <option value="ACTIVIDAD">Actividad</option>
                                            </select>
                                            <select
                                                value={newActivityTarget}
                                                onChange={(e) => setNewActivityTarget(e.target.value)}
                                                className="text-xs font-semibold rounded-lg border border-gray-200 px-2 py-1.5 outline-none"
                                            >
                                                <option value="NEXT">Para la próxima clase</option>
                                                <option value="CURRENT">Para esta clase</option>
                                            </select>
                                            <button
                                                onClick={handleAddActivity}
                                                disabled={createActivity.isPending}
                                                className="ml-auto px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {createActivity.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                                Agregar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Lista de actividades pendientes (próxima clase) */}
                                    {nextActivities.length > 0 && (
                                        <div className="mb-2">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Próxima clase</p>
                                            <div className="space-y-2">
                                                {nextActivities.map(a => (
                                                    <div key={a.id} className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2">
                                                        <button
                                                            onClick={() => handleToggleActivity(a.id, a.isDone)}
                                                            className="text-gray-400 hover:text-emerald-600 transition-colors"
                                                            title="Marcar como hecha"
                                                        >
                                                            <CheckCircle2 size={16} className={a.isDone ? 'text-emerald-500' : ''} />
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-sm font-semibold text-gray-800 truncate ${a.carriedOver ? 'text-amber-700' : ''}`}>
                                                                {a.title}
                                                                {a.carriedOver && <span className="ml-1 text-[10px] text-amber-600 font-bold">(movida)</span>}
                                                            </p>
                                                            {a.description && <p className="text-xs text-gray-500 truncate">{a.description}</p>}
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase text-gray-400">{a.type}</span>
                                                        <button
                                                            onClick={() => handleDeleteActivity(a.id)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actividades de esta clase */}
                                    {currentActivities.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Esta clase</p>
                                            <div className="space-y-2">
                                                {currentActivities.map(a => (
                                                    <div key={a.id} className="flex items-center gap-2 bg-emerald-50/50 border border-emerald-100 rounded-lg px-3 py-2">
                                                        <button
                                                            onClick={() => handleToggleActivity(a.id, a.isDone)}
                                                            className="text-gray-400 hover:text-emerald-600 transition-colors"
                                                        >
                                                            <CheckCircle2 size={16} className={a.isDone ? 'text-emerald-500' : ''} />
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                                                            {a.description && <p className="text-xs text-gray-500 truncate">{a.description}</p>}
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase text-gray-400">{a.type}</span>
                                                        <button
                                                            onClick={() => handleDeleteActivity(a.id)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {nextActivities.length === 0 && currentActivities.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-3">Sin actividades registradas.</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    {!isLoading && (
                        <div className="px-6 py-4 border-t border-gray-100 flex justify-between gap-3">
                            <button
                                onClick={handleSuspend}
                                disabled={suspendClass.isPending}
                                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {suspendClass.isPending ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                Suspender Clase
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saveMutation.isPending}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Guardar Clase
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
