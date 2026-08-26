
import React from 'react';
import { MessageSquare, ThumbsUp, ThumbsDown, AlertCircle } from 'lucide-react';

export interface Observation {
    id: string;
    type: 'positive' | 'negative' | 'neutral';
    title: string;
    description: string;
    date: string;
    teacher: string;
}

export interface ObservationsTrayProps {
    observations?: {
        id: string;
        title: string;
        description?: string;
        type: string;
        date: string;
    }[];
}

export default function ObservationsTray({ observations }: ObservationsTrayProps) {
    // Usar solo datos reales del API, sin fallback a datos simulados
    const displayObservations: Observation[] = observations?.map(obs => ({
        id: obs.id,
        type: obs.type.toLowerCase() === 'positive' ? 'positive' :
            obs.type.toLowerCase() === 'negative' ? 'negative' : 'neutral',
        title: obs.title,
        description: obs.description || obs.title,
        date: new Date(obs.date).toLocaleDateString(),
        teacher: 'Sistema' // Or add teacher to API
    })) || [];

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <MessageSquare size={18} className="text-amber-500" />
                    Observaciones
                </h3>
                <span className="text-xs font-medium text-gray-400">Últimas {displayObservations.length}</span>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                {displayObservations.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <MessageSquare size={40} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-sm font-medium">Sin observaciones</p>
                        <p className="text-xs">No hay observaciones registradas</p>
                    </div>
                ) : (
                    displayObservations.map(obs => (
                        <div key={obs.id} className="group relative pl-4 pb-4 border-l-2 border-gray-100 last:pb-0 last:border-0">
                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center
                                ${obs.type === 'positive' ? 'bg-green-100 text-green-600' :
                                    obs.type === 'negative' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}
                            >
                                {obs.type === 'positive' ? <ThumbsUp size={8} /> :
                                    obs.type === 'negative' ? <ThumbsDown size={8} /> : <AlertCircle size={8} />}
                            </div>

                            <div className="bg-gray-50/50 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-sm font-bold text-gray-700">{obs.title}</span>
                                    <span className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">{obs.date}</span>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed mb-2">{obs.description}</p>
                                <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                    {obs.teacher}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
