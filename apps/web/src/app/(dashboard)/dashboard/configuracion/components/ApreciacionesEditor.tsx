'use client';

import { Plus, X } from 'lucide-react';

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
        <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">Apreciaciones (materias sin nota)</legend>
            <p className="mb-3 text-xs text-gray-600">
                Para las materias que se evalúan con apreciación, como Orientación o Grupos de Creación. De la mejor
                a la peor. No entran en ningún promedio ni en la promoción.
            </p>
            <ol className="space-y-2">
                {valor.map((v, i) => (
                    <li key={i} className="flex items-center gap-2">
                        <span className="w-6 text-right text-xs font-semibold text-gray-500">{i + 1}.</span>
                        <input
                            aria-label={`Apreciación ${i + 1}`}
                            value={v}
                            maxLength={40}
                            onChange={(e) => cambiar(i, e.target.value)}
                            className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                            type="button"
                            onClick={() => quitar(i)}
                            disabled={valor.length <= 2}
                            aria-label={`Quitar ${v || 'esta apreciación'}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </li>
                ))}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => alCambiar([...valor, ''])}
                    disabled={valor.length >= 10}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                >
                    <Plus className="h-4 w-4" aria-hidden /> Añadir
                </button>
                <button
                    type="button"
                    onClick={() => alCambiar([...APRECIACIONES_POR_DEFECTO])}
                    className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                    Volver a las del MPPE
                </button>
                {error && <p className="text-sm text-rose-700">{error}</p>}
            </div>
        </fieldset>
    );
}
