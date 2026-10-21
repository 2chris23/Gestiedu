'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { EstiloDelPapel, imprimirConAviso, useNombreDelDocumento } from '@/components/documentos/HojaImprimible';
import { materiasPendientes, fechaCorta, textoDeLaOpcion } from '@/lib/materias-pendientes';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * EL ACTA DE UN MOMENTO DE MATERIA PENDIENTE
 *
 * La hoja que el docente entrega a control de estudios: TODOS los alumnos
 * remitidos a esa clase (no solo los que vinieron), la nota de la 1ª y de la
 * 2ª opción, la del momento y una casilla para la firma de cada uno; el que
 * no se presentó, «IN». Así la traen los formatos de las circulares 0007,
 * 006696 y 000004 (superación pedagógica). Firman el docente, el
 * coordinador de evaluación y el director.
 */
export default function ActaDelMomentoPage({ params }: { params: Promise<{ claseId: string }> }) {
    const { claseId } = use(params);
    const id = decodeURIComponent(claseId);
    const momento = Math.max(1, Number(useSearchParams().get('momento')) || 1);
    useNombreDelDocumento(`Acta del ${momento}º momento de materia pendiente`);
    const router = useRouter();
    const { data, isLoading, error } = useQuery({
        queryKey: ['materias-pendientes', 'clase', id],
        queryFn: () => materiasPendientes.deLaClase(id),
    });

    if (isLoading) return <div className="p-8 text-sm text-gray-600">Cargando el acta…</div>;
    if (error || !data) {
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">{getApiErrorMessage(error, 'No se pudo cargar el acta.')}</p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    const ventana = data.cronograma.momentos.find((m) => m.numero === momento);
    const conSegunda = data.reglas.segundaOpcion !== 'NO';
    const celda = 'border border-gray-400 px-1.5 py-1';

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <EstiloDelPapel papel="carta" />
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <button
                    onClick={() => void imprimirConAviso()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none" aria-label="Acta del momento">
                <header className="text-center">
                    <MembreteOficial />
                    <h1 className="mt-5 text-base font-bold uppercase tracking-widest text-gray-900">Acta de evaluación de materia pendiente</h1>
                    <p className="text-sm text-gray-700">
                        {momento}º momento · año escolar {data.ciclo.nombre}
                    </p>
                </header>

                <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-gray-900 sm:grid-cols-2">
                    <div>
                        <dt className="inline font-semibold">Área de formación: </dt>
                        <dd className="inline">{data.clase.materia}</dd>
                    </div>
                    <div>
                        <dt className="inline font-semibold">Año: </dt>
                        <dd className="inline">{data.clase.grado}º</dd>
                    </div>
                    <div>
                        <dt className="inline font-semibold">Docente: </dt>
                        <dd className="inline">{data.clase.profesor?.nombre ?? '—'}</dd>
                    </div>
                    {ventana && (
                        <div>
                            <dt className="inline font-semibold">Fechas: </dt>
                            <dd className="inline">
                                1ª opción {fechaCorta(ventana.desde1)}–{fechaCorta(ventana.hasta1)}
                                {conSegunda && ventana.desde2 && ventana.hasta2 ? ` · 2ª opción ${fechaCorta(ventana.desde2)}–${fechaCorta(ventana.hasta2)}` : ''}
                            </dd>
                        </div>
                    )}
                </dl>

                {/* En el teléfono, una lista (la tabla no cabe); en el papel y en pantallas anchas, la tabla. */}
                <ol className="mt-5 space-y-2 min-[700px]:hidden print:hidden" aria-label="Alumnos del acta">
                    {data.pendientes.map((p, i) => {
                        const op = (o: 1 | 2) => p.opciones.find((x) => x.momento === momento && x.opcion === o);
                        const delMomento = p.momentos.find((m) => m.momento === momento);
                        return (
                            <li key={p.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                                <p className="font-semibold text-gray-900">
                                    {i + 1}. {p.alumno.nombre}
                                </p>
                                <p className="text-gray-700">
                                    {p.seccionActual ?? '—'} · 1ª: {op(1) ? textoDeLaOpcion(op(1)!) : '—'}
                                    {conSegunda ? ` · 2ª: ${op(2) ? textoDeLaOpcion(op(2)!) : '—'}` : ''} · Momento:{' '}
                                    <strong>{delMomento ? (delMomento.nota ?? 'IN') : '—'}</strong>
                                </p>
                            </li>
                        );
                    })}
                </ol>
                <table className="mt-5 hidden w-full border-collapse text-xs text-gray-900 min-[700px]:table print:table">
                    <thead>
                        <tr className="bg-gray-50">
                            <th scope="col" className={`${celda} w-8 text-center`}>N.º</th>
                            <th scope="col" className={`${celda} text-left`}>Cédula</th>
                            <th scope="col" className={`${celda} text-left`}>Apellidos y nombres</th>
                            <th scope="col" className={`${celda} text-left`}>Cursa</th>
                            <th scope="col" className={`${celda} text-center`}>1ª opción</th>
                            {conSegunda && <th scope="col" className={`${celda} text-center`}>2ª opción</th>}
                            <th scope="col" className={`${celda} text-center`}>Nota del momento</th>
                            <th scope="col" className={`${celda} w-32 text-left`}>Firma del estudiante</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.pendientes.map((p, i) => {
                            const op = (o: 1 | 2) => p.opciones.find((x) => x.momento === momento && x.opcion === o);
                            const delMomento = p.momentos.find((m) => m.momento === momento);
                            return (
                                <tr key={p.id}>
                                    <td className={`${celda} text-center tabular-nums`}>{i + 1}</td>
                                    <td className={`${celda} tabular-nums`}>{p.alumno.id}</td>
                                    <td className={celda}>{p.alumno.nombre}</td>
                                    <td className={celda}>{p.seccionActual ?? '—'}</td>
                                    <td className={`${celda} text-center tabular-nums`}>{op(1) ? textoDeLaOpcion(op(1)!) : ''}</td>
                                    {conSegunda && <td className={`${celda} text-center tabular-nums`}>{op(2) ? textoDeLaOpcion(op(2)!) : ''}</td>}
                                    <td className={`${celda} text-center font-semibold tabular-nums`}>
                                        {delMomento ? (delMomento.nota ?? 'IN') : p.estado === 'APROBADA' && !delMomento ? 'Aprobada antes' : ''}
                                    </td>
                                    <td className={celda} />
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="mt-2 text-xs text-gray-700">
                    IN: inasistente (solo para efectos del acta). Just.: falta justificada. Nota mínima aprobatoria: {data.minima}.
                </p>

                <footer className="mt-16 grid grid-cols-1 gap-12 text-center text-sm sm:grid-cols-3">
                    <div className="mx-auto w-48 border-t border-gray-400 pt-1 text-gray-900">
                        {data.clase.profesor?.nombre ?? 'Docente'}
                        <span className="block text-xs text-gray-600">Docente</span>
                    </div>
                    <div className="mx-auto w-48 border-t border-gray-400 pt-1 text-gray-900">
                        Coordinador(a)
                        <span className="block text-xs text-gray-600">de evaluación</span>
                    </div>
                    <div className="mx-auto w-48 border-t border-gray-400 pt-1 text-gray-900">
                        Director(a)
                        <span className="block text-xs text-gray-600">Sello del plantel</span>
                    </div>
                </footer>
            </article>
        </div>
    );
}
