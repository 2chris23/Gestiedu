'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSuperAdminAuthStore } from '@/store/superadmin-auth.store';
import Link from 'next/link';

interface SuperAdminLayoutProps {
    children: ReactNode;
}

export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { superAdmin, setSuperAdmin, logout } = useSuperAdminAuthStore();

    const isLoginPage = pathname === '/superadmin/login';

    useEffect(() => {
        // En la página de login no necesitamos verificar auth
        if (isLoginPage) return;

        // Si ya tenemos el superAdmin en el store (persist), no hacer fetch innecesario
        if (superAdmin) return;

        // Verificar si existe en localStorage
        try {
            const stored = typeof window !== 'undefined' ? localStorage.getItem('superadmin-auth') : null;
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.state?.superAdmin) {
                    setSuperAdmin(parsed.state.superAdmin);
                    return;
                }
            }
        } catch {}

        // Cargar datos del superadmin desde la cookie del servidor
        fetch('/api/superadmin/auth/me')
            .then((res) => {
                if (res.ok) return res.json();
                if (res.status === 401) {
                    const hasCookie = typeof document !== 'undefined' && document.cookie.includes('superadmin_access_token');
                    if (!hasCookie) {
                        logout();
                        router.push('/superadmin/login');
                    }
                }
                return null;
            })
            .then((data) => {
                if (data) setSuperAdmin(data);
            })
            .catch(() => {});
    }, [superAdmin, setSuperAdmin, router, logout, isLoginPage]);

    const handleLogout = async () => {
        try {
            await fetch('/api/superadmin/auth/logout', { method: 'POST' });
        } catch {
            // ignorar error de red al hacer logout
        } finally {
            logout();
            router.push('/superadmin/login');
        }
    };

    // En la página de login: renderizar solo el contenido sin el layout
    if (isLoginPage) {
        return <>{children}</>;
    }

    const navItems = [
        { href: '/superadmin/dashboard', label: 'Dashboard', icon: '📊' },
        { href: '/superadmin/institutes', label: 'Institutos', icon: '🏫' },
        { href: '/superadmin/plans', label: 'Planes y Tarifas', icon: '💎' },
        { href: '/superadmin/metrics', label: 'Métricas de Caché', icon: '⚡' },
    ];

    return (
        <div className="min-h-screen bg-gray-900">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 h-full w-64 bg-gray-800 border-r border-gray-700">
                <div className="p-6">
                    <div className="flex items-center space-x-3 mb-8">
                        <div className="p-2 bg-violet-600 rounded-lg">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">SuperAdmin</h1>
                            <p className="text-xs text-gray-400">Panel de Control</p>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="space-y-2">
                        {navItems.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                                        isActive
                                            ? 'bg-violet-600 text-white'
                                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`}
                                >
                                    <span>{item.icon}</span>
                                    <span className="font-medium">{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* User Info + Logout */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                {superAdmin?.name?.charAt(0) || 'S'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{superAdmin?.name || 'SuperAdmin'}</p>
                                <p className="text-xs text-gray-400 truncate">{superAdmin?.email || ''}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                            title="Cerrar sesión"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="ml-64 min-h-screen">
                {children}
            </main>
        </div>
    );
}
