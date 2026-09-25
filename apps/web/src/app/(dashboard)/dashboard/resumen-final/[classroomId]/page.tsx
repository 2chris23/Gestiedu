'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import api from '@/lib/axios';

/**
 * EL RESUMEN FINAL DEL RENDIMIENTO DE UNA SECCIÓN, PARA VER E IMPRIMIR
 *
 * Una fila por alumno y una columna por materia con su definitiva (la de la
 * revisión, si la tiene, con la del año al lado), su condición y, abajo,
 * cuántos aprobaron y reprobaron cada materia. Lo arma el servidor con las
 * reglas del cierre (`services/resumen-final.service.ts`); lo ven el admin y
 * el profesor guía.
 */

interface ResumenFinal {
    liceo: { nombre: string; codigo: string | null; direccion: string | null; ciudad: string | null };
    ciclo: { id: string; nombre: string; cerrado: boolean };
    seccion: { id: string; grado: number; seccion: string; turno: string | null; guia: string | null };
    materias: Array<{ id: string; nombre: string }>;
    alumnos: Array<{
        cedula: string;
        apellidos: string;
        nombres: string;
        sexo: string | null;
        notas: Record<string, { definitiva: number | null; revision: number | null }>;
        reprobadas: number;
        promedio: number | null;
        condicion: 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';
    }>;
    porMateria: Record<string, { aprobados: number; reprobados: number; sinNotas: number }>;
    totales: { inscritos: number; retirados: number; promovidos: number; conPendientes: number; noPromovidos: number };
    reglas: { notaMinima: number; redondeo: 'MPPE' | 'NINGUNO'; maxPendientes: number };
    emitidoEl: string;
}

const CONDICION: Record<string, string> = {
    PROMOVIDO: 'Promovido',
    PROMOVIDO_CON_PENDIENTES: 'Con pendiente',
    NO_PROMOVIDO: 'Repite',
};

const nota = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n).padStart(2, '0') : n.toFixed(2);

