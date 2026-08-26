'use client';

import React from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';

export interface PeriodOption {
    id: string;
    name: string;
}

interface Props {
    periods: PeriodOption[];
    value?: string;
    onChange: (periodId: string | undefined) => void;
    compact?: boolean;
}

/**
 * Fase 3.5 — Selector de lapso/momento ("Todo el ciclo" / 1er / 2do / 3er Momento).
 * Se usa en: dashboard del Ciclo Escolar, dashboard de un Año, pestaña Materias
 * y Estudiantes de una Sección, y el dashboard del estudiante.
 */
export default function LapsoSelector({ periods, value, onChange, compact = false }: Props) {
    const options = periods || [];
    return (
        <div className={compact ? 'inline-flex items-center gap-1.5' : 'relative'}>
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-2xs">
                <CalendarRange className="w-4 h-4 text-indigo-600" />
                <select
                    aria-label="Selector de lapso / momento"
                    className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer appearance-none pr-5"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value || undefined)}
                >
                    <option value="">Todo el ciclo</option>
                    {options.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none -ml-4" />
            </div>
        </div>
    );
}
