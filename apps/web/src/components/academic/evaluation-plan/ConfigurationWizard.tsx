
'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, ChevronRight, Check, X } from 'lucide-react';
import { useEvaluationPlanStore } from './store/evaluation-store';

interface Props {
    onCancel?: () => void;
}

export default function ConfigurationWizard({ onCancel }: Props) {
    const { configurePlan } = useEvaluationPlanStore();

    // Default to a typical semester start/end for demo
    const [startDate, setStartDate] = useState<string>('2026-01-12');
    const [endDate, setEndDate] = useState<string>('2026-06-16');
    const [selectedDays, setSelectedDays] = useState<string[]>(['Lun', 'Jue']);

    const handleStart = () => {
        if (!startDate || !endDate) return;
        const start = new Date(startDate);
        const end = new Date(endDate);
        configurePlan(start, end, selectedDays);
    };

    // ESC Key Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && onCancel) {
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

    const toggleDay = (day: string) => {
        if (selectedDays.includes(day)) {
            setSelectedDays(selectedDays.filter(d => d !== day));
        } else {
            setSelectedDays([...selectedDays, day]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Configurar Nuevo Plan">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 relative">

                {/* Close Button Trigger */}
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
                        title="Cancelar (Esc)"
                    >
                        <X size={20} />
                    </button>
                )}

                {/* Header */}
                <div className="bg-indigo-600 p-6 text-white text-center">
                    <div className="mx-auto w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
                        <Calendar size={24} className="text-white" />
                    </div>
                    <h2 className="text-xl font-bold">Configurar Nuevo Plan</h2>
                    <p className="text-white/80 text-sm mt-1">Define el lapso académico para generar tu cronograma.</p>
                </div>

                {/* Body */}
                <div className="p-8 space-y-6">

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label htmlFor="start-date" className="text-xs font-bold text-gray-500 uppercase tracking-wide">Inicio</label>
                            <input
                                id="start-date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 font-medium"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="end-date" className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fin</label>
                            <input
                                id="end-date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 font-medium"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Días de Clase</div>
                        <div className="flex gap-2">
                            {days.map(day => (
                                <button
                                    key={day}
                                    onClick={() => toggleDay(day)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${selectedDays.includes(day)
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                        }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 text-center">Calcularemos las semanas hábiles automáticamente.</p>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t flex justify-between items-center">
                    {onCancel ? (
                        <button
                            onClick={onCancel}
                            className="text-gray-500 font-medium hover:text-gray-700 text-sm px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                    ) : <div></div>}

                    <button
                        onClick={handleStart}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95"
                    >
                        Comenzar Planificación <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
