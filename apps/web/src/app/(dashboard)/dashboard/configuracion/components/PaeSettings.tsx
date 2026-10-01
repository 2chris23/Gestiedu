'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, UtensilsCrossed } from 'lucide-react';
import { COMIDAS, usePaeActivo, useGuardarConfigDelComedor } from '@/hooks/usePae';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * EL COMEDOR (PAE): SE ACTIVA O NO, COMO LOS PAGOS
 *
 * Apagado (lo normal), no sale en el menú y sus pantallas no responden.
 * Encendido: qué comidas da el liceo. Lo anota solo el admin.
 */
export function PaeSettings() {
    const { data, isLoading } = usePaeActivo(true);
    const guardar = useGuardarConfigDelComedor();
    const [activo, setActivo] = useState(false);
    const [comidas, setComidas] = useState<string[]>([]);

    useEffect(() => {
        if (data) {
            setActivo(data.enabled);
            setComidas(data.comidas);
        }
    }, [data]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
        );
    }

    // En el orden de siempre (desayuno, almuerzo, merienda, cena).
    const alternar = (c: string) => setComidas((xs) => Object.keys(COMIDAS).filter((k) => (k === c ? !xs.includes(c) : xs.includes(k))));

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3">
                <UtensilsCrossed className="mt-0.5 h-6 w-6 text-indigo-600" aria-hidden />
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Comedor (PAE)</h2>
                    <p className="text-sm text-gray-600">
                        Las raciones que llegan y las que se sirven cada día, el menú y el resumen del mes para imprimir. Solo lo anota el administrador.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                    <p className="text-sm font-medium text-gray-800">Usar el comedor</p>
                    <p className="mt-1 text-xs text-gray-600">Apagado, no aparece en el menú.</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={activo}
                    aria-label="Usar el comedor"
                    onClick={() => setActivo(!activo)}
                    className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', activo ? 'bg-indigo-600' : 'bg-gray-300')}
                >
                    <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', activo ? 'translate-x-6' : 'translate-x-1')} />
                </button>
            </div>

            <fieldset disabled={!activo} className="space-y-2 disabled:opacity-60">
                <legend className="text-sm font-medium text-gray-800">Comidas que da el liceo</legend>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(COMIDAS).map(([clave, nombre]) => (
                        <label key={clave} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm text-gray-800">
                            <input type="checkbox" checked={comidas.includes(clave)} onChange={() => alternar(clave)} className="h-5 w-5" />
                            {nombre}
                        </label>
                    ))}
                </div>
            </fieldset>

            <button
                type="button"
                disabled={guardar.isPending || comidas.length === 0}
                onClick={() =>
                    guardar.mutate(
                        { enabled: activo, comidas },
                        {
                            onSuccess: () => toast.success(activo ? 'Comedor activado' : 'Comedor guardado (apagado)'),
                            onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el comedor')),
                        }
                    )
                }
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
                <Save className="h-4 w-4" aria-hidden /> Guardar
            </button>
        </div>
    );
}
