'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UtensilsCrossed } from 'lucide-react';
import { Ajustes, BotonGuardar, CargandoAjustes, FilaInterruptor, Grupo } from '@/components/configuracion/ajustes';
import { COMIDAS, usePaeActivo, useGuardarConfigDelComedor } from '@/hooks/usePae';
import { getApiErrorMessage } from '@/lib/utils';

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

    if (isLoading) return <CargandoAjustes />;

    // En el orden de siempre (desayuno, almuerzo, merienda, cena).
    const alternar = (c: string) => setComidas((xs) => Object.keys(COMIDAS).filter((k) => (k === c ? !xs.includes(c) : xs.includes(k))));

    return (
        <Ajustes>
            <Grupo
                id="comedor"
                descripcion="Las raciones que llegan y las que se sirven cada día, el menú y el resumen del mes para imprimir. Solo lo anota el administrador."
            >
                <FilaInterruptor
                    icono={UtensilsCrossed}
                    titulo="Usar el comedor"
                    descripcion="Apagado, no aparece en el menú."
                    checked={activo}
                    onChange={setActivo}
                    comoInterruptor
                />
            </Grupo>

            <fieldset disabled={!activo} className="min-w-0 disabled:opacity-60">
                <Grupo id="comidas" titulo="Comidas que da el liceo">
                    {Object.entries(COMIDAS).map(([clave, nombre]) => (
                        <FilaInterruptor key={clave} titulo={nombre} checked={comidas.includes(clave)} onChange={() => alternar(clave)} disabled={!activo} />
                    ))}
                </Grupo>
            </fieldset>

            <BotonGuardar
                type="button"
                texto="Guardar"
                guardando={guardar.isPending}
                disabled={comidas.length === 0}
                onClick={() =>
                    guardar.mutate(
                        { enabled: activo, comidas },
                        {
                            onSuccess: () => toast.success(activo ? 'Comedor activado' : 'Comedor guardado (apagado)'),
                            onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el comedor')),
                        }
                    )
                }
            />
        </Ajustes>
    );
}
