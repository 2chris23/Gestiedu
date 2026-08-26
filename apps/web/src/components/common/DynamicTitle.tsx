'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';

export function DynamicTitle() {
    const pathname = usePathname();
    const isSuperAdmin = pathname?.startsWith('/superadmin');

    // No cargar config si estamos en SuperAdmin
    const { data: config, isLoading } = useInstituteConfig({ enabled: !isSuperAdmin });

    useEffect(() => {
        // Actualizar el título inmediatamente cuando los datos estén disponibles o cambie la ruta
        if (config?.name) {
            document.title = config.name;
        } else if (!isLoading && !config?.name) {
            // Si no hay datos y no está cargando, usar título predeterminado
            document.title = 'Sistema de Gestión Escolar';
        }
    }, [config?.name, isLoading, pathname]); // pathname como dependencia para actualizar en cada navegación

    return null; // Este componente no renderiza nada;
}
