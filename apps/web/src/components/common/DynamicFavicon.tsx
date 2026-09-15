'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { BACKEND_URL } from '@/config/env';

export function DynamicFavicon() {
    const pathname = usePathname();
    const isSuperAdmin = pathname?.startsWith('/superadmin');

    // No cargar config si estamos en SuperAdmin
    const { data: config } = useInstituteConfig({ enabled: !isSuperAdmin });

    useEffect(() => {
        if (config?.favicon) {
            // Si el favicon es una ruta relativa (empieza con /uploads), agregar la URL del backend
            const faviconUrl = config.favicon.startsWith('/uploads')
                ? `${BACKEND_URL}${config.favicon}`
                : config.favicon;

            const finalUrl = `${faviconUrl}?v=${encodeURIComponent(config.updatedAt || '1')}`;

            // Remover iconos previos para evitar que el navegador mantenga el icono por defecto
            const existingLinks = document.querySelectorAll("link[rel*='icon']");
            existingLinks.forEach(el => el.remove());

            // Crear y añadir nuevo link rel="icon"
            const iconLink = document.createElement('link');
            iconLink.rel = 'icon';
            iconLink.type = faviconUrl.endsWith('.ico') ? 'image/x-icon' : 'image/png';
            iconLink.href = finalUrl;
            document.head.appendChild(iconLink);

            // Crear y añadir link rel="shortcut icon" (para compatibilidad máxima)
            const shortcutLink = document.createElement('link');
            shortcutLink.rel = 'shortcut icon';
            shortcutLink.type = iconLink.type;
            shortcutLink.href = finalUrl;
            document.head.appendChild(shortcutLink);
        }
    }, [config?.favicon, config?.updatedAt]);

    return null; // Este componente no renderiza nada
}
