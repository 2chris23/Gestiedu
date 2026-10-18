'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardCheck, ClipboardList, FileSignature, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useInstrumentosDelLapso } from '@/hooks/useInstrumentos';
import { diferido } from '@/components/common/Diferido';
import { NOMBRE_DEL_TIPO } from './nombres-de-instrumentos';

const EditorDeInstrumento = diferido(() => import('./EditorDeInstrumento'), { alto: 480 });

/**
 * LOS INSTRUMENTOS DE LAS EVALUACIONES DEL PLAN
 *
 * Una ventana que sale del botón «Instrumentos» del plan (Cristian,
 * 17-oct-2026: antes era una caja fija debajo del plan). Arriba, los papeles
 * que se entregan con el plan —el acta de socialización y todos los
 * instrumentos—; debajo, cada evaluación con puntos es una fila como los
 * Movimientos: al tocarla se arma o se edita su instrumento (lista de cotejo,
 * escala, rúbrica o por puntos), y el icono de la derecha imprime ese solo.
 */
export default function InstrumentosDelPlan({
    classroomId,
    subjectId,
    lapso,
    canEdit,
    alCerrar,
}: {
    classroomId: string;
    subjectId: string;
    lapso: string;
    canEdit: boolean;
    alCerrar: () => void;
}) {
    const { data, isLoading } = useInstrumentosDelLapso(classroomId, subjectId, lapso);
    const [editando, setEditando] = React.useState<{ id: string; titulo: string } | null>(null);
    const base = `${encodeURIComponent(classroomId)}/${encodeURIComponent(subjectId)}?lapso=${lapso}`;
    const armados = data?.evaluaciones.filter((e) => e.instrumento).length ?? 0;

    return (
        <>
            <Sheet open={!editando} onOpenChange={(v) => !v && alCerrar()}>
                <SheetContent
                    side="bottom"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
                >
                    <SheetTitle className="pr-12 text-lg font-bold text-gray-900">Instrumentos</SheetTitle>
                    <SheetDescription className="text-sm text-gray-600">
                        {data ? `${armados} de ${data.evaluaciones.length} armados` : 'Las evaluaciones del plan y su instrumento'}
                    </SheetDescription>

                    <section aria-label="Instrumentos de evaluación" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
                        {/* Los papeles que se entregan con el plan. */}
                        <div className="grid grid-cols-2 gap-2">
                            <Link
                                href={`/dashboard/acta-de-socializacion/${base}`}
                                className="flex min-h-[56px] items-center gap-2.5 rounded-[20px] bg-white px-3 ring-1 ring-gray-200 transition-colors hover:bg-indigo-50"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                    <FileSignature className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="min-w-0 text-sm font-medium leading-tight text-gray-900">Acta de socialización</span>
                            </Link>
                            <Link
                                href={`/dashboard/instrumentos-de-evaluacion/${base}`}
                                className="flex min-h-[56px] items-center gap-2.5 rounded-[20px] bg-white px-3 ring-1 ring-gray-200 transition-colors hover:bg-indigo-50"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                    <Printer className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="min-w-0 text-sm font-medium leading-tight text-gray-900">Imprimir todos</span>
                            </Link>
                        </div>

                        {isLoading && <p className="px-1 text-sm text-gray-600">Cargando…</p>}
                        {data && data.evaluaciones.length === 0 && (
                            <p className="rounded-[22px] bg-white px-4 py-6 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                                Este lapso todavía no tiene evaluaciones con puntos en el plan.
                            </p>
                        )}
                        {data && data.evaluaciones.length > 0 && (
                            <ul className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                                {data.evaluaciones.map((e) => {
                                    const titulo = `Semana ${e.semana} · ${e.actividad || 'Evaluación'}`;
                                    const detalle = e.instrumento
                                        ? `${NOMBRE_DEL_TIPO[e.instrumento.tipo]} · ${e.instrumento.criterios.length} criterios · vale ${e.maximo}`
                                        : e.nombreDelInstrumento
                                          ? `«${e.nombreDelInstrumento}», sin armar`
                                          : 'Sin instrumento';
                                    const Icono = e.instrumento ? ClipboardCheck : ClipboardList;
                                    const dentro = (
                                        <>
                                            <span
                                                className={cn(
                                                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                                    e.instrumento ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                                                )}
                                            >
                                                <Icono className="h-[18px] w-[18px]" aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15px] font-medium text-gray-900">{titulo}</span>
                                                <span className="block truncate text-sm text-gray-600">{detalle}</span>
                                            </span>
                                            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-indigo-700">{e.puntos} pts</span>
                                        </>
                                    );
                                    return (
                                        <li key={e.id} className="flex items-center">
                                            {canEdit ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setEditando({ id: e.id, titulo })}
                                                    aria-label={`${e.instrumento ? 'Editar instrumento' : 'Armar instrumento'}: ${titulo}`}
                                                    className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                                                >
                                                    {dentro}
                                                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                                                </button>
                                            ) : (
                                                <div className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5">{dentro}</div>
                                            )}
                                            {/* Este solo, con las notas ya puestas. */}
                                            {e.instrumento && (
                                                <Link
                                                    href={`/dashboard/instrumentos-de-evaluacion/${base}&evaluacion=${encodeURIComponent(e.id)}`}
                                                    aria-label={`Imprimir el instrumento de la semana ${e.semana}`}
                                                    title="Imprimir"
                                                    className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                                                >
                                                    <Printer className="h-5 w-5" aria-hidden />
                                                </Link>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </SheetContent>
            </Sheet>
            {/* El editor tapa la ventana; al cerrarlo, se vuelve a la lista. */}
            {editando && <EditorDeInstrumento rowId={editando.id} titulo={editando.titulo} abierto alCerrar={() => setEditando(null)} />}
        </>
    );
}
