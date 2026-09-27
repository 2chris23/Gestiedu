'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardCheck, FileText, Loader2 } from 'lucide-react';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { getApiErrorMessage } from '@/lib/utils';
import api from '@/lib/axios';

/**
 * LA INSCRIPCIÓN, EN LA FICHA DEL ALUMNO
 *
 * Lo que ha entregado (la lista la pone el liceo en Configuración →
 * Documentos), lo que le falta y la planilla para imprimir. Se marca cuando
 * llega: crear la cuenta no lo pide. Solo el admin (`inscripcion.service.ts`).
 */

interface Recaudos {
    recaudos: Array<{ clave: string; nombre: string; entregado: boolean; entregadoEl: string | null }>;
    faltan: number;
    falta: string[];
}

export function InscripcionDelAlumno({ studentId }: { studentId: string }) {
    const { yo } = useQuienSoy();
    const esAdmin = yo?.role === 'ADMIN';
    const cola = useQueryClient();
    const { data, isLoading, error } = useQuery<Recaudos>({
        queryKey: ['recaudos', studentId],
        queryFn: async () => (await api.get(`/students/${encodeURIComponent(studentId)}/recaudos`)).data.data,
        enabled: esAdmin,
    });
    const marcar = useMutation({
        mutationFn: async ({ clave, entregado }: { clave: string; entregado: boolean }) =>
            (await api.put(`/students/${encodeURIComponent(studentId)}/recaudos/${clave}`, { entregado })).data.data as Recaudos,
        // La casilla cambia al tocarla; si el servidor no lo guarda, vuelve atrás.
        onMutate: ({ clave, entregado }) => {
            const antes = cola.getQueryData<Recaudos>(['recaudos', studentId]);
            if (antes) {
                cola.setQueryData<Recaudos>(['recaudos', studentId], {
                    ...antes,
                    recaudos: antes.recaudos.map((r) => (r.clave === clave ? { ...r, entregado } : r)),
                });
            }
            return { antes };
        },
        onSuccess: (nuevo) => cola.setQueryData(['recaudos', studentId], nuevo),
        onError: (e, _v, ctx) => {
            if (ctx?.antes) cola.setQueryData(['recaudos', studentId], ctx.antes);
            toast.error(getApiErrorMessage(e, 'No se pudo marcar'));
        },
    });

    if (!esAdmin) return null;

    return (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" aria-labelledby="inscripcion-titulo">
            <h3 id="inscripcion-titulo" className="mb-1 flex items-center gap-2 font-bold text-gray-800">
                <ClipboardCheck size={18} className="text-emerald-600" aria-hidden />
                Inscripción
            </h3>
            {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
                </p>
            ) : error || !data ? (
                <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo cargar la inscripción.')}</p>
            ) : (
                <>
                    <p className="text-sm text-gray-600">
                        {data.falta.length === 0 ? 'Tiene todo: datos y recaudos.' : `Le falta: ${data.falta.join(', ')}.`}
                    </p>
                    <ul className="mt-3 space-y-1">
                        {data.recaudos.map((r) => (
                            <li key={r.clave}>
                                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-gray-800 hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 accent-emerald-600"
                                        checked={r.entregado}
                                        disabled={marcar.isPending}
                                        onChange={(e) => marcar.mutate({ clave: r.clave, entregado: e.target.checked })}
                                    />
                                    <span className="flex-1">{r.nombre}</span>
                                    {r.entregadoEl && <span className="text-xs text-gray-500">{r.entregadoEl.split('-').reverse().join('/')}</span>}
                                </label>
                            </li>
                        ))}
                    </ul>
                    <Link
                        href={`/dashboard/planilla-de-inscripcion/${encodeURIComponent(studentId)}`}
                        className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                        <FileText className="h-4 w-4" aria-hidden /> Planilla de inscripción
                    </Link>
                </>
            )}
        </section>
    );
}

export default InscripcionDelAlumno;