export default function ResumenFinalPage({ params }: { params: Promise<{ classroomId: string }> }) {
    const { classroomId } = use(params);
    const router = useRouter();
    // Por `useQuery`: así se guarda en el teléfono y se puede ver sin señal.
    const { data: r, isLoading, error } = useQuery<ResumenFinal>({
        queryKey: ['resumen-final', classroomId],
        queryFn: async () => (await api.get(`/classrooms/${encodeURIComponent(classroomId)}/resumen-final`)).data.data,
        retry: (veces, e: any) => {
            const status = e?.response?.status;
            return !(status >= 400 && status < 500) && veces < 2;
        },
    });

    if (isLoading) return <div className="p-8 text-sm text-gray-600">Cargando el resumen final…</div>;
    if (error || !r) {
        const status = (error as any)?.response?.status;
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">
                    {status === 403
                        ? 'El resumen final lo ven el admin y el profesor guía de la sección.'
                        : status === 404
                          ? 'Esta sección no existe.'
                          : 'No se pudo cargar el resumen final.'}
                </p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    const min = r.reglas.notaMinima;

    return (
        <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <button
                    onClick={() => window.print()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 print:border-0 print:shadow-none" aria-label="Resumen final del rendimiento">
                <header className="border-b border-gray-200 pb-4 text-center">
                    <p className="text-lg font-bold text-gray-900">{r.liceo.nombre}</p>
                    <h1 className="mt-2 text-base font-bold uppercase tracking-wide text-gray-900">Resumen final del rendimiento estudiantil</h1>
                    <p className="text-sm text-gray-700">
                        Año escolar {r.ciclo.nombre} · {r.seccion.grado}° año, sección «{r.seccion.seccion}»
                        {r.seccion.guia ? ` · Guía: ${r.seccion.guia}` : ''}
                    </p>
                    {!r.ciclo.cerrado && (
                        <p className="mt-1 text-xs font-medium text-amber-800 print:hidden">
                            El año no se ha cerrado: la condición es la que sugiere el sistema con las reglas del liceo.
                        </p>
                    )}
                </header>

                <div className="mt-4 overflow-x-auto relative">
                    <table className="w-full border-collapse text-xs sm:text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-gray-700">
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-left">N.º</th>
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-left">Cédula</th>
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-left">Apellidos y nombres</th>
                                {r.materias.map((m) => (
                                    <th key={m.id} scope="col" className="border border-gray-200 px-2 py-2 text-center">{m.nombre}</th>
                                ))}
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-center">Promedio</th>
                                <th scope="col" className="border border-gray-200 px-2 py-2 text-center">Condición</th>
                            </tr>
                        </thead>
                        <tbody>
                            {r.alumnos.map((a, i) => (
                                <tr key={a.cedula}>
                                    <td className="border border-gray-200 px-2 py-1.5 tabular-nums">{i + 1}</td>
                                    <td className="border border-gray-200 px-2 py-1.5 font-mono">{a.cedula}</td>
                                    <th scope="row" className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-900">
                                        {a.apellidos}, {a.nombres}
                                    </th>
                                    {r.materias.map((m) => {
                                        const n = a.notas[m.id];
                                        const cuenta = n?.revision ?? n?.definitiva ?? null;
                                        return (
                                            <td key={m.id} className={`border border-gray-200 px-2 py-1.5 text-center tabular-nums ${cuenta !== null && cuenta < min ? 'font-semibold text-red-700' : 'text-gray-900'}`}>
                                                {nota(cuenta)}
                                                {n?.revision != null && <span className="block text-[12px] text-gray-600">rev. (año {nota(n.definitiva)})</span>}
                                            </td>
                                        );
                                    })}
                                    <td className="border border-gray-200 px-2 py-1.5 text-center font-semibold tabular-nums">{nota(a.promedio)}</td>
                                    <td className="border border-gray-200 px-2 py-1.5 text-center">{CONDICION[a.condicion]}</td>
                                </tr>
                            ))}
                            <tr className="bg-gray-50">
                                <th scope="row" colSpan={3} className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-800">Aprobados</th>
                                {r.materias.map((m) => (
                                    <td key={m.id} className="border border-gray-200 px-2 py-1.5 text-center tabular-nums">{r.porMateria[m.id].aprobados}</td>
                                ))}
                                <td colSpan={2} className="border border-gray-200" />
                            </tr>
                            <tr className="bg-gray-50">
                                <th scope="row" colSpan={3} className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-800">Reprobados</th>
                                {r.materias.map((m) => (
                                    <td key={m.id} className="border border-gray-200 px-2 py-1.5 text-center tabular-nums">{r.porMateria[m.id].reprobados}</td>
                                ))}
                                <td colSpan={2} className="border border-gray-200" />
                            </tr>
                        </tbody>
                    </table>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                    <div><dt className="text-gray-600">Inscritos</dt><dd className="font-bold text-gray-900">{r.totales.inscritos}</dd></div>
                    <div><dt className="text-gray-600">Promovidos</dt><dd className="font-bold text-gray-900">{r.totales.promovidos}</dd></div>
                    <div><dt className="text-gray-600">Con pendiente</dt><dd className="font-bold text-gray-900">{r.totales.conPendientes}</dd></div>
                    <div><dt className="text-gray-600">Repiten</dt><dd className="font-bold text-gray-900">{r.totales.noPromovidos}</dd></div>
                    <div><dt className="text-gray-600">Retirados</dt><dd className="font-bold text-gray-900">{r.totales.retirados}</dd></div>
                </dl>

                <p className="mt-3 text-xs text-gray-600">
                    Nota mínima aprobatoria: {min}. Hasta {r.reglas.maxPendientes} materia(s) pendiente(s) para promover.{' '}
                    {r.reglas.redondeo === 'MPPE' ? 'Definitivas redondeadas al entero (0,50 o más sube).' : 'Definitivas con dos decimales.'}{' '}
                    «—»: sin notas. «rev.»: nota de la revisión, que es la definitiva.
                </p>

                <footer className="mt-10 grid grid-cols-1 gap-10 text-center text-sm sm:grid-cols-2">
                    <div><div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-800">Profesor(a) guía</div></div>
                    <div><div className="mx-auto w-56 border-t border-gray-400 pt-1 text-gray-800">Control de estudios</div></div>
                </footer>
            </article>
        </div>
    );
}
