'use client';

import { useEffect } from 'react';

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

    return null;
}

export default AyudanteDeLaApp;
