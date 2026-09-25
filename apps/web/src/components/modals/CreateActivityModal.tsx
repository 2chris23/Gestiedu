'use client';

import React, { useState } from 'react';
import { X, BookOpen, Calendar, Scale, Hash, FileText } from 'lucide-react';
import { useCreateActivity } from '@/hooks/useActivities';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';

interface CreateActivityModalProps {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    subjectId: string;
    periodId?: string;
    lapso?: string;
    onSuccess?: () => void;
}

const ACTIVITY_TYPES = [
    { value: 'EXAM', label: 'Examen', icon: '📝', color: 'bg-red-50 text-red-700 border-red-200' },
    { value: 'QUIZ', label: 'Quiz / Prueba Corta', icon: '📋', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { value: 'HOMEWORK', label: 'Tarea', icon: '📚', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'PROJECT', label: 'Proyecto', icon: '🔬', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { value: 'PRESENTATION', label: 'Exposición', icon: '🎤', color: 'bg-green-50 text-green-700 border-green-200' },
    { value: 'PARTICIPATION', label: 'Participación', icon: '🙋', color: 'bg-teal-50 text-teal-700 border-teal-200' },
    { value: 'LAB', label: 'Laboratorio', icon: '🧪', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { value: 'OTHER', label: 'Otro', icon: '📌', color: 'bg-gray-50 text-gray-700 border-gray-200' },
];

export default function CreateActivityModal({
    isOpen,
    onClose,
    classroomId,
    subjectId,
    periodId,
    lapso = '1',
    onSuccess,
}: CreateActivityModalProps) {
    const createActivity = useCreateActivity();
    const { data: config } = useAcademicConfig();

    const maxScale = config?.gradeScale?.max || 20;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('EXAM');
    const [maxGrade, setMaxGrade] = useState(maxScale);
    const [weight, setWeight] = useState(1);
    const [dueDate, setDueDate] = useState('');
    
    // Nuevos campos del Plan de Evaluación Venezolano
    const [temaGenerador, setTemaGenerador] = useState('');
    const [tejidoTematico, setTejidoTematico] = useState('');
    const [referentes, setReferentes] = useState('');
    const [tecnicas, setTecnicas] = useState('');
    const [instrumentos, setInstrumentos] = useState('');
    const [criterios, setCriterios] = useState('');

    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!title.trim()) {
            setError('El título de la actividad es obligatorio');
            return;
        }

        try {
            await createActivity.mutateAsync({
                title: title.trim(),
                description: description.trim() || undefined,
                type,
                scope: 'CLASSROOM',
                startDate: new Date().toISOString(),
                dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
                maxGrade,
                weight,
                classroomId,
                subjectId,
                periodId,
                lapso,
                temaGenerador: temaGenerador.trim() || undefined,
                tejidoTematico: tejidoTematico.trim() || undefined,
                referentes: referentes.trim() || undefined,
                tecnicas: tecnicas.trim() || undefined,
                instrumentos: instrumentos.trim() || undefined,
                criterios: criterios.trim() || undefined,
            });

            // Reset form
            setTitle('');
            setDescription('');
            setType('EXAM');
            setMaxGrade(maxScale);
            setWeight(1);
            setDueDate('');
            setTemaGenerador('');
            setTejidoTematico('');
            setReferentes('');
            setTecnicas('');
            setInstrumentos('');
            setCriterios('');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Error al crear la evaluación');
        }
    };

    const selectedType = ACTIVITY_TYPES.find(t => t.value === type);

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Nueva Evaluación al Plan">
            <div className="flex items-center justify-center min-h-screen px-4 py-8">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }} />

                <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-auto z-10">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-2xl">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-xl">
                                <BookOpen className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Nueva Evaluación al Plan</h3>
                                <p className="text-xs text-gray-500">Escala: 0 - {maxScale} pts</p>
                            </div>
                        </div>
                        <button aria-label="Cerrar"
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Columna Izquierda: Información Académica (Plan de Evaluación) */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-900 border-b pb-2">Contenido Académico</h4>
                                
                                <div>
                                    <label htmlFor="temaGenerador" className="block text-xs font-bold text-gray-700 mb-1">Tema Generador</label>
                                    <input
                                        id="temaGenerador"
                                        type="text"
                                        value={temaGenerador}
                                        onChange={e => setTemaGenerador(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    />
                                </div>
                                
                                <div>
                                    <label htmlFor="tejidoTematico" className="block text-xs font-bold text-gray-700 mb-1">Tejido Temático</label>
                                    <input
                                        id="tejidoTematico"
                                        type="text"
                                        value={tejidoTematico}
                                        onChange={e => setTejidoTematico(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="referentes" className="block text-xs font-bold text-gray-700 mb-1">Referentes Teóricos Prácticos</label>
                                    <textarea
                                        id="referentes"
                                        value={referentes}
                                        onChange={e => setReferentes(e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="tecnicas" className="block text-xs font-bold text-gray-700 mb-1">Técnicas</label>
                                        <input
                                            id="tecnicas"
                                            type="text"
                                            value={tecnicas}
                                            onChange={e => setTecnicas(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="instrumentos" className="block text-xs font-bold text-gray-700 mb-1">Instrumentos</label>
                                        <input
                                            id="instrumentos"
                                            type="text"
                                            value={instrumentos}
                                            onChange={e => setInstrumentos(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="criterios" className="block text-xs font-bold text-gray-700 mb-1">Criterios de Evaluación</label>
                                    <input
                                        id="criterios"
                                        type="text"
                                        value={criterios}
                                        onChange={e => setCriterios(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Columna Derecha: Detalles de la Actividad */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-900 border-b pb-2">Detalles de la Actividad</h4>

                                {/* Type Selector */}
                                <div>
                                    <span className="block text-xs font-bold text-gray-700 mb-2">Tipo de Evaluación</span>
                                    <div className="grid grid-cols-4 gap-2">
                                        {ACTIVITY_TYPES.map(actType => (
                                            <button
                                                key={actType.value}
                                                type="button"
                                                onClick={() => setType(actType.value)}
                                                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                                                    type === actType.value
                                                        ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-200'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                }`}
                                            >
                                                <span className="text-lg">{actType.icon}</span>
                                                <span className="text-[9px] font-bold text-gray-700 leading-tight">{actType.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="title" className="block text-xs font-bold text-gray-700 mb-1">
                                        Actividad / Título <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="title"
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder={`Ej: ${selectedType?.label || 'Evaluación'}`}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="description" className="block text-xs font-bold text-gray-700 mb-1">Descripción de la actividad (opcional)</label>
                                    <textarea
                                        id="description"
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={2}
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm resize-none"
                                    />
                                </div>

                                {/* Row: Max Grade + Weight + Due Date */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label htmlFor="maxGrade" className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                                            <Scale className="w-3.5 h-3.5" /> Puntaje Máx.
                                        </label>
                                        <input
                                            id="maxGrade"
                                            type="number"
                                            value={maxGrade}
                                            onChange={e => setMaxGrade(Number(e.target.value))}
                                            min={1} max={100} step={1}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-center"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="weight" className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                                            <Hash className="w-3.5 h-3.5" /> Ponderación (%)
                                        </label>
                                        <input
                                            id="weight"
                                            type="number"
                                            value={weight}
                                            onChange={e => setWeight(Number(e.target.value))}
                                            min={0.1} max={100} step={0.1}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-center"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="dueDate" className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" /> Fecha
                                        </label>
                                        <input
                                            id="dueDate"
                                            type="date"
                                            value={dueDate}
                                            onChange={e => setDueDate(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={createActivity.isPending}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {createActivity.isPending ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar en Plan'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
