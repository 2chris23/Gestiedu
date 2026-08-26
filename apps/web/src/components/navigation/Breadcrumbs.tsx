'use client';

import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

export function Breadcrumbs() {
    const pathname = usePathname();
    const segments = pathname.split('/').filter(Boolean);

    // Map segments to readable names
    const segmentNameMap: Record<string, string> = {
        'dashboard': 'Inicio',
        'academico': 'Académico',
        'secciones': 'Secciones',
        'materias': 'Materias',
    };

    // Generate links
    const breadcrumbs = segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;

        // Format name: Use map or capitalize/clean ID
        let name = segmentNameMap[segment] || segment;

        // Basic cleanup for IDs if not mapped (optional, logic can be improved with real data)
        if (!segmentNameMap[segment]) {
            name = decodeURIComponent(name).replace(/-/g, ' ');
            // If it looks like a year cycle (2025-2026), keep it
            // If it looks like an ID, maybe shorten it or keep as is for now
        }

        return { name, href, isLast };
    });

    // Don't render on root or if empty
    if (breadcrumbs.length <= 1) return null;

    return (
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center text-sm text-gray-500 overflow-x-auto whitespace-nowrap pb-2">
            <Link href="/dashboard" className="flex items-center hover:text-indigo-600 transition-colors">
                <Home className="w-4 h-4" />
            </Link>

            {breadcrumbs.slice(1).map((crumb, index) => (
                <Fragment key={crumb.href}>
                    <ChevronRight className="w-4 h-4 mx-2 text-gray-400 flex-shrink-0" />
                    {crumb.isLast ? (
                        <span className="font-semibold text-gray-900 capitalize" aria-current="page">
                            {crumb.name}
                        </span>
                    ) : (
                        <Link
                            href={crumb.href}
                            className="hover:text-indigo-600 transition-colors capitalize"
                        >
                            {crumb.name}
                        </Link>
                    )}
                </Fragment>
            ))}
        </nav>
    );
}
