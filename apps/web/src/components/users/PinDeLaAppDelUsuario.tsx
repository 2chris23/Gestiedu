'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { useConfirm } from '@/hooks/useConfirm';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * EL PIN DE LA APP DE ESTA PERSONA (solo el admin)
 *
 * Para quien tiene un teléfono sin bloqueo de pantalla, la app pide un PIN
 * de 4 números (`lib/pin-de-la-app.ts`). Lo crea la persona la primera vez;
 * después **solo un admin** lo cambia o lo resetea, aquí (decisión de
 * Cristian). Si se le olvidó o quedó trabado tras 10 intentos, se resetea y
 * la próxima vez crea uno nuevo. Queda anotado y se le avisa.
 */
export function PinDeLaAppDelUsuario({ userId }: { userId: string }) {
    const { yo } = useQuienSoy();
    const esAdmin = yo?.role === 'ADMIN';
    const cola = useQueryClient();
    const confirmar = useConfirm();
    const clave = ['usuario', userId, 'pin-de-la-app'];
    const [cambiando, setCambiando] = React.useState(false);
    const [nuevo, setNuevo] = React.useState('');

    const { data, isLoading } = useQuery({
        queryKey: clave,
        queryFn: async () => (await api.get(`/users/${encodeURIComponent(userId)}/pin`)).data as { tienePin: boolean; trabado: boolean },
        enabled: esAdmin,
    });

    const poner = useMutation({
        mutationFn: async (pin: string | null) =>
            pin === null
                ? api.delete(`/users/${encodeURIComponent(userId)}/pin`)
                : api.put(`/users/${encodeURIComponent(userId)}/pin`, { pin }),
        onSuccess: (_r, pin) => {
            toast.success(pin === null ? 'PIN reseteado: la próxima vez creará uno nuevo.' : 'PIN cambiado.');
            setCambiando(false);
            setNuevo('');
            void cola.invalidateQueries({ queryKey: clave });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo cambiar el PIN.')),
    });

    if (!esAdmin) return null;

    return (
        <div className="mt-2 border-t border-gray-100 pt-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">PIN de la app</span>
            {isLoading ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Consultando…
                </p>
            ) : (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm text-gray-800">
                        <KeyRound className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                        {data?.trabado ? 'Trabado tras 10 intentos' : data?.tienePin ? 'Tiene PIN' : 'Sin PIN'}
                        <span className="text-xs text-gray-600">(solo para teléfonos sin bloqueo de pantalla)</span>
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setCambiando((v) => !v)}
                            className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800"
                        >
                            Cambiar
                        </button>
                        {(data?.tienePin || data?.trabado) && (
                            <button
                                type="button"
                                disabled={poner.isPending}
                                onClick={async () => {
                                    const si = await confirmar({
                                        title: '¿Resetear el PIN de la app?',
                                        description: 'La próxima vez que la app se lo pida, creará uno nuevo. Queda anotado y se le avisa.',
                                    });
                                    if (si) poner.mutate(null);
                                }}
                                className="min-h-[44px] rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 disabled:opacity-60"
                            >
                                Resetear
                            </button>
                        )}
                    </div>
                </div>
            )}
            {cambiando && (
                <form
                    className="mt-3 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (/^\d{4}$/.test(nuevo)) poner.mutate(nuevo);
                    }}
                >
                    <label className="text-sm text-gray-700" htmlFor={`pin-${userId}`}>
                        PIN nuevo (4 números)
                    </label>
                    <input
                        id={`pin-${userId}`}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        value={nuevo}
                        onChange={(e) => setNuevo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="min-h-[44px] w-24 rounded-lg border border-gray-300 px-3 text-center text-base tracking-[0.4em]"
                    />
                    <button
                        type="submit"
                        disabled={!/^\d{4}$/.test(nuevo) || poner.isPending}
                        className="min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        Guardar
                    </button>
                </form>
            )}
        </div>
    );
}

export default PinDeLaAppDelUsuario;
