'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import {
    Home,
    Users,
    BookOpen,
    Library,
    Settings,
    LogOut,
    Menu,
    X,
    GraduationCap,
    Calendar
} from 'lucide-react';
import { clsx } from 'clsx';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { BACKEND_URL } from '@/config/env';
import Image from 'next/image';

interface DashboardUser {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    email: string;
    institute: {
        id: string;
        name: string;
        code: string;
    };
}

interface DashboardShellProps {
    user: DashboardUser;
    children: React.ReactNode;
}

export default function DashboardShell({ user, children }: DashboardShellProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { logout: zustandLogout } = useAuthStore();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const { data: instituteConfig } = useInstituteConfig();

    const handleLogout = async () => {
        // Clear cookies via API route
        await fetch('/api/auth/logout', { method: 'POST' });
        // Clear Zustand UI state
        zustandLogout();
        router.push('/login');
    };

    // IMPORTANTE: los roles deben coincidir con el enum UserRole del backend
    // (ADMIN | TEACHER | STUDENT | TUTOR). Usar valores en español aquí rompe
    // el filtro del menú para profesores y estudiantes.
    const navItems = [
        { name: 'Inicio', href: '/dashboard', icon: Home, roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] },
        { name: 'Académico', href: '/dashboard/academico', icon: BookOpen, roles: ['ADMIN', 'TEACHER'] },
        { name: 'Materias', href: '/dashboard/materias', icon: Library, roles: ['ADMIN', 'TEACHER'] },
        { name: 'Horarios', href: '/dashboard/horarios', icon: Calendar, roles: ['ADMIN', 'TEACHER'] },
        { name: 'Usuarios', href: '/dashboard/usuarios', icon: Users, roles: ['ADMIN'] },
        { name: 'Configuración', href: '/dashboard/configuracion', icon: Settings, roles: ['ADMIN'] },
    ];

    const ROLE_LABELS: Record<string, string> = {
        ADMIN: 'Administrador',
        TEACHER: 'Profesor',
        STUDENT: 'Estudiante',
        TUTOR: 'Tutor',
    };

    const getDisplayName = (firstName: string, lastName: string) => {
        const firstNamePart = firstName?.split(' ')[0] || '';
        const lastNamePart = lastName?.split(' ')[0] || '';
        return { firstName: firstNamePart, lastName: lastNamePart };
    };

    const displayName = getDisplayName(user.firstName, user.lastName);

    const filteredNavItems = navItems.filter(item =>
        !user?.role || item.roles.includes(user.role)
    );

    return (
        <div className="min-h-screen bg-gray-100" suppressHydrationWarning={true}>
            {/* Mobile Header */}
            <div className="lg:hidden bg-white shadow-sm p-4 flex justify-between items-center">
                <span className="font-bold text-lg text-primary-600">Gestión Escolar</span>
                <button onClick={() => setSidebarOpen(!isSidebarOpen)}>
                    {isSidebarOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Sidebar */}
            <aside
                className={clsx(
                    "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 ease-in-out lg:translate-x-0",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="h-full flex flex-col">
                    {/* Logo / User Info */}
                    <div className="p-6 border-b">
                        {instituteConfig?.logo && instituteConfig.logo.startsWith('/') ? (
                            <div className="mb-4 flex items-center justify-center">
                                <Image
                                    src={instituteConfig.logo.startsWith('/uploads')
                                        ? `${BACKEND_URL}${instituteConfig.logo}`
                                        : instituteConfig.logo}
                                    alt="Logo del Instituto"
                                    width={120}
                                    height={120}
                                    className="object-contain"
                                />
                            </div>
                        ) : (
                            <div className="mb-4 flex items-center justify-center">
                                <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center">
                                    <GraduationCap className="w-12 h-12 text-indigo-600" />
                                </div>
                            </div>
                        )}
                        <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                                {displayName.firstName?.[0]}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900">{displayName.firstName} {displayName.lastName}</p>
                                <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role] ?? user?.role}</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {filteredNavItems.map((item) => {
                            const isActive = item.href === '/dashboard'
                                ? pathname === '/dashboard'
                                : pathname.startsWith(item.href);
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={clsx(
                                        "flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors",
                                        isActive
                                            ? "bg-primary-900 text-white"
                                            : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                    )}
                                >
                                    <Icon className={clsx("mr-3 h-5 w-5", isActive ? "text-white" : "text-gray-400")} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Footer Actions */}
                    <div className="p-4 border-t">
                        <button
                            onClick={handleLogout}
                            className="flex w-full items-center px-4 py-3 text-sm font-medium text-red-600 rounded-md hover:bg-red-50 transition-colors"
                        >
                            <LogOut className="mr-3 h-5 w-5" />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={clsx(
                "lg:ml-64 min-h-screen transition-all duration-200",
                "lg:pl-0"
            )}>
                <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                    <div className="lg:absolute lg:top-0 lg:left-64 lg:right-0">
                    </div>
                    {children}
                </div>
            </main>

            {/* Overlay for mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSidebarOpen(false); } }}
                />
            )}
        </div>
    );
}
