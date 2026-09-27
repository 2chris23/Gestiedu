'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Download, FileText, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { getApiErrorMessage, cn } from '@/lib/utils';
import api from '@/lib/axios';

/**
 * EL TRASLADO Y EL RETIRO, EN LA FICHA DEL ALUMNO
 *
 * Retirarlo (fecha y motivo), la hoja de notas parciales para imprimir y el
 * archivo de traslado: si el otro liceo usa Gestiedu, lo importa y el alumno
 * llega con todo (`services/traslado.service.ts`). Y, si llegó trasladado,
 * los lapsos que trajo del otro liceo. Solo el admin.
 */

interface NotaTraida {
    id: string;
    nota: number;
    materiaDeOrigen: string;
    plantel: string;
    subject: { name: string };
    period: { name: string };
}

export function TrasladoDelAlumno({ studentId, archivado }: { studentId: string; archivado: boolean }) {
    const { yo } = useQuienSoy();
    const cola = useQueryClient();
    const [retirando, setRetirando] = React.useState(false);
    const [bajando, setBajando] = React.useState(false);
    const esAdmin = yo?.role === 'ADMIN';
    const traidas = useQuery<NotaTraida[]>({
        queryKey: ['notas-traidas', studentId],
        queryFn: async () => (await api.get(`/students/${encodeURIComponent(studentId)}/notas-traidas`)).data.data,
        enabled: esAdmin,
    });
    const quitar = useMutation({
        mutationFn: async (id: string) => (await api.delete(`/students/${encodeURIComponent(studentId)}/notas-traidas/${id}`)).data,
        onSuccess: () => {
            toast.success('Nota traída quitada');
            void cola.invalidateQueries({ queryKey: ['notas-traidas', studentId] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
    });
    if (!esAdmin) return null;

    const bajarArchivo = async () => {
        setBajando(true);
        try {
            const r = await api.get(`/students/${encodeURIComponent(studentId)}/traslado`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `traslado-${studentId.replace(/[^\w-]/g, '')}.gestiedu`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e) {
            toast.error(getApiErrorMessage(e, 'No se pudo preparar el archivo'));
        } finally {
            setBajando(false);
        }
    };

    const boton = 'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold hover:bg-gray-50';
    return (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" aria-labelledby="traslado-titulo">
            <h3 id="traslado-titulo" className="mb-1 flex items-center gap-2 font-bold text-gray-800">
                <ArrowRightLeft size={18} className="text-amber-600" aria-hidden /> Traslado y retiro
            </h3>
            <p className="text-sm text-gray-600">
                {archivado
                    ? 'Está retirado. Su hoja de notas y su archivo de traslado siguen aquí.'
                    : 'Si se va a otro liceo: se le retira, se le imprimen sus notas y se le da el archivo para que el otro liceo lo importe.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                {!archivado && (
                    <button type="button" onClick={() => setRetirando(true)} className={cn(boton, 'text-rose-700')}>
                        Retirar del liceo
                    </button>
                )}
                <Link href={`/dashboard/notas-parciales/${encodeURIComponent(studentId)}`} className={cn(boton, 'text-indigo-700')}>
                    <FileText className="h-4 w-4" aria-hidden /> Notas parciales
                </Link>
                <button type="button" onClick={bajarArchivo} disabled={bajando} className={cn(boton, 'text-indigo-700')}>
                    {bajando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} Archivo de traslado
                </button>
            </div>
            {(traidas.data?.length ?? 0) > 0 && (
                <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Lapsos traídos de {traidas.data![0].plantel}</p>
                    <ul className="mt-1 space-y-1">
                        {traidas.data!.map((n) => (
                            <li key={n.id} className="flex items-center justify-between gap-2 text-sm text-gray-800">
                                <span>
                                    {n.subject.name} · {n.period.name}: <strong>{n.nota}</strong>
                                    {n.materiaDeOrigen !== n.subject.name ? <span className="text-gray-500"> (allá: {n.materiaDeOrigen})</span> : null}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => quitar.mutate(n.id)}
                                    aria-label={`Quitar la nota traída de ${n.subject.name}, ${n.period.name}`}
                                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {retirando && <Retirar studentId={studentId} alCerrar={() => setRetirando(false)} />}
        </section>
    );
}

function Retirar({ studentId, alCerrar }: { studentId: string; alCerrar: () => void }) {
    const cola = useQueryClient();
    const hoy = useSchoolToday();
    const [fecha, setFecha] = React.useState(hoy);
    const [motivo, setMotivo] = React.useState<'TRASLADO' | 'OTRO'>('TRASLADO');
    const [detalle, setDetalle] = React.useState('');
    const retirar = useMutation({
        mutationFn: async () => (await api.post(`/students/${encodeURIComponent(studentId)}/retiro`, { fecha, motivo, detalle: detalle.trim() || undefined })).data,
        onSuccess: () => {
            toast.success('Retirado. Ya puedes imprimir sus notas y darle el archivo de traslado.');
            void cola.invalidateQueries({ queryKey: ['usuario', studentId] });
            void cola.invalidateQueries({ queryKey: ['usuarios'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo retirar')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && !retirar.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Retirar del liceo</DialogTitle>
                    <DialogDescription>Deja su sección y su cuenta se archiva. Sus notas y su historial se quedan.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        retirar.mutate();
                    }}
                >
                    <div className="space-y-1.5">
                        <label htmlFor="retiro-fecha" className="text-sm font-semibold text-gray-700">
                            Fecha del retiro
                        </label>
                        <Input id="retiro-fecha" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} required className="min-h-[44px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Motivo">
                        {(['TRASLADO', 'OTRO'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                role="radio"
                                aria-checked={motivo === m}
                                onClick={() => setMotivo(m)}
                                className={cn(
                                    'min-h-[44px] rounded-lg border text-sm font-semibold',
                                    motivo === m ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-700'
                                )}
                            >
                                {m === 'TRASLADO' ? 'Traslado a otro liceo' : 'Otro motivo'}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="retiro-detalle" className="text-sm font-semibold text-gray-700">
                            {motivo === 'TRASLADO' ? 'A qué liceo (opcional)' : 'Por qué'}
                        </label>
                        <Input id="retiro-detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={160} className="min-h-[44px]" />
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!fecha || retirar.isPending}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                            {retirar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Retirar
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default TrasladoDelAlumno;
