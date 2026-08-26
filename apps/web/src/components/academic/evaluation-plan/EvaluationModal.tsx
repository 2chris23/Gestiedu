
import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { EvaluationType, InstrumentType } from './store/evaluation-store';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (evaluation: { type: EvaluationType; instrument: InstrumentType; points: number; description: string }) => void;
    maxPoints: number; // Puntos restantes disponibles en el lapso (idealmente)
}

export default function EvaluationModal({ isOpen, onClose, onConfirm, maxPoints = 20 }: Props) {
    const [type, setType] = useState<EvaluationType>('prueba');
    const [instrument, setInstrument] = useState<InstrumentType>('examen');
    const [points, setPoints] = useState<number>(1);
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (points <= 0) return; // O mostrar error
        onConfirm({ type, instrument, points, description });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Asignar Evaluación</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4 mb-6">
                    {/* Technique */}
                    <div>
                        <label htmlFor="evalType" className="block text-sm font-medium text-gray-700 mb-1">Técnica</label>
                        <Select value={type} onValueChange={(v) => setType(v as EvaluationType)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="prueba">Prueba</SelectItem>
                                <SelectItem value="observacion">Observación</SelectItem>
                                <SelectItem value="analisis">Análisis de Producción</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Instrument */}
                    <div>
                        <label htmlFor="evalInstrument" className="block text-sm font-medium text-gray-700 mb-1">Instrumento</label>
                        <Select value={instrument} onValueChange={(v) => setInstrument(v as InstrumentType)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="examen">Examen Escrito</SelectItem>
                                <SelectItem value="escala">Escala de Estimación</SelectItem>
                                <SelectItem value="lista">Lista de Cotejo</SelectItem>
                                <SelectItem value="portafolio">Portafolio</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Points */}
                    <div>
                        <label htmlFor="evalPoints" className="block text-sm font-medium text-gray-700 mb-1">Ponderación (Pts)</label>
                        <div className="flex items-center gap-2">
                            <input
                                id="evalPoints"
                                type="number"
                                min="1"
                                max={maxPoints}
                                value={points}
                                onChange={(e) => setPoints(parseFloat(e.target.value))}
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold"
                            />
                            <span className="text-xs text-gray-500">Máx: {maxPoints}</span>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="evalDescription" className="block text-sm font-medium text-gray-700 mb-1">Descripción (Opcional)</label>
                        <input
                            id="evalDescription"
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ej: Prueba sobre vectores..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
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
                        Guardar Nota
                    </button>
                </div>
            </div>
        </div>
    );
}
