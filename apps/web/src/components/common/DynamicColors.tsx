'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';

function hexToHSL(hex: string): string {
    hex = hex.replace('#', '');
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
    const isRoot = pathname === '/';
    const isSuperAdmin = pathname?.startsWith('/superadmin');

    const { data: config } = useInstituteConfig({ enabled: !isSuperAdmin && !isRoot });

    useEffect(() => {
        const root = document.documentElement;

        if (isRoot || isSuperAdmin || (!config?.primaryColor && !config?.secondaryColor)) {
            root.style.removeProperty('--primary');
            root.style.removeProperty('--secondary');
            return;
        }

        if (config?.primaryColor) {
            root.style.setProperty('--primary', hexToHSL(config.primaryColor));
        }
        if (config?.secondaryColor) {
            root.style.setProperty('--secondary', hexToHSL(config.secondaryColor));
        }

        return () => {
            root.style.removeProperty('--primary');
            root.style.removeProperty('--secondary');
        };
    }, [config?.primaryColor, config?.secondaryColor, isRoot, isSuperAdmin]);

    return null;
}
