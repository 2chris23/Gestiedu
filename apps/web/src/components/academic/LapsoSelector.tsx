'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
const TODO = '__todo';

/**
 * Una lista de la app, no la del sistema: en Android el `<select>` nativo abre
 * una ventana negra a pantalla con letra enorme, que no se parece a nada del
 * resto (lo pidió cambiar el dueño). Esta se abre pegada al botón, con los
 * colores de la app y cada opción de un dedo de alto.
 */
export default function LapsoSelector({ periods, value, onChange, compact = false }: Props) {
    const options = periods || [];
    return (
        <Select value={value || TODO} onValueChange={(v) => onChange(v === TODO ? undefined : v)}>
            <SelectTrigger
                aria-label="Selector de lapso / momento"
                className={`h-auto min-h-11 w-auto gap-2 rounded-xl border-gray-200 bg-white px-3.5 text-xs font-bold text-gray-700 shadow-2xs focus:ring-2 focus:ring-indigo-500`}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="min-w-[11rem] rounded-xl border-gray-200 bg-white p-1 shadow-lg">
                <SelectItem value={TODO} className="min-h-[44px] rounded-lg text-sm font-semibold text-gray-800 focus:bg-indigo-50 focus:text-indigo-800">
                    Todo el ciclo
                </SelectItem>
                {options.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="min-h-[44px] rounded-lg text-sm font-semibold text-gray-800 focus:bg-indigo-50 focus:text-indigo-800">
                        {p.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
