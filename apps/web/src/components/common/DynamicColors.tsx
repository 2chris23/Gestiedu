'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';

// Función para convertir hex a HSL
function hexToHSL(hex: string): string {
    // Remover el # si existe
    hex = hex.replace('#', '');

    // Convertir hex a RGB
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    return `${h} ${s}% ${l}%`;
}

export function DynamicColors() {
    const pathname = usePathname();
    const isSuperAdmin = pathname?.startsWith('/superadmin');

    // No cargar config si estamos en SuperAdmin
    const { data: config } = useInstituteConfig({ enabled: !isSuperAdmin });

    useEffect(() => {
        if (config?.primaryColor || config?.secondaryColor) {
            const root = document.documentElement;

            if (config.primaryColor) {
                const hsl = hexToHSL(config.primaryColor);
                root.style.setProperty('--primary', hsl);
            }

            if (config.secondaryColor) {
                const hsl = hexToHSL(config.secondaryColor);
                root.style.setProperty('--secondary', hsl);
            }
        }
    }, [config?.primaryColor, config?.secondaryColor]);

    return null;
}
