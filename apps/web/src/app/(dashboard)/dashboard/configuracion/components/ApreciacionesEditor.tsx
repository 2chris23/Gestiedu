'use client';

import { Plus, X } from 'lucide-react';
import { Grupo } from '@/components/configuracion/ajustes';

export const APRECIACIONES_POR_DEFECTO = ['Consolidado', 'En proceso', 'Iniciado'];

/**
 * LAS PALABRAS DE LAS MATERIAS CON APRECIACIÓN
 *
 * Orientación, Grupos de Creación… no llevan nota: el profesor elige una de
 * estas palabras, de la mejor a la peor. Cada liceo pone las suyas (de 2 a
 * 10); el servidor revisa lo mismo (`apreciaciones.service`).
 */
export function erroresDeApreciaciones(lista: string[]): string | null {
    const limpias = lista.map((v) => v.trim());
    if (limpias.length < 2 || limpias.length > 10) return 'Las apreciaciones son de 2 a 10 palabras.';
    if (limpias.some((v) => !v)) return 'Hay una apreciación vacía.';
    if (limpias.some((v) => v.length > 40)) return 'Cada apreciación tiene hasta 40 letras.';
    if (new Set(limpias.map((v) => v.toLowerCase())).size !== limpias.length) return 'Hay apreciaciones repetidas.';
    return null;
}

export function ApreciacionesEditor({ valor, alCambiar }: { valor: string[]; alCambiar: (v: string[]) => void }) {
    const cambiar = (i: number, texto: string) => alCambiar(valor.map((v, k) => (k === i ? texto : v)));
    const quitar = (i: number) => alCambiar(valor.filter((_, k) => k !== i));
    const error = erroresDeApreciaciones(valor);

    return (
        <Grupo
            id="apreciaciones"
            titulo="Apreciaciones (materias sin nota)"
            descripcion="Para las materias que se evalúan con apreciación, como Orientación o Grupos de Creación. De la mejor a la peor. No entran en ningún promedio ni en la promoción."
            pie={error ? <span className="text-rose-700">{error}</span> : undefined}
        >
            {valor.map((v, i) => (
                <div key={i} className="flex min-h-[56px] items-center gap-3 px-4 py-1">
                    <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-500">{i + 1}</span>
                    <input
                        aria-label={`Apreciación ${i + 1}`}
                        value={v}
                        maxLength={40}
                        onChange={(e) => cambiar(i, e.target.value)}
                        className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => quitar(i)}
                        disabled={valor.length <= 2}
                        aria-label={`Quitar ${v || 'esta apreciación'}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-700 disabled:opacity-40"
                    >
                        <X className="h-[18px] w-[18px]" aria-hidden />
                    </button>
                </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <button
                    type="button"
                    onClick={() => alCambiar([...valor, ''])}
                    disabled={valor.length >= 10}
                    className="flex min-h-[44px] items-center gap-1.5 text-[15px] font-medium text-indigo-700 disabled:opacity-40"
                >
                    <Plus className="h-4 w-4" aria-hidden /> Añadir
                </button>
                <button type="button" onClick={() => alCambiar([...APRECIACIONES_POR_DEFECTO])} className="min-h-[44px] text-sm font-medium text-gray-600 hover:text-gray-900">
                    Volver a las del MPPE
                </button>
            </div>
        </Grupo>
    );
}
