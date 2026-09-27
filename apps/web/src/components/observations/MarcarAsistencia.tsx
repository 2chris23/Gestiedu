'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiErrorMessage, cn } from '@/lib/utils';

type Estado = 'PENDIENTE' | 'ASISTIO' | 'NO_ASISTIO';
const botonPrincipal = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60';
const botonSecundario = 'min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50';

/** ¿Vino? Sí o no, y lo que se habló. */
export function MarcarAsistencia({ citacion, alCerrar }: { citacion: { id: string; cuando: string; estado: Estado; loQueSeHablo: string | null }; alCerrar: () => void }) {
    const cola = useQueryClient();
    const [estado, setEstado] = React.useState<Estado>(citacion.estado === 'PENDIENTE' ? 'ASISTIO' : citacion.estado);
    const [habla, setHabla] = React.useState(citacion.loQueSeHablo ?? '');
    const marcar = useMutation({
        mutationFn: async () => (await api.put(`/citaciones/${citacion.id}/asistencia`, { estado, loQueSeHablo: habla.trim() })).data.data,
        onSuccess: () => {
            toast.success('Citación marcada');
            void cola.invalidateQueries({ queryKey: ['observaciones-panel'] });
            void cola.invalidateQueries({ queryKey: ['citacion', citacion.id] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo marcar')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && !marcar.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>¿Vino el representante?</DialogTitle>
                    <DialogDescription>Citación del {citacion.cuando}.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        marcar.mutate();
                    }}
                >
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Vino?">
                        {(['ASISTIO', 'NO_ASISTIO'] as const).map((v) => (
                            <button
                                key={v}
                                type="button"
                                role="radio"
                                aria-checked={estado === v}
                                onClick={() => setEstado(v)}
                                className={cn(
                                    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border text-sm font-semibold',
                                    estado === v ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-700'
                                )}
                            >
                                {estado === v && <Check className="h-4 w-4" aria-hidden />}
                                {v === 'ASISTIO' ? 'Sí, vino' : 'No vino'}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="cita-habla" className="text-sm font-semibold text-gray-700">
                            {estado === 'ASISTIO' ? 'Lo que se habló' : 'Qué se hace ahora (opcional)'}
                        </label>
                        <textarea id="cita-habla" value={habla} onChange={(e) => setHabla(e.target.value)} rows={4} maxLength={2000} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={alCerrar} className={botonSecundario}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={marcar.isPending} className={botonPrincipal}>
                            {marcar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
