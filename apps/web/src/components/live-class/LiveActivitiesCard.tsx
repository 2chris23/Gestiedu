'use client';

import React, { useState } from 'react';
import {
    ListTodo, Plus, CheckCircle2, Circle, Trash2, Calendar,
    Tag, Award, Clock, Sparkles, X, Loader2, ArrowRight,
    Edit3, Check, CheckSquare
} from 'lucide-react';
import { ClassActivity, useCreateClassActivity, useUpdateClassActivity, useDeleteClassActivity } from '@/hooks/useLiveClass';
import { toast } from 'sonner';

const DEFAULT_TAG_PRESETS = [
    { name: 'Examen', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    { name: 'Tarea', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { name: 'Taller', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { name: 'Proyecto', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
    { name: 'Quiz', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    { name: 'Aviso', bg: 'bg-sky-50 text-sky-700 border-sky-200' },
];

/**
 * Formato de fecha SIN zona horaria: se extraen los componentes UTC del Date.
 * Los dueDate guardados con la serie vieja quedaron como medianoche UTC
 * (28/08/2026 → 27/08 a las 20:00 local en Caracas) y los nuevos se guardan a
 * mediodía local (16:00 UTC). Con getUTC* ambos representan el MISMO día que
 * eligió el docente, sin el desfase de -1 día que mostraba el frontend.
 */
function formatDayDate(value: string): string {
    const d = new Date(value);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

interface Props {
    classroomId: string;
    subjectId: string;
    activities: ClassActivity[];
    activeGradingActivityId: string | null;
    onSelectGradingActivity: (activity: ClassActivity | null) => void;
    canEdit: boolean;
    planRowId?: string | null;
    classSessionId?: string | null;
}

export default function LiveActivitiesCard({
    classroomId,
    subjectId,
    activities,
    activeGradingActivityId,
    onSelectGradingActivity,
    canEdit,
    planRowId,
    classSessionId,
}: Props) {
    const createActivity = useCreateClassActivity();
    const updateActivity = useUpdateClassActivity();
    const deleteActivity = useDeleteClassActivity();

    // Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState<'CURRENT' | 'NEXT'>('CURRENT');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedTag, setSelectedTag] = useState('Tarea');
    const [customTagInput, setCustomTagInput] = useState('');
    const [customTags, setCustomTags] = useState<string[]>([]);
    const [dueDate, setDueDate] = useState('');
    const [maxScore, setMaxScore] = useState('20');

    // ============================================================
    // CORRECCIÓN (reporte usuario): las actividades se clasifican
    // RELATIVAS A ESTA CLASE, no globalmente "hoy":
    //  - "Clase de Hoy": actividades ligadas a esta sesión (belongsToSession)
    //    o NEXT cuya fecha programada ES esta clase (dueToday).
    //    → Una actividad puesta el martes NO aparece en la clase del viernes.
    //  - "Próxima Clase": solo NEXT con fecha FUTURA a esta clase (isFuture);
    //    las con fecha pasada desaparecen de todas las vistas.
    // ============================================================
    const currentActivities = activities.filter((a) => a.belongsToSession || a.dueToday);
    const nextActivities = activities.filter((a) => a.target === 'NEXT' && a.isFuture);

    // Numbering
    // Current activities get: #1, #2, ...
    // Next activities continue: #(current.length + 1), #(current.length + 2), ...
    const getActivityNumber = (index: number, isNext: boolean) => {
        if (!isNext) {
            return index + 1;
        }
        return currentActivities.length + index + 1;
    };

    const handleOpenAdd = (target: 'CURRENT' | 'NEXT') => {
        setModalTarget(target);
        setTitle('');
        setDescription('');
        setSelectedTag(target === 'CURRENT' ? 'Tarea' : 'Examen');
        setCustomTagInput('');
        setDueDate('');
        setMaxScore('20');
        setIsAddModalOpen(true);
    };

    const handleAddCustomTag = () => {
        if (!customTagInput.trim()) return;
        const tag = customTagInput.trim();
        if (!customTags.includes(tag)) {
            setCustomTags((prev) => [...prev, tag]);
        }
        setSelectedTag(tag);
        setCustomTagInput('');
    };

    const handleCreate = async () => {
        if (!title.trim()) {
            toast.error('Escribe un título para la actividad');
            return;
        }
        try {
            await createActivity.mutateAsync({
                classroomId,
                subjectId,
                title: title.trim(),
                description: description.trim() || undefined,
                type: selectedTag.toUpperCase(),
                target: modalTarget,
                tag: selectedTag,
                dueDate: dueDate || undefined,
                maxScore: maxScore ? parseFloat(maxScore) : 20,
                planRowId: planRowId || undefined,
                classSessionId: modalTarget === 'CURRENT' ? (classSessionId || undefined) : undefined,
            });
            setIsAddModalOpen(false);
            toast.success(modalTarget === 'CURRENT' ? 'Actividad añadida a la clase de hoy' : 'Actividad programada para la próxima clase');
        } catch {
            // error handled
        }
    };

    const handleToggleDone = async (id: string, isDone: boolean) => {
        try {
            await updateActivity.mutateAsync({
                activityId: id,
                data: { isDone: !isDone },
            });
        } catch {
            // handled
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteActivity.mutateAsync(id);
            if (activeGradingActivityId === id) {
                onSelectGradingActivity(null);
            }
            toast.success('Actividad eliminada');
        } catch {
            // handled
        }
    };

    const getTagStyle = (tagText?: string) => {
        const found = DEFAULT_TAG_PRESETS.find((p) => p.name.toLowerCase() === (tagText || '').toLowerCase());
        if (found) return found.bg;
        return 'bg-blue-50 text-blue-700 border-blue-200';
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-transparent flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                        <ListTodo className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
                                Evaluación y Notas
                            </span>
                        </div>
                        <h2 className="text-base font-bold text-gray-900 mt-0.5">
                            Actividades de Clase
                        </h2>
                    </div>
                </div>

                {canEdit && (
                    <button
                        type="button"
                        onClick={() => handleOpenAdd('CURRENT')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nueva Actividad</span>
                    </button>
                )}
            </div>

            {/* Contenido dividido en 2 Sub-Tarjetas */}
            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                {/* 📌 TARJETA 1: CLASE DE HOY */}
                <div className="bg-blue-50/30 rounded-xl border border-blue-100 p-3.5 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-100/80">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                                    Clase de Hoy
                                </h3>
                                <span className="text-[11px] font-bold text-blue-600 bg-blue-100 px-2 py-0.2 rounded-full">
                                    {currentActivities.length}
                                </span>
                            </div>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenAdd('CURRENT')}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> Añadir
                                </button>
                            )}
                        </div>

                        {/* Lista de actividades de hoy */}
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {currentActivities.length === 0 ? (
                                <div className="text-center py-5">
                                    <p className="text-xs text-gray-400">No hay actividades para hoy.</p>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenAdd('CURRENT')}
                                            className="mt-1.5 text-xs font-semibold text-blue-600 hover:underline"
                                        >
                                            + Crear actividad de hoy
                                        </button>
                                    )}
                                </div>
                            ) : (
                                currentActivities.map((act, index) => {
                                    const actNum = getActivityNumber(index, false);
                                    const isGradingActive = activeGradingActivityId === act.id;
                                    return (
                                        <div
                                            key={act.id}
                                            className={`p-2.5 rounded-xl border transition-all duration-150 ${
                                                isGradingActive
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-300'
                                                    : 'bg-white border-blue-100/90 hover:border-blue-300 shadow-2xs'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleDone(act.id, act.isDone)}
                                                        className={`mt-0.5 transition-colors ${
                                                            isGradingActive ? 'text-blue-100 hover:text-white' : 'text-gray-400 hover:text-emerald-600'
                                                        }`}
                                                        title={act.isDone ? 'Marcar pendiente' : 'Marcar completada'}
                                                    >
                                                        {act.isDone ? (
                                                            <CheckCircle2 className={`w-4 h-4 ${isGradingActive ? 'text-emerald-300' : 'text-emerald-500'}`} />
                                                        ) : (
                                                            <Circle className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span
                                                                className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                                                                    isGradingActive
                                                                        ? 'bg-white/20 text-white'
                                                                        : 'bg-gray-100 text-gray-700'
                                                                }`}
                                                            >
                                                                Actividad #{actNum}
                                                            </span>
                                                            <span
                                                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                                                    isGradingActive ? 'bg-white/20 text-white border-white/30' : getTagStyle(act.tag || act.type)
                                                                }`}
                                                            >
                                                                {act.tag || act.type}
                                                            </span>
                                                        </div>
                                                        <h4
                                                            className={`text-xs font-bold mt-1 truncate ${
                                                                isGradingActive ? 'text-white' : act.isDone ? 'line-through text-gray-400' : 'text-gray-900'
                                                            }`}
                                                        >
                                                            {act.title}
                                                        </h4>
                                                        {act.description && (
                                                            <p className={`text-[11px] truncate mt-0.5 ${isGradingActive ? 'text-blue-100' : 'text-gray-500'}`}>
                                                                {act.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(act.id)}
                                                        className={`p-1 transition-colors ${
                                                            isGradingActive ? 'text-blue-200 hover:text-white' : 'text-gray-300 hover:text-rose-500'
                                                        }`}
                                                        title="Eliminar actividad"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Botón de DAR NOTA / CALIFICAR */}
                                            <div className="mt-2 pt-2 border-t border-current/10 flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectGradingActivity(isGradingActive ? null : act)}
                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                                        isGradingActive
                                                            ? 'bg-white text-blue-700 hover:bg-blue-50 shadow-xs'
                                                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                                    }`}
                                                >
                                                    <Award className="w-3.5 h-3.5" />
                                                    <span>{isGradingActive ? 'Calificando ahora ✓' : 'Dar Nota'}</span>
                                                </button>
                                                <span className={`text-[10px] font-semibold ${isGradingActive ? 'text-blue-100' : 'text-gray-400'}`}>
                                                    Max: {act.maxScore || 20} pts
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* 🚀 TARJETA 2: PRÓXIMA CLASE */}
                <div className="bg-indigo-50/30 rounded-xl border border-indigo-100 p-3.5 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-100/80">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                                    Próxima Clase
                                </h3>
                                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.2 rounded-full">
                                    {nextActivities.length}
                                </span>
                            </div>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenAdd('NEXT')}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" /> Añadir
                                </button>
                            )}
                        </div>

                        {/* Lista de actividades para la próxima clase */}
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {nextActivities.length === 0 ? (
                                <div className="text-center py-5">
                                    <p className="text-xs text-gray-400">Sin tareas ni avisos para la próxima clase.</p>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenAdd('NEXT')}
                                            className="mt-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                                        >
                                            + Programar para la próxima clase
                                        </button>
                                    )}
                                </div>
                            ) : (
                                nextActivities.map((act, index) => {
                                    const actNum = getActivityNumber(index, true);
                                    return (
                                        <div
                                            key={act.id}
                                            className="p-2.5 rounded-xl border bg-white border-indigo-100/90 hover:border-indigo-300 shadow-2xs transition-all duration-150"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700">
                                                            Actividad #{actNum}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${getTagStyle(act.tag || act.type)}`}>
                                                            {act.tag || act.type}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-xs font-bold text-gray-900 mt-1 truncate">
                                                        {act.title}
                                                    </h4>
                                                    {act.description && (
                                                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                                            {act.description}
                                                        </p>
                                                    )}
                                                    {act.dueDate && (
                                                        <p className="text-[10px] text-indigo-600 flex items-center gap-1 mt-1 font-medium">
                                                            <Calendar className="w-3 h-3" />
                                                            Para: {formatDayDate(act.dueDate)}
                                                        </p>
                                                    )}
                                                </div>

                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(act.id)}
                                                        className="p-1 text-gray-300 hover:text-rose-500 transition-colors"
                                                        title="Eliminar actividad"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== MODAL DE CREACIÓN DE ACTIVIDAD ===== */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-2">
                                <ListTodo className="w-5 h-5 text-blue-600" />
                                <h3 className="text-base font-bold text-gray-900">
                                    Nueva Actividad ({modalTarget === 'CURRENT' ? 'Clase de Hoy' : 'Próxima Clase'})
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Formulario */}
                        <div className="p-6 space-y-4">
                            {/* Selector de Destino */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                                    ¿Para cuándo es esta actividad?
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalTarget('CURRENT')}
                                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                                            modalTarget === 'CURRENT'
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        📌 Clase de Hoy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalTarget('NEXT')}
                                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                                            modalTarget === 'NEXT'
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        🚀 Próxima Clase
                                    </button>
                                </div>
                            </div>

                            {/* Título */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5">
                                    Título de la Actividad *
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Ej: Tarea 1: Ejercicios de álgebra / Examen Parcial"
                                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>

                            {/* Etiquetas (Tag) */}
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-600 mb-1.5 flex items-center justify-between">
                                    <span>Etiqueta (Tag)</span>
                                    <span className="text-[10px] text-gray-400 font-normal">Selecciona o escribe una nueva</span>
                                </label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {DEFAULT_TAG_PRESETS.concat(customTags.map((t) => ({ name: t, bg: 'bg-gray-100 text-gray-800 border-gray-300' }))).map((preset) => {
                                        const isSelected = selectedTag.toLowerCase() === preset.name.toLowerCase();
                                        return (
                                            <button
                                                key={preset.name}
                                                type="button"
                                                onClick={() => setSelectedTag(preset.name)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                                                    isSelected
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-200'
                                                        : `${preset.bg} hover:opacity-80`
                                                }`}
                                            >
                                                {preset.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={customTagInput}
                                        onChange={(e) => setCustomTagInput(e.target.value)}
                                        placeholder="Crear etiqueta personalizada..."
                                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddCustomTag}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-colors"
                                    >
                                        Guardar Tag
                                    </button>
                                </div>
                            </div>

                            {/* Descripción y Fecha (la fecha solo aplica a "Próxima Clase") */}
                            {modalTarget === 'NEXT' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                                            Fecha límite / programada
                                        </label>
                                        <input
                                            type="date"
                                            value={dueDate}
                                            onChange={(e) => setDueDate(e.target.value)}
                                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                                            Puntaje Máximo
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={maxScore}
                                            onChange={(e) => setMaxScore(e.target.value)}
                                            placeholder="20"
                                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                                        Puntaje Máximo
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={maxScore}
                                        onChange={(e) => setMaxScore(e.target.value)}
                                        placeholder="20"
                                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                    Descripción / Instrucciones (opcional)
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                    placeholder="Detalles sobre lo que se evaluará o entregará..."
                                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={createActivity.isPending}
                                className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                            >
                                {createActivity.isPending ? 'Guardando...' : 'Crear Actividad'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
