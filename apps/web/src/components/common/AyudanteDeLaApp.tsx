'use client';

import { useEffect } from 'react';

/**
 * REGISTRAR EL AYUDANTE (SERVICE WORKER)
 *
 * Es lo que le falta al navegador para ofrecer «instalar aplicación»: la ficha
 * y los iconos ya están, pero sin un ayudante registrado el botón no aparece.
 *
 * El nuestro no guarda copias de nada (ver `public/sw.js`): solo enseña una
 * pantalla decente cuando no hay señal. Por eso registrarlo no puede dejar a
 * nadie viendo datos viejos.
 *
 * En desarrollo NO se registra. Un ayudante vivo en `localhost` se queda entre
 * el navegador y el servidor de desarrollo y convierte cualquier recarga en una
 * cacería de fantasmas.
 */
export function AyudanteDeLaApp() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

        const registrar = () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
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
