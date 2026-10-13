'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import { materiasPendientes, ESTADO_DE_PENDIENTE, textoDeLaOpcion, type MateriaPendiente } from '@/lib/materias-pendientes';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * LAS MATERIAS PENDIENTES DE LOS ALUMNOS DE UNA SECCIÓN (la pestaña de la sección)
 *
 * Lo que mira el profesor guía (y el admin, que entra por la misma puerta):
 * quién de su sección debe qué, quién la evalúa y cómo va en cada momento. Se
 * ve, no se toca: la nota la pone el profesor de la clase donde se trabaja
 * (la pestaña «Pendientes» de esa materia).
 */
export function PendientesDeLaSeccion({ classroomId }: { classroomId: string }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['materias-pendientes', 'seccion', classroomId],
        queryFn: () => materiasPendientes.deLaSeccion(classroomId),
    });

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
            </p>
        );
    }
    if (error || !data) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar las materias pendientes.')}</p>;
    if (data.pendientes.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
                Nadie de esta sección tiene materias pendientes este año.
            </p>
        );
    }

    // Por alumno: uno puede deber dos.
    const porAlumno = new Map<string, { nombre: string; filas: MateriaPendiente[] }>();
    for (const p of data.pendientes) {
        const a = porAlumno.get(p.alumno.id) ?? { nombre: p.alumno.nombre, filas: [] };
        a.filas.push(p);
        porAlumno.set(p.alumno.id, a);
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-600">
                {porAlumno.size} {porAlumno.size === 1 ? 'alumno' : 'alumnos'} con {data.pendientes.length}{' '}
                {data.pendientes.length === 1 ? 'materia pendiente' : 'materias pendientes'}. La nota la pone el profesor de cada clase.
            </p>
            <ul className="space-y-2.5">
                {[...porAlumno.entries()].map(([id, a]) => (
                    <li key={id} className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="min-w-0 truncate font-semibold text-gray-900">{a.nombre}</p>
                            <Link
                                href={`/dashboard/acta-de-compromiso/${encodeURIComponent(id)}`}
                                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                                <FileText className="h-4 w-4" aria-hidden /> Acta de compromiso
                            </Link>
                        </div>
                        <ul className="mt-1.5 divide-y divide-gray-100">
                            {a.filas.map((p) => {
                                const estado = ESTADO_DE_PENDIENTE[p.estado];
                                return (
                                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                        <div className="min-w-0 text-sm">
                                            <p className="font-medium text-gray-900">
                                                {p.materia.nombre} de {p.gradoDeOrigen}º
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                {p.clase ? `En ${p.clase.seccion}` : 'Sin clase todavía'} · evalúa {p.profesor?.nombre ?? 'nadie aún'}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {p.opciones.map((o) => (
                                                <span
                                                    key={`${o.momento}-${o.opcion}`}
                                                    className="rounded-md bg-gray-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-gray-800"
                                                    title={`${o.momento}º momento, ${o.opcion}ª opción`}
                                                >
                                                    {o.momento}º{o.opcion === 2 ? '·2ª' : ''} {textoDeLaOpcion(o)}
                                                </span>
                                            ))}
                                            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', estado.clase)}>
                                                {estado.texto}
                                                {p.notaFinal != null ? ` · ${p.notaFinal}` : ''}
                                            </span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default PendientesDeLaSeccion;
