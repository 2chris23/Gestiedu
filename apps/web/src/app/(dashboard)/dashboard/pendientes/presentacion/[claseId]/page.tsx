'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { EstiloDelPapel, imprimirConAviso, useNombreDelDocumento } from '@/components/documentos/HojaImprimible';
import { materiasPendientes, fechaCorta } from '@/lib/materias-pendientes';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * EL ACTA DE PRESENTACIÓN DE UN MOMENTO DE MATERIA PENDIENTE
 *
 * La de la «superación pedagógica» (circulares 0007, 006696 y 000004): el
 * listado de TODOS los alumnos remitidos a la clase, cada encuentro del
 * momento con su fecha, hora y aula, y en cada uno la casilla para la firma
 * del que vino; al que faltó, «IN» (solo para efectos del acta). Al final, la
 * calificación del momento. Sale de la asistencia que pasó el docente.
 */
export default function ActaDePresentacionPage({ params }: { params: Promise<{ claseId: string }> }) {
    const { claseId } = use(params);
    const id = decodeURIComponent(claseId);
    const momento = Math.max(1, Number(useSearchParams().get('momento')) || 1);
    useNombreDelDocumento(`Acta de presentación del ${momento}º momento`);
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

    const encuentros = data.encuentros.filter((e) => e.momento === momento);
    const celda = 'border border-gray-400 px-1.5 py-1';
    const casilla = (estado: string | undefined) => (estado === 'AUSENTE' ? 'IN' : estado === 'JUSTIFICADO' ? 'Just.' : '');

    return (
        <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
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

            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none" aria-label="Acta de presentación">
                <header className="text-center">
                    <MembreteOficial />
                    <h1 className="mt-5 text-base font-bold uppercase tracking-widest text-gray-900">Acta de presentación de materia pendiente</h1>
                    <p className="text-sm text-gray-700">
                        {momento}º momento · año escolar {data.ciclo.nombre}
                    </p>
                </header>

                <p className="mt-5 text-justify text-sm leading-6 text-gray-900">
                    Los estudiantes cursantes de la materia pendiente <strong>{data.clase.materia}</strong> de {data.clase.grado}º año firman
                    dejando constancia de los días en que se desarrolló el proceso de superación pedagógica del {momento}º momento evaluativo,
                    con el (la) docente <strong>{data.clase.profesor?.nombre ?? '—'}</strong>. El listado comprende el total de estudiantes
                    remitidos a este proceso.
                </p>

                {encuentros.length === 0 ? (
                    <p className="mt-6 text-center text-sm text-gray-700">Este momento no tiene encuentros todavía.</p>
                ) : (
                    <>
                    {/* En el teléfono, una lista (la tabla no cabe); en el papel y en pantallas anchas, la tabla. */}
                    <ol className="mt-5 space-y-2 min-[700px]:hidden print:hidden" aria-label="Alumnos del acta">
                        {data.pendientes.map((p, i) => {
                            const delMomento = p.momentos.find((m) => m.momento === momento);
                            return (
                                <li key={p.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                                    <p className="font-semibold text-gray-900">
                                        {i + 1}. {p.alumno.nombre}
                                    </p>
                                    <ul className="mt-1 space-y-0.5 text-gray-700">
                                        {encuentros.map((e) => (
                                            <li key={e.id}>
                                                {e.tipo === 'TUTORIA' ? 'Tutoría' : `Evaluación ${e.opcion}ª`} del {fechaCorta(e.fecha)}:{' '}
                                                {e.asistencias[p.id] === 'PRESENTE' ? 'vino' : casilla(e.asistencias[p.id]) || '—'}
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="mt-1 text-gray-900">
                                        Calificación: <strong>{delMomento ? (delMomento.nota ?? 'IN') : '—'}</strong>
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
                                {encuentros.map((e) => (
                                    <th key={e.id} scope="col" className={`${celda} min-w-[5.5rem] text-center`}>
                                        <span className="block">{e.tipo === 'TUTORIA' ? 'Tutoría' : `Evaluación ${e.opcion}ª`}</span>
                                        <span className="block font-normal">
                                            {fechaCorta(e.fecha)}
                                            {e.hora ? ` · ${e.hora}` : ''}
                                        </span>
                                        {e.aula && <span className="block font-normal">{e.aula}</span>}
                                    </th>
                                ))}
                                <th scope="col" className={`${celda} text-center`}>Calificación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.pendientes.map((p, i) => {
                                const delMomento = p.momentos.find((m) => m.momento === momento);
                                return (
                                    <tr key={p.id}>
                                        <td className={`${celda} text-center tabular-nums`}>{i + 1}</td>
                                        <td className={`${celda} tabular-nums`}>{p.alumno.id}</td>
                                        <td className={celda}>{p.alumno.nombre}</td>
                                        {encuentros.map((e) => (
                                            <td key={e.id} className={`${celda} h-9 text-center font-semibold`}>
                                                {casilla(e.asistencias[p.id])}
                                            </td>
                                        ))}
                                        <td className={`${celda} text-center font-semibold tabular-nums`}>{delMomento ? (delMomento.nota ?? 'IN') : ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </>
                )}
                <p className="mt-2 text-xs text-gray-700">Los inasistentes se identifican con las siglas IN, solo para efectos del acta. Just.: falta justificada.</p>

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
