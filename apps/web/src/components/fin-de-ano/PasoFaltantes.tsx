'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { finDeAno } from '@/lib/fin-de-ano';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * PASO 1 — ¿ESTÁ TODO CARGADO?
 *
 * Qué sección y materia tiene alumnos sin notas del último lapso (o sin la
 * apreciación final), y de qué profesor. Solo avisa: se puede seguir.
 */
export default function PasoFaltantes({ cicloId }: { cicloId: string }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['fin-de-ano', cicloId, 'faltantes'],
        queryFn: () => finDeAno.faltantes(cicloId),
    });

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando las notas de cada sección…
            </p>
        );
    }
    if (error || !data) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo revisar.')}</p>;
    if (!data.lapso) return <p className="text-sm text-gray-700">Este año escolar no tiene lapsos.</p>;
    if (data.faltantes.length === 0) {
        return (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Todo cargado: cada alumno tiene notas del {data.lapso.nombre}.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-700">
                Alumnos sin notas del <strong>{data.lapso.nombre}</strong> (o sin la apreciación final). Se puede seguir, pero su
                definitiva saldrá sin ese lapso.
            </p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {data.faltantes.map((f) => (
                    <li key={`${f.seccion.id}|${f.materia.id}`} className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900">
                                {f.seccion.nombre} · {f.materia.nombre}
                                {f.materia.cualitativa && <span className="ml-1 text-xs font-normal text-gray-600">(apreciación final)</span>}
                            </p>
                            <p className="text-sm font-bold text-amber-800">
                                {f.sinNota} de {f.total} sin {f.materia.cualitativa ? 'apreciación' : 'nota'}
                            </p>
                        </div>
                        <p className="text-xs text-gray-600">
                            {f.profesor ? `Profesor(a): ${f.profesor}` : 'Sin profesor asignado'} · {f.alumnos.join('; ')}
                            {f.sinNota > f.alumnos.length ? '…' : ''}
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
