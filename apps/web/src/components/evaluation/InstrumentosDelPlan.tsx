'use client';

import * as React from 'react';
import Link from 'next/link';
import { ClipboardList, FileSignature, Printer } from 'lucide-react';
import { useInstrumentosDelLapso } from '@/hooks/useInstrumentos';
import { diferido } from '@/components/common/Diferido';
import { NOMBRE_DEL_TIPO } from './nombres-de-instrumentos';

const EditorDeInstrumento = diferido(() => import('./EditorDeInstrumento'), { alto: 480 });

/**
 * LOS INSTRUMENTOS DE LAS EVALUACIONES DEL PLAN
 *
 * Debajo del plan: cada evaluación (las que tienen puntos) con su instrumento
 * —lista de cotejo, escala, rúbrica o por puntos— y el botón para armarlo. Con
 * él, en la clase en vivo se califica marcando casillas. Y los papeles que se
 * entregan con el plan: el acta de socialización y los instrumentos.
 */
export default function InstrumentosDelPlan({ classroomId, subjectId, lapso, canEdit }: { classroomId: string; subjectId: string; lapso: string; canEdit: boolean }) {
    const { data, isLoading } = useInstrumentosDelLapso(classroomId, subjectId, lapso);
    const [editando, setEditando] = React.useState<{ id: string; titulo: string } | null>(null);
    const base = `${encodeURIComponent(classroomId)}/${encodeURIComponent(subjectId)}?lapso=${lapso}`;

    return (
        <section className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4 print:hidden" aria-label="Instrumentos de evaluación">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <ClipboardList className="h-4 w-4 text-indigo-600" aria-hidden /> Instrumentos de evaluación
                </h3>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={`/dashboard/acta-de-socializacion/${base}`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <FileSignature className="h-3.5 w-3.5" aria-hidden /> Acta de socialización
                    </Link>
                    <Link
                        href={`/dashboard/instrumentos-de-evaluacion/${base}`}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimir todos
                    </Link>
                </div>
            </div>
            {isLoading && <p className="text-sm text-gray-600">Cargando…</p>}
            {data && data.evaluaciones.length === 0 && <p className="text-sm text-gray-600">Este lapso todavía no tiene evaluaciones con puntos en el plan.</p>}
            {data && data.evaluaciones.length > 0 && (
                <ul className="divide-y divide-gray-100">
                    {data.evaluaciones.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                    Semana {e.semana} · {e.actividad || 'Evaluación'} <span className="text-gray-600">({e.puntos} pts.)</span>
                                </p>
                                <p className="text-xs text-gray-600">
                                    {e.instrumento
                                        ? `${NOMBRE_DEL_TIPO[e.instrumento.tipo]} · ${e.instrumento.criterios.length} criterios · vale ${e.maximo}`
                                        : e.nombreDelInstrumento
                                          ? `En el plan dice «${e.nombreDelInstrumento}»: todavía sin armar`
                                          : 'Sin instrumento: se califica a mano'}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Este solo, con las notas ya puestas. */}
                                {e.instrumento && (
                                    <Link
                                        href={`/dashboard/instrumentos-de-evaluacion/${base}&evaluacion=${encodeURIComponent(e.id)}`}
                                        aria-label={`Imprimir el instrumento de la semana ${e.semana}`}
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                    >
                                        <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimir
                                    </Link>
                                )}
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => setEditando({ id: e.id, titulo: `Semana ${e.semana} · ${e.actividad || 'Evaluación'}` })}
                                        className="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-50 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                    >
                                        {e.instrumento ? 'Editar instrumento' : 'Armar instrumento'}
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {editando && <EditorDeInstrumento rowId={editando.id} titulo={editando.titulo} abierto alCerrar={() => setEditando(null)} />}
        </section>
    );
}
