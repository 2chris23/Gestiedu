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
        } else {
            document.title = 'GestiEdu | Sistema de Gestión Escolar';
        }
    }, [config?.name, pathname, isRoot, isSuperAdmin]);

    return null;
}
