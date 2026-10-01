'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useMisMaterias } from '@/hooks/useMiClase';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';

/**
 * LAS MATERIAS DEL ALUMNO, PARA ENTRAR A CADA UNA («MI CLASE»)
 *
 * El alumno llega a una materia tocándola en su horario; el representante no
 * tiene ese horario a mano, así que entra por aquí (`?alumno=<id>`, desde
 * «Sus materias» en la tarjeta de su representado).
 */
export default function MisMateriasPage() {
    const router = useRouter();
    const buscar = useSearchParams();
    const { yo } = useQuienSoy();
    const alumnoId = yo?.role === 'STUDENT' ? yo.id : buscar.get('alumno');
    const { data, isLoading, error } = useMisMaterias(alumnoId);
    const deQuien = yo?.role === 'TUTOR' && alumnoId ? `?alumno=${encodeURIComponent(alumnoId)}` : '';

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-indigo-700"
            >
                <ChevronLeft size={18} /> Volver
            </button>
            <EncabezadoDePantalla titulo="Materias" descripcion={data?.seccion?.name ?? undefined} />

            {!alumnoId || isLoading ? (
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando las materias" />
                </div>
            ) : error || !data ? (
                <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-800">
                    No se pudieron cargar las materias.
                </p>
            ) : data.materias.length === 0 ? (
                <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-800">
                    Todavía no tiene materias asignadas.
                </p>
            ) : (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    {data.materias.map((m) => (
                        <li key={m.id}>
                            <Link
                                href={`/dashboard/mi-clase/${encodeURIComponent(m.id)}${deQuien}`}
                                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-gray-50"
                            >
                                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: m.color || '#6366f1' }} aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-gray-900">{m.name}</span>
                                    {m.profesor && <span className="block truncate text-xs text-gray-700">Prof. {m.profesor}</span>}
                                </span>
                                <ChevronRight size={18} className="shrink-0 text-gray-500" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
