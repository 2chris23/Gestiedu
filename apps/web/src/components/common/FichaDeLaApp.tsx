'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * QUE LA FICHA SEA LA DEL LICEO QUE SE ESTÁ MIRANDO
 *
 * El enlace del documento apunta a `/manifest.webmanifest` a secas, y el
 * servidor saca el liceo de la cookie o del subdominio. Eso vale una vez
 * dentro, pero NO en la pantalla de entrar del portal, que es justo donde la
 * gente instala la app: allí el liceo está en la dirección (`?slug=`) y todavía
 * no hay cookie. Sin esto, quien instalara desde ahí se llevaría el icono y el
 * nombre de la plataforma en vez de los de su liceo.
 */
export function FichaDeLaApp() {
    const pathname = usePathname();
    const params = useSearchParams();

    useEffect(() => {
        const enLaDireccion = params.get('slug');
        const enLaRuta = pathname?.match(/^\/instituto\/([^/]+)/)?.[1];
        const liceo = enLaDireccion || enLaRuta;
        if (!liceo) return;

        const enlace = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
        if (!enlace) return;

        const queria = `/manifest.webmanifest?liceo=${encodeURIComponent(liceo)}`;
        if (enlace.getAttribute('href') === queria) return;
        enlace.setAttribute('href', queria);
    }, [pathname, params]);

    return null;
}

export default FichaDeLaApp;
