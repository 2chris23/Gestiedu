'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { getApiErrorMessage, cn } from '@/lib/utils';
import api from '@/lib/axios';

/**
 * LA INSCRIPCIÓN, EN LA CABECERA DE LA FICHA
 *
 * Un anillo que se va llenando con lo que ha entregado el alumno (los datos
 * del Ministerio y los recaudos que pone el liceo en Configuración →
 * Documentos); completo, lleva una marca. Al pulsarlo se abre la lista para
 * marcar lo que llega y la planilla para imprimir. Crear la cuenta no lo pide.
 * Solo el admin (`inscripcion.service.ts`, `avanceDeLaInscripcion`).
 */

interface Recaudos {
    recaudos: Array<{ clave: string; nombre: string; entregado: boolean; entregadoEl: string | null }>;
    faltan: number;
    falta: string[];
    avance: { hecho: number; total: number };
}

function Anillo({ hecho, total }: { hecho: number; total: number }) {
    const completo = total > 0 && hecho >= total;
    const r = 18;
    const vuelta = 2 * Math.PI * r;
    const parte = total > 0 ? Math.min(hecho / total, 1) : 0;
    return (
        <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center">
            <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
                <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-gray-200" />
                <circle
                    cx="22"
                    cy="22"
                    r={r}
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={vuelta}
                    strokeDashoffset={vuelta * (1 - parte)}
                    className={cn('transition-[stroke-dashoffset] duration-500', completo ? 'stroke-emerald-600' : 'stroke-emerald-500')}
                />
            </svg>
            {completo ? (
                <Check className="h-5 w-5 text-emerald-700" strokeWidth={3} aria-hidden />
            ) : (
                <span className="text-[11px] font-bold tabular-nums text-gray-800">{Math.round(parte * 100)}%</span>
            )}
        </span>
    );
}

export function InscripcionDelAlumno({ studentId }: { studentId: string }) {
    const { yo } = useQuienSoy();
    const esAdmin = yo?.role === 'ADMIN';
    const cola = useQueryClient();
    const [abierta, setAbierta] = React.useState(false);
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
                    avance: { ...antes.avance, hecho: antes.avance.hecho + (entregado ? 1 : -1) },
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

    const avance = data?.avance ?? { hecho: 0, total: 0 };
    const completo = avance.total > 0 && avance.hecho >= avance.total;

    return (
        <>
            <button
                type="button"
                onClick={() => setAbierta(true)}
                disabled={isLoading}
                aria-label={
                    data
                        ? `Inscripción: ${completo ? 'completa' : `${avance.hecho} de ${avance.total}`}`
                        : 'Inscripción'
                }
                className="flex min-h-11 items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 py-1.5 pl-1.5 pr-4 text-left transition-colors hover:bg-emerald-50 disabled:opacity-70"
            >
                {isLoading ? (
                    <span className="flex h-12 w-12 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-700" aria-hidden />
                    </span>
                ) : (
                    <Anillo hecho={avance.hecho} total={avance.total} />
                )}
                <span>
                    <span className="block text-sm font-bold text-gray-900">Inscripción</span>
                    <span className="block text-xs text-gray-700">
                        {error ? 'No se pudo cargar' : completo ? 'Completa' : data ? `Le faltan ${avance.total - avance.hecho}` : ' '}
                    </span>
                </span>
            </button>

            {abierta && (
                <Dialog open onOpenChange={(v) => !v && setAbierta(false)}>
                    <DialogContent aria-label="Inscripción">
                        <DialogHeader>
                            <DialogTitle>Inscripción</DialogTitle>
                            <DialogDescription>
                                {!data
                                    ? getApiErrorMessage(error, 'No se pudo cargar la inscripción.')
                                    : data.falta.length === 0
                                      ? 'Tiene todo: datos y recaudos.'
                                      : `Le falta: ${data.falta.join(', ')}.`}
                            </DialogDescription>
                        </DialogHeader>
                        {data && (
                            <section aria-label="Inscripción">
                                <ul className="space-y-1">
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
                                                {r.entregadoEl && (
                                                    <span className="text-xs text-gray-600">{r.entregadoEl.split('-').reverse().join('/')}</span>
                                                )}
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href={`/dashboard/planilla-de-inscripcion/${encodeURIComponent(studentId)}`}
                                    className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                                >
                                    <FileText className="h-4 w-4" aria-hidden /> Planilla de inscripción
                                </Link>
                            </section>
                        )}
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

export default InscripcionDelAlumno;
