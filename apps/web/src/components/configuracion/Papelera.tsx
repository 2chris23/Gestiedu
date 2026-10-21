'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Trash2 } from 'lucide-react';
import api from '@/lib/axios';
import { useConfirm } from '@/hooks/useConfirm';
import { Grupo, Opciones, CargandoAjustes } from '@/components/configuracion/ajustes';
import { cn, getApiErrorMessage } from '@/lib/utils';

/**
 * LA PAPELERA (19-oct-2026; servidor: `services/papelera.service.ts`)
 *
 * Cristian: «imagina que eres el admin y borraste sin querer un estudiante y
 * lo quieres recuperar… claro, esto tendría un límite». Como «Eliminados
 * recientemente» de las fotos del teléfono: cada borrado en una fila, con
 * Restaurar (vuelve entero: el alumno con sus notas y su asistencia) y Borrar
 * para siempre. Pasado el plazo del liceo, se va de la base solo.
 */

interface Borrado {
    operacion: string;
    que: string;
    tipo: string | null;
    masCosas: number;
    borradoPor: string | null;
    cuando: string;
    seBorraEl: string;
}
interface LaPapelera {
    dias: number;
    total: number;
    pagina: number;
    porPagina: number;
    borrados: Borrado[];
}

const PLAZOS = ['7', '15', '30', '60', '90'] as const;
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
const diasQueQuedan = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

export default function Papelera() {
    const qc = useQueryClient();
    const confirmar = useConfirm();
    const [pagina, setPagina] = React.useState(1);
    const { data, isLoading } = useQuery({
        queryKey: ['papelera', pagina],
        queryFn: async () => (await api.get('/papelera', { params: { pagina } })).data.data as LaPapelera,
    });
    const otraVez = () => void qc.invalidateQueries({ queryKey: ['papelera'] });

    const restaurar = useMutation({
        mutationFn: async (b: Borrado) => (await api.post(`/papelera/${encodeURIComponent(b.operacion)}/restaurar`)).data.data as { que: string },
        onSuccess: (r) => {
            toast.success(`Restaurado: ${r.que}`);
            otraVez();
            // Lo restaurado vuelve a todas las pantallas.
            void qc.invalidateQueries();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo restaurar')),
    });
    const borrar = useMutation({
        mutationFn: async (b: Borrado) => api.delete(`/papelera/${encodeURIComponent(b.operacion)}`),
        onSuccess: () => {
            toast.success('Borrado para siempre');
            otraVez();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo borrar')),
    });
    const plazo = useMutation({
        mutationFn: async (dias: number) => api.put('/papelera/ajustes', { dias }),
        onSuccess: () => {
            toast.success('Plazo guardado');
            otraVez();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el plazo')),
    });

    if (isLoading || !data) return <CargandoAjustes />;
    const paginas = Math.max(1, Math.ceil(data.total / data.porPagina));

    return (
        <div className="space-y-5">
            <Grupo
                titulo="Cuánto se guarda lo borrado"
                pie={`Pasado ese tiempo, lo borrado se va de la base para siempre. En las copias de seguridad dura hasta que caducan.`}
            >
                <div className="px-4 py-3">
                    <Opciones
                        etiqueta="Días que se guarda lo borrado"
                        valor={String(data.dias) as (typeof PLAZOS)[number]}
                        opciones={PLAZOS.map((d) => ({ valor: d, texto: `${d} días` }))}
                        alCambiar={(d) => plazo.mutate(Number(d))}
                    />
                </div>
            </Grupo>

            {data.borrados.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-600">La papelera está vacía.</p>
            ) : (
                <Grupo titulo={`Borrado (${data.total})`}>
                    <ul aria-label="Lo borrado" className="divide-y divide-gray-100" data-papelera>
                        {data.borrados.map((b) => (
                            <li key={b.operacion} className="px-4 py-3">
                                <p className="text-[15px] font-semibold text-gray-900">{b.que}</p>
                                <p className="mt-0.5 text-sm text-gray-600">
                                    {b.masCosas > 0 ? `Con ${b.masCosas} ${b.masCosas === 1 ? 'cosa suya' : 'cosas suyas'} (notas, asistencia…). ` : ''}
                                    Lo borró {b.borradoPor ?? 'alguien'} el {fecha(b.cuando)}.
                                </p>
                                <p className={cn('mt-0.5 text-xs', diasQueQuedan(b.seBorraEl) <= 3 ? 'font-semibold text-red-700' : 'text-gray-600')}>
                                    Se borra para siempre el {fecha(b.seBorraEl)} ({diasQueQuedan(b.seBorraEl)} días)
                                </p>
                                <div className="mt-2 flex gap-2">
                                    <button
                                        type="button"
                                        disabled={restaurar.isPending}
                                        onClick={async () => {
                                            if (!(await confirmar({ title: `¿Restaurar ${b.que}?`, description: 'Vuelve todo lo que se borró con él, tal como estaba.', confirmLabel: 'Restaurar' }))) return;
                                            restaurar.mutate(b);
                                        }}
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                                    >
                                        <RotateCcw className="h-4 w-4" aria-hidden /> Restaurar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={borrar.isPending}
                                        onClick={async () => {
                                            if (
                                                !(await confirmar({
                                                    title: `¿Borrar ${b.que} para siempre?`,
                                                    description: 'Ya no se podrá restaurar desde aquí.',
                                                    confirmLabel: 'Borrar para siempre',
                                                }))
                                            )
                                                return;
                                            borrar.mutate(b);
                                        }}
                                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-gray-100 px-4 text-sm font-semibold text-red-700 disabled:opacity-60"
                                    >
                                        <Trash2 className="h-4 w-4" aria-hidden /> Borrar para siempre
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Grupo>
            )}

            {paginas > 1 && (
                <div className="flex items-center justify-between px-4">
                    <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-indigo-700 disabled:opacity-40">
                        Más nuevos
                    </button>
                    <span className="text-sm text-gray-600">
                        {pagina} de {paginas}
                    </span>
                    <button
                        type="button"
                        disabled={pagina >= paginas}
                        onClick={() => setPagina((p) => p + 1)}
                        className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-indigo-700 disabled:opacity-40"
                    >
                        Más viejos
                    </button>
                </div>
            )}
        </div>
    );
}
