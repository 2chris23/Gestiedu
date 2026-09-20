'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { BACKEND_URL } from '@/config/env';

function restoreDefaultFavicon() {
    const existingLinks = document.querySelectorAll("link[rel*='icon']");
    existingLinks.forEach(el => el.remove());

    const iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/x-icon';
    iconLink.href = '/favicon.ico';
    document.head.appendChild(iconLink);
}

export function DynamicFavicon() {
    const pathname = usePathname();
    const isRootOrGlobal = pathname === '/' || pathname?.startsWith('/superadmin') || pathname === '/login';

    const { data: config } = useInstituteConfig({ enabled: !isRootOrGlobal });

    useEffect(() => {
        if (isRootOrGlobal || !config?.favicon) {
            restoreDefaultFavicon();
            return;
        }

        if (config?.favicon) {
            const faviconUrl = config.favicon.startsWith('/uploads')
                ? `${BACKEND_URL}${config.favicon}`
                : config.favicon;

            const finalUrl = `${faviconUrl}?v=${encodeURIComponent(config.updatedAt || '1')}`;

            const existingLinks = document.querySelectorAll("link[rel*='icon']");
            existingLinks.forEach(el => el.remove());

            const iconLink = document.createElement('link');
            iconLink.rel = 'icon';
            iconLink.type = faviconUrl.endsWith('.ico') ? 'image/x-icon' : 'image/png';
            iconLink.href = finalUrl;
            document.head.appendChild(iconLink);

            const shortcutLink = document.createElement('link');
            shortcutLink.rel = 'shortcut icon';
            shortcutLink.type = iconLink.type;
            shortcutLink.href = finalUrl;
            document.head.appendChild(shortcutLink);
        }

        return () => {
            restoreDefaultFavicon();
        };
    }, [config?.favicon, config?.updatedAt, isRootOrGlobal]);

    return null;
}
