'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, FileText, Printer } from 'lucide-react';
import { useBoleta } from '@/hooks/useBoleta';
import { useQuienSoy } from '@/hooks/useQuienSoy';

/**
 * LA BOLETA DEL ALUMNO, PARA VER E IMPRIMIR
 *
 * La nota de cada materia en cada lapso, la definitiva y las inasistencias,
 * con el redondeo del liceo. La ven el admin, el propio alumno, su
 * representante y su profesor guía (lo decide el servidor). Se imprime con el
 * botón: lo que no es la boleta no sale en el papel (`print:hidden`).
 */

const nota = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n).padStart(2, '0') : n.toFixed(2);

const fechaLarga = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-VE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
};

export default function BoletaPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const router = useRouter();
    // `/dashboard/boleta/mia`: la del propio alumno (el acceso de su menú).
    const { yo } = useQuienSoy();
    const deQuien = cedula === 'mia' ? (yo?.id ?? '') : decodeURIComponent(cedula);
    const { data: b, isLoading: cargandoBoleta, error } = useBoleta(deQuien);
    const isLoading = cargandoBoleta || (cedula === 'mia' && !yo?.id);

    if (isLoading) {
        return <div className="p-8 text-sm text-gray-600">Cargando la boleta…</div>;
    }
    if (error || !b) {
        const status = (error as any)?.response?.status;
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">
                    {status === 403
                        ? 'No tienes permiso para ver esta boleta.'
                        : status === 404
                          ? 'Este estudiante no tiene inscripción en ningún ciclo.'
                          : 'No se pudo cargar la boleta.'}
                </p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    // La columna de revisión sale solo si alguna materia la tiene.
    const conRevision = b.materias.some((m) => m.revision != null);

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <div className="flex flex-wrap items-center justify-end gap-2">
                {/* La constancia de estudio: el alumno la saca él mismo (la del guía no: la emite el liceo). */}
                {yo?.role === 'STUDENT' && (
                    <Link
                        href="/dashboard/constancia/mia"
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                        <FileText className="h-4 w-4" /> Constancia de estudio
                    </Link>
                )}
                <button
                    onClick={() => window.print()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
                </div>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-8 print:border-0 print:shadow-none" aria-label="Boleta de calificaciones">
                <header className="border-b border-gray-200 pb-4 text-center">
                    <p className="text-lg font-bold text-gray-900">{b.liceo.nombre}</p>
                    {(b.liceo.direccion || b.liceo.ciudad) && (
                        <p className="text-xs text-gray-600">{[b.liceo.direccion, b.liceo.ciudad].filter(Boolean).join(' · ')}</p>
                    )}
                    <h1 className="mt-3 text-base font-bold uppercase tracking-wide text-gray-900">Boleta de calificaciones</h1>
                    <p className="text-sm text-gray-700">Año escolar {b.ciclo.nombre}</p>
                </header>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 py-4 text-sm sm:grid-cols-2">
                    <div><dt className="inline font-semibold text-gray-700">Estudiante: </dt><dd className="inline text-gray-900">{b.alumno.apellidos}, {b.alumno.nombres}</dd></div>
                    <div><dt className="inline font-semibold text-gray-700">Cédula: </dt><dd className="inline font-mono text-gray-900">{b.alumno.cedula}</dd></div>
                    <div><dt className="inline font-semibold text-gray-700">Año y sección: </dt><dd className="inline text-gray-900">{b.seccion.grado}° «{b.seccion.seccion}»</dd></div>
                    <div><dt className="inline font-semibold text-gray-700">Profesor(a) guía: </dt><dd className="inline text-gray-900">{b.seccion.guia ?? '—'}</dd></div>
                </dl>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-gray-700">
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-left">Materia</th>
                                {b.lapsos.map((l) => (
                                    <th key={l.id} scope="col" className="border border-gray-200 px-2 py-2 text-center">{l.nombre}</th>
                                ))}
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-center">Definitiva</th>
                                {conRevision && <th scope="col" className="border border-gray-200 px-2 py-2 text-center">Revisión</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {b.materias.map((m) => (
                                <tr key={m.id}>
                                    <th scope="row" className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-900">{m.nombre}</th>
                                    {b.lapsos.map((l) => {
                                        const n = m.notas[l.id];
                                        return (
                                            <td key={l.id} className={`border border-gray-200 px-2 py-1.5 text-center tabular-nums ${n !== null && n < b.reglas.notaMinima ? 'font-semibold text-red-700' : 'text-gray-900'}`}>
                                                {nota(n)}
                                            </td>
                                        );
                                    })}
                                    <td className={`border border-gray-200 px-2 py-1.5 text-center font-bold tabular-nums ${m.aprobada === false && m.revision == null ? 'text-red-700' : 'text-gray-900'}`}>
                                        {nota(m.definitiva)}
                                    </td>
                                    {conRevision && (
                                        <td className={`border border-gray-200 px-2 py-1.5 text-center font-bold tabular-nums ${m.revision != null && m.aprobada === false ? 'text-red-700' : 'text-gray-900'}`}>
                                            {m.revision == null ? '' : nota(m.revision)}
                                        </td>
                                    )}
                                </tr>
                            ))}
                            <tr className="bg-gray-50">
                                <th scope="row" className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-800">Promedio</th>
                                {b.lapsos.map((l) => (
                                    <td key={l.id} className="border border-gray-200 px-2 py-1.5 text-center font-semibold tabular-nums">{nota(b.promedios[l.id])}</td>
                                ))}
                                <td className="border border-gray-200 px-2 py-1.5 text-center font-bold tabular-nums" colSpan={conRevision ? 2 : 1}>{nota(b.promedios.definitivo)}</td>
                            </tr>
                            <tr>
                                <th scope="row" className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-800">Inasistencias</th>
                                {b.lapsos.map((l) => {
                                    const i = b.inasistencias[l.id];
                                    return (
                                        <td key={l.id} className="border border-gray-200 px-2 py-1.5 text-center text-xs text-gray-800">
                                            {i ? `${i.injustificadas} sin justificar · ${i.justificadas} justificadas` : '—'}
                                        </td>
                                    );
                                })}
                                <td className="border border-gray-200 px-2 py-1.5" colSpan={conRevision ? 2 : 1} />
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p className="mt-3 text-xs text-gray-600">
                    Escala del 01 al 20. Nota mínima aprobatoria: {b.reglas.notaMinima}.{' '}
                    {b.reglas.redondeo === 'MPPE'
                        ? 'Las notas se redondean al entero: una fracción de 0,50 o más sube al entero siguiente.'
                        : 'Las notas se expresan con dos decimales, sin redondear al entero.'}{' '}
                    «—»: sin notas.{conRevision ? ' La nota de revisión es la definitiva de la materia que se reprobó en el año.' : ''}
                </p>

                <footer className="mt-10 grid grid-cols-1 gap-10 text-center text-sm sm:grid-cols-2">
                    <div>
                        <div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-800">Profesor(a) guía</div>
                    </div>
                    <div>
                        <div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-800">Director(a)</div>
                    </div>
                    <p className="text-xs text-gray-600 sm:col-span-2">Emitida el {fechaLarga(b.emitidaEl)}</p>
                </footer>
            </article>
        </div>
    );
}
