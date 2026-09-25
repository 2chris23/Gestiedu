'use client';

import * as React from 'react';
import { CloudOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useConexion, cuandoFue } from '@/hooks/useConexion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * «ESTÁS VIENDO LO DE ANTES», EN UN ICONO QUE LATE
 *
 * Sin conexión la app sigue enseñando lo último que se descargó, y eso solo es
 * útil si se dice. Una nota de ayer sin avisar es peor que una pantalla vacía:
 * el profesor cree que la de hoy no se guardó y la vuelve a poner.
 *
 * Se decía con una franja amarilla de tres líneas debajo de la cabecera, que
 * en un teléfono se comía un trozo de cada pantalla todo el rato que durara
 * el corte (y un corte de luz dura horas). Ahora es un icono pequeño arriba a
 * la derecha, que late: quien lo ve sabe que algo pasa, y al tocarlo se
 * explica. Los primeros segundos lleva escrito «Sin conexión», para que la
 * primera vez no sea un jeroglífico; luego se queda solo el icono.
 *
 * Todo el texto sigue ahí para quien usa un lector de pantalla (`role=status`).
 */

/** Lo que dura escrito «Sin conexión» al irse la conexión, antes de quedarse en icono. */
const CON_TEXTO_MS = 5000;

export function AvisoSinConexion() {
    const { hayConexion, motivo, ultimaRespuesta } = useConexion();
    const queryClient = useQueryClient();
    const [conTexto, setConTexto] = React.useState(false);

    React.useEffect(() => {
        if (hayConexion) return;
        setConTexto(true);
        const reloj = window.setTimeout(() => setConTexto(false), CON_TEXTO_MS);
        return () => window.clearTimeout(reloj);
    }, [hayConexion]);

    if (hayConexion) return null;

    // Si en este dispositivo no hay nada guardado todavía (la primera vez, o
    // tras cerrar sesión), decir «estás viendo lo de antes» sería mentir: no
    // se ve nada. Se dice lo que pasa de verdad.
    const hayAlgoGuardado = queryClient
        .getQueryCache()
        .getAll()
        .some((q) => q.state.data !== undefined);

    const desde = cuandoFue(ultimaRespuesta);
    const titulo = motivo === 'sin-internet' ? 'Sin internet.' : 'Sin conexión con el liceo.';
    const explicacion = hayAlgoGuardado
        ? `Estás viendo lo último que se descargó${desde ? ` (${desde})` : ''}. Para guardar o cambiar algo hace falta conexión.`
        : 'En este dispositivo no hay nada guardado todavía: se verá en cuanto vuelva la conexión.';

    return (
        <div
            data-aviso="sin-conexion"
            className={cn(
                'fixed z-50',
                // En el teléfono, dentro de la cabecera, a la derecha (ahí no hay
                // nada). En el ordenador no hay cabecera: abajo a la derecha.
                'right-3 top-[calc(var(--zona-segura-arriba)+6px)]',
                'lateral:bottom-5 lateral:right-5 lateral:top-auto'
            )}
        >
            <p role="status" aria-live="polite" className="sr-only">
                {titulo} {explicacion}
            </p>
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${titulo} Tocar para ver qué significa`}
                        className="relative flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 shadow-sm ring-1 ring-amber-300 transition-colors active:bg-amber-100"
                    >
                        <span className="relative flex h-6 w-6 items-center justify-center" aria-hidden>
                            {/* El latido: un anillo que se agranda y se apaga. Quien
                                pidió menos movimiento en su teléfono no lo ve. */}
                            <span className="absolute inset-0 rounded-full bg-amber-400/60 motion-safe:animate-ping" />
                            <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
                                <CloudOff className="h-3.5 w-3.5 text-amber-700" />
                            </span>
                        </span>
                        <span className={cn('pr-0.5', conTexto ? 'inline' : 'hidden lateral:inline')} aria-hidden>
                            Sin conexión
                        </span>
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 rounded-2xl p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <CloudOff className="h-4 w-4 text-amber-600" aria-hidden />
                        {titulo.replace(/\.$/, '')}
                    </p>
                    <p className="mt-1.5 text-sm leading-snug text-gray-600">{explicacion}</p>
                    <p className="mt-2 text-xs text-gray-500">Se pone al día sola en cuanto vuelve la conexión.</p>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export default AvisoSinConexion;
