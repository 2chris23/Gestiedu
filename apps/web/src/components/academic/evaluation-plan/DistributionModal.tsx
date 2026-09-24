
import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (subtopics: string[], mode: 'sequential' | 'parallel' | 'manual') => void;
    parentDuration: number;
}

export default function DistributionModal({ isOpen, onClose, onConfirm, parentDuration }: Props) {
    const [subtopics, setSubtopics] = useState<string[]>(['']);
    const [mode, setMode] = useState<'sequential' | 'parallel' | 'manual'>('sequential');

    if (!isOpen) return null;

    const addSubtopicField = () => setSubtopics([...subtopics, '']);
    const removeSubtopicField = (index: number) => {
        const newSubtopics = subtopics.filter((_, i) => i !== index);
        setSubtopics(newSubtopics.length ? newSubtopics : ['']);
    };

    const updateSubtopic = (index: number, value: string) => {
        const newSubtopics = [...subtopics];
        newSubtopics[index] = value;
        setSubtopics(newSubtopics);
    };

    const handleConfirm = () => {
        const validSubtopics = subtopics.filter(s => s.trim() !== '');
        if (validSubtopics.length === 0) return;
        onConfirm(validSubtopics, mode);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Agregar Tejidos Temáticos">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Agregar Tejidos Temáticos</h3>
                    <button aria-label="Cerrar" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4 mb-6">
                    <label htmlFor="subtopic-0" className="block text-sm font-medium text-gray-700">Nombres de los Subtemas</label>
                    {subtopics.map((topic, index) => (
                        <div key={index} className="flex gap-2">
                            <input
                                id={`subtopic-${index}`}
                                type="text"
                                value={topic}
                                onChange={(e) => updateSubtopic(index, e.target.value)}
                                placeholder={`Subtema ${index + 1}`}
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <button
                                onClick={() => removeSubtopicField(index)}
                                className="text-red-400 hover:text-red-600 p-2"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={addSubtopicField}
                        className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-800"
                    >
                        <Plus size={16} /> Agregar otro subtema
                    </button>
                </div>

                <div className="space-y-3 mb-8">
                    <div className="block text-sm font-medium text-gray-700">Modo de Distribución</div>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setMode('sequential')}
                            className={`p-3 border rounded-lg text-left transition-all ${mode === 'sequential'
                                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <div className="font-semibold text-sm text-gray-900">Secuencial</div>
                            <div className="text-xs text-gray-500 mt-1">
                                Dividir las {parentDuration} semanas equitativamente entre los temas.
                            </div>
                        </button>

                        <button
                            onClick={() => setMode('parallel')}
                            className={`p-3 border rounded-lg text-left transition-all ${mode === 'parallel'
                                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <div className="font-semibold text-sm text-gray-900">Simultáneo</div>
                            <div className="text-xs text-gray-500 mt-1">
                                Todos los temas se ven en paralelo durante las {parentDuration} semanas.
                            </div>
                        </button>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm shadow-indigo-200"
                    >
                        Confirmar Distribución
                    </button>
                </div>
            </div>
        </div>
    );
}
