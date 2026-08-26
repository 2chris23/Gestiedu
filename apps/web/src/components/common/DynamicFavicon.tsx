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
            // Actualizar favicon
            let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");

            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }

            // Si el favicon es una ruta relativa (empieza con /uploads), agregar la URL del backend
            const faviconUrl = config.favicon.startsWith('/uploads')
                ? `${BACKEND_URL}${config.favicon}`
                : config.favicon;

            link.href = faviconUrl;
        }
    }, [config?.favicon]);

    return null; // Este componente no renderiza nada
}
