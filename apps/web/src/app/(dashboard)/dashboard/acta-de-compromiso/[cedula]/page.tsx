'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { materiasPendientes } from '@/lib/materias-pendientes';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * EL ACTA DE COMPROMISO DE LAS MATERIAS PENDIENTES
 *
 * La hoja que firman el alumno, su representante y los docentes cuando el
 * alumno pasa de año con materias pendientes: cuáles son, de qué año, quién
 * las evalúa y en cuántos momentos. Sale de los registros de verdad
 * (`materias-pendientes.service.actaDeCompromiso`), no se copia a mano. Quién
 * la ve lo decide el servidor (el alumno, su representante, el personal).
 */
export default function ActaDeCompromisoPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const router = useRouter();
    const studentId = decodeURIComponent(cedula);
    const { data: a, isLoading, error } = useQuery({
        queryKey: ['acta-de-compromiso', studentId],
        queryFn: () => materiasPendientes.acta(studentId),
    });

    if (isLoading) return <div className="p-8 text-sm text-gray-600">Cargando el acta…</div>;
    if (error || !a) {
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">{getApiErrorMessage(error, 'No se pudo cargar el acta.')}</p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    const docentes = Array.from(new Map(a.pendientes.filter((p) => p.profesor).map((p) => [p.profesor!.id, p.profesor!.nombre])).values());
    const representante = a.representantes[0];

    return (
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <button
                    onClick={() => window.print()}
                    disabled={a.pendientes.length === 0}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10 print:border-0 print:shadow-none" aria-label="Acta de compromiso">
                <header className="text-center">
                    <MembreteOficial />
                    <h1 className="mt-6 text-base font-bold uppercase tracking-widest text-gray-900">Acta de compromiso</h1>
                    <p className="text-sm text-gray-700">Materias pendientes{a.ciclo ? ` · año escolar ${a.ciclo}` : ''}</p>
                </header>

                {a.pendientes.length === 0 ? (
                    <p className="mt-8 text-center text-sm text-gray-700">{a.alumno.nombre} no tiene materias pendientes este año.</p>
                ) : (
                    <>
                        <p className="mt-6 text-justify text-sm leading-7 text-gray-900">
                            El (la) estudiante <strong>{a.alumno.nombre}</strong>, cédula {a.alumno.cedula}
                            {a.seccion ? `, cursante de ${a.seccion}` : ''}, y su representante
                            {representante ? (
                                <>
                                    {' '}
                                    <strong>{representante.nombre}</strong>, cédula {representante.cedula} ({representante.parentesco.toLowerCase()})
                                </>
                            ) : (
                                ' legal'
                            )}
                            , se comprometen a cumplir con las actividades de evaluación de las siguientes materias pendientes, en los
                            momentos que fije el plantel, sabiendo que su aprobación es necesaria para la prosecución de estudios.
                        </p>
                        <table className="mt-6 w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-gray-700">
                                    <th scope="col" className="border border-gray-300 px-2 py-2 text-left">Materia</th>
                                    <th scope="col" className="border border-gray-300 px-2 py-2 text-center">Año</th>
                                    <th scope="col" className="border border-gray-300 px-2 py-2 text-center">Nota</th>
                                    <th scope="col" className="border border-gray-300 px-2 py-2 text-left">Docente</th>
                                </tr>
                            </thead>
                            <tbody>
                                {a.pendientes.map((p) => (
                                    <tr key={p.id}>
                                        <td className="border border-gray-300 px-2 py-1.5">{p.materia.nombre}</td>
                                        <td className="border border-gray-300 px-2 py-1.5 text-center">
                                            {p.gradoDeOrigen}º{p.cicloDeOrigen ? ` (${p.cicloDeOrigen})` : ''}
                                        </td>
                                        <td className="border border-gray-300 px-2 py-1.5 text-center tabular-nums">{p.notaDeOrigen ?? '—'}</td>
                                        <td className="border border-gray-300 px-2 py-1.5">{p.profesor?.nombre ?? 'Por asignar'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <footer className="mt-20 grid grid-cols-1 gap-12 text-center text-sm sm:grid-cols-2">
                            <div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-900">Estudiante</div>
                            <div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-900">Representante</div>
                            {docentes.map((d) => (
                                <div key={d} className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-900">
                                    {d}
                                    <span className="block text-xs text-gray-600">Docente</span>
                                </div>
                            ))}
                            <div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-900">
                                Director(a)
                                <span className="block text-xs text-gray-600">Sello del plantel</span>
                            </div>
                        </footer>
                    </>
                )}
            </article>
        </div>
    );
}
