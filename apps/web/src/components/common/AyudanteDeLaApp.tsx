'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { guardarEstasPaginas } from '@/lib/paginas-guardadas';

/**
 * REGISTRAR EL AYUDANTE (SERVICE WORKER)
 *
 * Es lo que le falta al navegador para ofrecer «instalar aplicación»: la ficha
 * y los iconos ya están, pero sin un ayudante registrado el botón no aparece.
 *
 * Y guarda la cáscara de la app (nunca datos: ver `public/sw.js`), que es lo
 * que hace que la app ABRA sin conexión y enseñe lo último descargado.
 *
 * En desarrollo también se registra, en modo «la red primero» (`?modo=
 * desarrollo`): con el servidor encendido nunca sirve código viejo, y con el
 * servidor apagado la app sigue abriendo. Sin esto, probar en el teléfono y
 * apagar el PC dejaba el teléfono sin nada.
 */
export function AyudanteDeLaApp() {
    const pathname = usePathname();

    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        const url = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?modo=desarrollo';

        const registrar = () => {
            navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' }).catch(() => {
                // Sin ayudante la app funciona igual; solo no se podrá instalar.
            });
        };

        // Después de que la pantalla termine de cargar: registrarlo antes le
        // quita ancho de banda a lo que el usuario está esperando.
        if (document.readyState === 'complete') registrar();
        else window.addEventListener('load', registrar, { once: true });

        return () => window.removeEventListener('load', registrar);
    }, []);

    /**
     * CADA PANTALLA QUE SE ABRE, GUARDADA ENTERA
     *
     * Dentro de la app se navega sin recargar, y así la página nunca pasaba
     * por el ayudante: sin conexión solo se podía volver a lo que se hubiera
     * abierto recargando. Se le avisa de cada pantalla (y del panel, que es
     * por donde entra la app sin conexión) cuando esta ya terminó de cargar,
     * para no quitarle ancho de banda.
     */
    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        const direcciones = [window.location.href];
        if (pathname.startsWith('/dashboard')) direcciones.push('/dashboard');

        const reloj = window.setTimeout(() => guardarEstasPaginas(direcciones), 1500);
        return () => window.clearTimeout(reloj);
    }, [pathname]);

    return null;
}

export default AyudanteDeLaApp;
