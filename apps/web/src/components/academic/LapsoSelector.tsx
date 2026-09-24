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
            {/* En el teléfono el `select` ya mide 44 px de alto (globals.css):
                con el relleno de arriba y abajo, el recuadro llegaba a 56. */}
            <div
                className={`flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl shadow-2xs ${
                    compact ? 'px-2.5 py-0 sm:px-3 sm:py-1.5' : 'px-3 py-1.5'
                }`}
            >
                {/* Compacto, en el teléfono el icono sobra: le quitaba al nombre del
                    ciclo los 20 px que le faltaban para leerse entero. */}
                <CalendarRange className={`w-4 h-4 shrink-0 text-indigo-600 ${compact ? 'hidden sm:block' : ''}`} aria-hidden />
                {/* Sin borde ni relleno propios: el recuadro es el de fuera. Con
                    los de `globals.css` salía un recuadro dentro de otro. */}
                <select
                    aria-label="Selector de lapso / momento"
                    className="min-w-0 rounded-none border-0 bg-transparent py-0 pl-0 pr-5 text-xs font-bold text-gray-700 outline-none cursor-pointer appearance-none"
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
