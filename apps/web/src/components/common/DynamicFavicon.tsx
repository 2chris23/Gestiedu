'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { BACKEND_URL } from '@/config/env';

/**
 * EL ICONITO DE LA PESTAÑA, EL DEL LICEO
 *
 * OJO CON UNA COSA, QUE COSTÓ UNA PANTALLA CONGELADA
 *
 * Esto quitaba del documento TODOS los enlaces de icono:
 *
 *     document.querySelectorAll("link[rel*='icon']").forEach(el => el.remove());
 *
 * Entre ellos, los que pone React (los que declara `metadata.icons` en
 * `app/layout.tsx`). Cuando React iba luego a actualizar uno de esos nodos, ya
 * no estaba, y reventaba con «Cannot read properties of null (reading
 * 'removeChild')». Reventar ahí no se ve como un error: se ve como que **la
 * pantalla se queda pegada**. Al entrar, la dirección cambiaba a `/dashboard` y
 * se seguía viendo el formulario de entrar hasta recargar a mano (AUTH-01).
 *
 * Regla: aquí solo se toca lo que se ha creado aquí, y por eso los enlaces
 * propios van marcados. Lo que puso React se queda donde está; el del liceo se
 * añade DESPUÉS, y de varios iconos válidos el navegador se queda con el
 * último.
 */

/** La marca de los enlaces que pone esta pantalla, para no tocar los demás. */
const MARCA = 'data-icono-del-liceo';

function quitarLosNuestros() {
    document.querySelectorAll(`link[${MARCA}]`).forEach((el) => el.remove());
}

export function DynamicFavicon() {
    const pathname = usePathname();
    const isRootOrGlobal = pathname === '/' || pathname?.startsWith('/superadmin') || pathname === '/login';

    const { data: config } = useInstituteConfig({ enabled: !isRootOrGlobal });

    useEffect(() => {
        // Fuera del liceo (portada, superadmin) vale el icono de la plataforma,
        // que ya está puesto: basta con retirar el del liceo si quedaba.
        if (isRootOrGlobal || !config?.favicon) {
            quitarLosNuestros();
            return;
        }

        const faviconUrl = config.favicon.startsWith('/uploads')
            ? `${BACKEND_URL}${config.favicon}`
            : config.favicon;

        const finalUrl = `${faviconUrl}?v=${encodeURIComponent(config.updatedAt || '1')}`;
        const tipo = faviconUrl.endsWith('.ico') ? 'image/x-icon' : 'image/png';

        quitarLosNuestros();

        for (const rel of ['icon', 'shortcut icon']) {
            const enlace = document.createElement('link');
            enlace.rel = rel;
            enlace.type = tipo;
            enlace.href = finalUrl;
            enlace.setAttribute(MARCA, '');
            document.head.appendChild(enlace);
        }

        return quitarLosNuestros;
    }, [config?.favicon, config?.updatedAt, isRootOrGlobal]);

    return null;
}
