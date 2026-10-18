'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface CicloParaElegir {
    id: string;
    name: string;
    status?: string;
}

/**
 * EL AÑO ESCOLAR, EN UNA PASTILLA
 *
 * La misma forma que el selector de lapso de la sección: una pastilla a la
 * derecha de la cabecera. Antes era una caja de 260 px con «CICLO ESCOLAR
 * VISUALIZADO» encima (Materias, 18-oct-2026).
 */
export function ElegirCiclo({ ciclos, valor, alCambiar }: { ciclos: CicloParaElegir[]; valor: string; alCambiar: (id: string) => void }) {
    if (ciclos.length === 0) return null;
    return (
        <Select value={valor || undefined} onValueChange={alCambiar}>
            <SelectTrigger
                aria-label="Año escolar"
                className="h-auto min-h-11 w-auto gap-2 rounded-xl border-gray-200 bg-white px-3.5 text-xs font-bold text-gray-700 shadow-2xs focus:ring-2 focus:ring-indigo-500"
            >
                <SelectValue placeholder="Año escolar" />
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="min-w-[11rem] rounded-xl border-gray-200 bg-white p-1 shadow-lg">
                {ciclos.map((c) => (
                    <SelectItem
                        key={c.id}
                        value={c.id}
                        className="min-h-[44px] rounded-lg text-sm font-semibold text-gray-800 focus:bg-indigo-50 focus:text-indigo-800"
                    >
                        {c.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
