'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { apuntarParaGuardar, nombreDeLaPantalla } from '@/lib/pantallas-sin-guardar';

/**
 * «ESA PANTALLA AÚN NO ESTÁ GUARDADA»: un aviso pequeño, y se sigue donde se
 * estaba. Lo pide el ayudante con `?sin-guardar=<ruta>` cuando, sin conexión,
 * se toca algo que el teléfono todavía no tiene (ver `sw.js`,
 * `volverADondeEstaba`). Antes salía una pantalla entera de «No hay conexión».
 */
export function AvisoDePantallaSinGuardar() {
    const pathname = usePathname();

    useEffect(() => {
        const url = new URL(window.location.href);
        const cual = url.searchParams.get('sin-guardar');
        if (!cual) return;
        url.searchParams.delete('sin-guardar');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        apuntarParaGuardar(cual);
        toast(`${nombreDeLaPantalla(cual)} aún no está guardada en este teléfono. Se guardará sola cuando vuelva la conexión.`, {
            id: 'sin-guardar',
            duration: 5000,
        });
    }, [pathname]);

    return null;
}

export default AvisoDePantallaSinGuardar;
