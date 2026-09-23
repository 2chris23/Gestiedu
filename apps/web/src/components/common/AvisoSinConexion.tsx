'use client';

import * as React from 'react';
import { CloudOff } from 'lucide-react';
import { useConexion, cuandoFue } from '@/hooks/useConexion';

/**
 * «ESTÁS VIENDO LO DE ANTES»
 *
 * Sin conexión la app sigue enseñando lo último que se descargó, y eso solo es
 * útil si se dice. Una nota de ayer sin avisar es peor que una pantalla vacía:
 * el profesor cree que la de hoy no se guardó y la vuelve a poner.
 *
 * Sale igual si el teléfono no tiene red que si la tiene y el servidor del
 * liceo no contesta (apagado, reiniciándose): antes solo miraba lo primero, y
 * con el servidor apagado la app decía que todo iba bien mientras no cargaba
 * nada. Dice desde cuándo es lo que se ve, y desaparece solo en cuanto vuelve
 * la conexión.
 */
export function AvisoSinConexion() {
    const { hayConexion, motivo, ultimaRespuesta } = useConexion();
    if (hayConexion) return null;

    const desde = cuandoFue(ultimaRespuesta);
    const titulo = motivo === 'sin-internet' ? 'Sin internet.' : 'Sin conexión con el liceo.';

    return (
        <div
            role="status"
            aria-live="polite"
            data-aviso="sin-conexion"
            className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900"
        >
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-xs leading-snug">
                <span className="font-semibold">{titulo}</span> Estás viendo lo último que se descargó
                {desde ? ` (${desde})` : ''}. Para guardar o cambiar algo hace falta conexión.
            </p>
        </div>
    );
}

export default AvisoSinConexion;
