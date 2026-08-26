
'use client';

import React, { useState } from 'react';
import { Calendar, ChevronRight, FilePlus, Edit3, CheckCircle2, CircleDashed } from 'lucide-react';
import EvaluationPlanBuilder from './EvaluationPlanBuilder';

// Mock data for term status. In a real app, this comes from the backend.
type TermStatus = 'empty' | 'draft' | 'published';

interface TermData {
    id: number;
    label: string;
    dates: string;
    status: TermStatus;
    progress?: number; // 0-20 points
}

export default function EvaluationPlanDashboard() {
    const [activeTerm, setActiveTerm] = useState<number | null>(null);

    // Mock State for the dashboard demo
    const [terms, setTerms] = useState<TermData[]>([
        { id: 1, label: '1er Lapso', dates: 'Ene - Mar', status: 'empty' },
        { id: 2, label: '2do Lapso', dates: 'Abr - Jul', status: 'empty' },
        { id: 3, label: '3er Lapso', dates: 'Sep - Dic', status: 'empty' },
    ]);

    const handleSelectTerm = (id: number) => {
        // Here we would ideally load the plan for this term
        setActiveTerm(id);
    };

    const handleBack = () => {
        setActiveTerm(null);
    };

    if (activeTerm !== null) {
        return <EvaluationPlanBuilder termId={activeTerm} onBack={handleBack} />;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Planes de Evaluación</h1>
                <p className="text-gray-500">Administra la planificación académica de cada lapso del año escolar.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {terms.map((term) => (
                    <div
                        key={term.id}
                        className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden relative cursor-pointer"
                        onClick={() => handleSelectTerm(term.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectTerm(term.id); } }}
                    >
                        {/* Header Banner */}
                        <div className={`h-2 w-full ${term.status === 'published' ? 'bg-emerald-500' :
                                term.status === 'draft' ? 'bg-amber-500' : 'bg-gray-200'
                            }`} />

                        <div className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                    <Calendar size={24} />
                                </div>
                                <StatusBadge status={term.status} />
                            </div>

                            <h3 className="text-xl font-bold text-gray-800 mb-1">{term.label}</h3>
                            <p className="text-sm text-gray-400 font-medium mb-6 uppercase tracking-wide">{term.dates}</p>

                            {term.status !== 'empty' && (
                                <div className="mb-6">
                                    <div className="flex justify-between text-xs font-semibold mb-2">
                                        <span className="text-gray-500">Progreso</span>
                                        <span className="text-indigo-600">0/20 pts</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="w-0 h-full bg-indigo-500"></div>
                                    </div>
                                </div>
                            )}

                            <button className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${term.status === 'empty'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 group-hover:bg-indigo-700'
                                    : 'bg-white border-2 border-indigo-100 text-indigo-600 group-hover:border-indigo-200'
                                }`}>
                                {term.status === 'empty' ? (
                                    <> <FilePlus size={18} /> Crear Plan </>
                                ) : (
                                    <> <Edit3 size={18} /> Editar Plan </>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State / Info Helper */}
            <div className="mt-12 p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-center">
                <div className="max-w-md">
                    <h4 className="font-semibold text-gray-600 mb-2">¿Cómo funciona?</h4>
                    <p className="text-sm text-gray-500">
                        Cada lapso es independiente. Debes configurar las fechas y distribuir los 20 puntos reglamentarios en cada uno. Una vez publicado, el plan será visible para los estudiantes.
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: TermStatus }) {
    switch (status) {
        case 'published':
            return (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                    <CheckCircle2 size={12} /> Publicado
                </span>
            );
        case 'draft':
            return (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                    <CircleDashed size={12} /> Borrador
                </span>
            );
        default:
            return (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-bold border border-gray-200">
                    Sin Iniciar
                </span>
            );
    }
}
