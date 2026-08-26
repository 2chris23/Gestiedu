'use client';

import React from 'react';

interface Props {
    studentId: string;
    studentName: string;
    score: number | null | undefined;
    maxScore?: number;
    onChange: (studentId: string, newScore: number | null) => void;
    disabled?: boolean;
}

export default function LiveGradesSliderInput({
    studentId,
    studentName,
    score,
    maxScore = 20,
    onChange,
    disabled = false,
}: Props) {
    const currentScore = score !== null && score !== undefined ? score : 0;
    const isUnset = score === null || score === undefined;

    // Color gradient / badge based on 0-20 standard scale
    const getScoreColor = (val: number, isNone: boolean) => {
        if (isNone) return { text: 'text-gray-400', bg: 'bg-gray-100', border: 'border-gray-200', track: 'bg-gray-200' };
        const ratio = val / maxScore;
        if (ratio >= 0.75) return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300', track: 'bg-emerald-500' };
        if (ratio >= 0.5) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300', track: 'bg-amber-500' };
        return { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-300', track: 'bg-rose-500' };
    };

    const colors = getScoreColor(currentScore, isUnset);
    const progressPercent = Math.min(100, Math.max(0, (currentScore / maxScore) * 100));

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        onChange(studentId, isNaN(val) ? 0 : val);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valStr = e.target.value;
        if (valStr === '') {
            onChange(studentId, null);
            return;
        }
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
            const clamped = Math.max(0, Math.min(maxScore, val));
            onChange(studentId, clamped);
        }
    };

    return (
        <div className="flex items-center gap-3 py-1">
            {/* Slider de puntuación interactivo */}
            <div className="relative flex-1 flex items-center min-w-[130px] max-w-[200px]">
                <input
                    type="range"
                    min="0"
                    max={maxScore}
                    step="0.5"
                    value={isUnset ? 0 : currentScore}
                    disabled={disabled}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    title={`Puntaje para ${studentName}: ${isUnset ? 'Sin calificar' : `${currentScore} pts`}`}
                />
            </div>

            {/* Input numérico directo */}
            <div className="flex items-center gap-1.5">
                <input
                    type="number"
                    min="0"
                    max={maxScore}
                    step="0.5"
                    value={isUnset ? '' : currentScore}
                    placeholder="—"
                    disabled={disabled}
                    onChange={handleNumberChange}
                    className={`w-14 px-2 py-1 text-center text-xs font-bold rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors ${
                        isUnset
                            ? 'border-gray-200 bg-gray-50 text-gray-400 placeholder:text-gray-300'
                            : `${colors.bg} ${colors.text} ${colors.border}`
                    }`}
                />
                <span className="text-[11px] font-semibold text-gray-400">/{maxScore}</span>
            </div>

            {/* Atajos rápidos de puntaje */}
            <div className="hidden sm:flex items-center gap-1">
                {[10, 15, 20].map((quick) => (
                    <button
                        key={quick}
                        type="button"
                        onClick={() => onChange(studentId, quick)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                            currentScore === quick && !isUnset
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                        }`}
                        title={`Asignar ${quick} pts`}
                    >
                        {quick}
                    </button>
                ))}
                {!isUnset && (
                    <button
                        type="button"
                        onClick={() => onChange(studentId, null)}
                        className="px-1 py-0.5 text-[10px] text-gray-400 hover:text-red-500 rounded transition-colors"
                        title="Borrar nota"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}
