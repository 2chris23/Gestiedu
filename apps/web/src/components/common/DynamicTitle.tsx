'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';

export function DynamicTitle() {
    const pathname = usePathname();
    const isRoot = pathname === '/';
    const isSuperAdmin = pathname?.startsWith('/superadmin');
    const isLogin = pathname === '/login';

    const { data: config } = useInstituteConfig({ enabled: !isSuperAdmin && !isRoot && !isLogin });

    useEffect(() => {
        if (isRoot) {
            document.title = 'GestiEdu | Sistema de Gestión Escolar para Liceos';
            return;
        }

        if (isSuperAdmin) {
            document.title = 'SuperAdmin | GestiEdu Plataforma';
            return;
        }

        if (config?.name) {
            document.title = config.name;
            // El iPhone no lee la ficha (manifest): el nombre con el que se
            // instala en la pantalla de inicio sale de esta etiqueta, y decía
            // «GestiEdu» para todos los liceos. Se lee al pulsar «Añadir a
            // inicio», así que basta con cambiarla aquí.
            document
                .querySelector<HTMLMetaElement>("meta[name='apple-mobile-web-app-title']")
                ?.setAttribute('content', config.name);
        } else {
            document.title = 'GestiEdu | Sistema de Gestión Escolar';
        }
    }, [config?.name, pathname, isRoot, isSuperAdmin]);

    return null;
}
