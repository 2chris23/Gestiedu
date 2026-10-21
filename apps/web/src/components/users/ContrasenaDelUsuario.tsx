'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Eye, EyeOff, Lock, Wand2 } from 'lucide-react';
import api from '@/lib/axios';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LA CONTRASEÑA DE ESTA PERSONA (solo el admin)
 *
 * Cristian: «cambiarle la contraseña a los usuarios por si alguien la
 * pierde, pero solo el admin». Se escribe una nueva (o se genera una fácil
 * de dictar), y al guardarla se cierran todas sus sesiones y la huella de sus
 * teléfonos deja de valer (`PUT /users/:id/contrasena`). Después se enseña
 * para copiarla y dársela; en «Mi cuenta» la cambia por una suya.
 *
 * La suya, el admin la cambia en «Mi cuenta» (con la actual): aquí no sale.
 */

/** Sin letras que se confunden al dictarlas (0/O, 1/l/I). */
const LETRAS = 'abcdefghjkmnpqrstuvwxyz';
const NUMEROS = '23456789';

export function generarContrasena(): string {
    const azar = (n: number) => {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] % n;
    };
    const parte = (fuente: string, largo: number) => Array.from({ length: largo }, () => fuente[azar(fuente.length)]).join('');
    // «Sol-Mesa-4827»: se dicta por teléfono sin deletrear.
    const palabra = () => {
        const p = parte(LETRAS, 4);
        return p[0].toUpperCase() + p.slice(1);
    };
    return `${palabra()}-${palabra()}-${parte(NUMEROS, 4)}`;
}

export function ContrasenaDelUsuario({ userId, nombre }: { userId: string; nombre?: string }) {
    const { yo } = useQuienSoy();
    const [abierto, setAbierto] = React.useState(false);
    const [nueva, setNueva] = React.useState('');
    const [verla, setVerla] = React.useState(false);
    const [puesta, setPuesta] = React.useState<string | null>(null);
    const [copiada, setCopiada] = React.useState(false);

    const guardar = useMutation({
        mutationFn: async (contrasena: string) => (await api.put(`/users/${encodeURIComponent(userId)}/contrasena`, { contrasena })).data,
        onSuccess: (_r, contrasena) => {
            toast.success('Contraseña cambiada. Se cerraron sus sesiones.');
            setPuesta(contrasena);
            setAbierto(false);
            setNueva('');
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo cambiar la contraseña.')),
    });

    if (yo?.role !== 'ADMIN' || yo.id === userId) return null;

    const valida = nueva.trim().length >= 8;

    return (
        <div className="mt-2 border-t border-gray-100 pt-4" data-contrasena-del-usuario>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Contraseña</span>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-gray-800">
                    <Lock className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    Si la perdió, ponle una nueva
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setAbierto((v) => !v);
                        setPuesta(null);
                    }}
                    aria-expanded={abierto}
                    className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800"
                >
                    Cambiar contraseña
                </button>
            </div>

            {abierto && (
                <form
                    className="mt-3 space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (valida) guardar.mutate(nueva.trim());
                    }}
                >
                    <label className="block text-sm text-gray-700" htmlFor={`contrasena-${userId}`}>
                        Contraseña nueva{nombre ? ` de ${nombre}` : ''} (8 o más caracteres)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <input
                                id={`contrasena-${userId}`}
                                type={verla ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={nueva}
                                onChange={(e) => setNueva(e.target.value)}
                                maxLength={100}
                                className="min-h-[44px] w-full rounded-lg border border-gray-300 pl-3 pr-12 text-base"
                            />
                            <button
                                type="button"
                                onClick={() => setVerla((v) => !v)}
                                aria-label={verla ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-gray-500"
                            >
                                {verla ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setNueva(generarContrasena());
                                setVerla(true);
                            }}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800"
                        >
                            <Wand2 className="h-4 w-4" aria-hidden /> Generar una
                        </button>
                        <button
                            type="submit"
                            disabled={!valida || guardar.isPending}
                            className="min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {guardar.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-600">Al guardarla se cierran todas sus sesiones abiertas. Le llega un aviso.</p>
                </form>
            )}

            {puesta && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3" role="status">
                    <p className="text-sm font-semibold text-emerald-900">Dásela para que entre; luego puede cambiarla en «Mi cuenta»:</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded-lg bg-white px-3 py-2 font-mono text-base text-gray-900 ring-1 ring-emerald-200">{puesta}</code>
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(puesta);
                                    setCopiada(true);
                                    window.setTimeout(() => setCopiada(false), 2000);
                                } catch {
                                    toast.error('No se pudo copiar: anótala.');
                                }
                            }}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800"
                        >
                            {copiada ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                            {copiada ? 'Copiada' : 'Copiar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPuesta(null)}
                            className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-emerald-800"
                        >
                            Listo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ContrasenaDelUsuario;
