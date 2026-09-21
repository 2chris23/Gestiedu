'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { olvidarCredencial } from '@/lib/credencial-en-memoria';
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
    Calendar,
    CalendarDays,
    CalendarRange,
    Wallet
} from 'lucide-react';
import { clsx } from 'clsx';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { useSessionKeepAlive } from '@/hooks/useSessionKeepAlive';
import { usePagosActivos } from '@/hooks/usePagos';
import { BACKEND_URL } from '@/config/env';
import BarraInferiorMovil from '@/components/layout/BarraInferiorMovil';
import UserAvatar from '@/components/ui/UserAvatar';
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
    const { logout: zustandLogout, user: usuarioDeLaSesion } = useAuthStore();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const { data: instituteConfig } = useInstituteConfig();

    // Mantener la sesión activa de forma transparente mientras la pestaña esté abierta
    useSessionKeepAlive();

    const handleLogout = async () => {
        /**
         * SALIR DEVUELVE AL PORTAL DEL LICEO, NO A UN 404
         *
         * `/login` a secas responde «esta dirección no existe»: la pantalla de
         * entrar necesita saber de qué liceo es. Al cerrar sesión se mandaba
         * ahí, así que lo último que veía quien salía era un error, con un
         * botón a la portada de la plataforma y sin forma de volver a entrar en
         * su liceo. Se apunta el liceo ANTES de borrar las credenciales, que se
         * lo llevan por delante.
         */
        const liceo = document.cookie
            .split('; ')
            .find((c) => c.startsWith('institute_slug='))
            ?.split('=')[1];

        // Clear cookies via API route
        await fetch('/api/auth/logout', { method: 'POST' });
        // Y la llave que estaba en la memoria de la pestaña: si no, seguiría
        // sirviendo hasta que caduque aunque la sesión esté cerrada.
        olvidarCredencial();
        // Clear Zustand UI state
        zustandLogout();
        router.push(liceo ? `/login?slug=${encodeURIComponent(liceo)}` : '/login');
    };

    // IMPORTANTE: los roles deben coincidir con el enum UserRole del backend
    // (ADMIN | TEACHER | STUDENT | TUTOR). Usar valores en español aquí rompe
    // el filtro del menú para profesores y estudiantes.
    const { data: pagos } = usePagosActivos();

    const navItems = [
        { name: 'Inicio', href: '/dashboard', icon: Home, roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] },
        { name: 'Académico', href: '/dashboard/academico', icon: BookOpen, roles: ['ADMIN', 'TEACHER'] },
        { name: 'Materias', href: '/dashboard/materias', icon: Library, roles: ['ADMIN', 'TEACHER'] },
        { name: 'Horarios', href: '/dashboard/horarios', icon: Calendar, roles: ['ADMIN', 'TEACHER'] },
        { name: 'Eventos', href: '/dashboard/eventos', icon: CalendarDays, roles: ['ADMIN'] },
        // Solo aparece si el liceo activó el control de pagos (Configuración → Pagos).
        ...(pagos?.enabled ? [{ name: 'Pagos', href: '/dashboard/pagos', icon: Wallet, roles: ['ADMIN'] }] : []),
        { name: 'Usuarios', href: '/dashboard/usuarios', icon: Users, roles: ['ADMIN'] },
        // El calendario del liceo lo usan TODOS —el alumno y el representante
        // también—, pero no estaba en el menú de nadie: solo se llegaba
        // escribiendo la dirección a mano.
        { name: 'Calendario', href: '/dashboard/calendario', icon: CalendarRange, roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] },
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
        <div className="min-h-screen bg-gray-50" suppressHydrationWarning={true}>
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
                                    className="object-contain max-h-20 w-auto"
                                    unoptimized
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
                            {/* Su foto, la que le puso el liceo. */}
                            <UserAvatar
                                name={`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Usuario'}
                                src={usuarioDeLaSesion?.avatar}
                                className="h-10 w-10"
                                initialsClassName="text-sm"
                            />
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
                                    // En el teléfono el menú es una cortina: si
                                    // no se cierra al elegir, tapa la pantalla
                                    // que se acaba de abrir.
                                    onClick={() => setSidebarOpen(false)}
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

                    {/*
                        Footer Actions

                        El hueco de abajo (`pb-…`) es la altura de la barra del
                        teléfono. Sin él, «Cerrar Sesión» quedaba JUSTO DEBAJO de
                        esa barra: se veía, pero el dedo pulsaba la barra. Había
                        que girar el teléfono para poder salir de la sesión.
                    */}
                    <div className="border-t p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-4">
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
                {/* El `pb-28` de abajo es el hueco de la barra del teléfono: sin
                    él, la barra tapa el último botón de cada pantalla. */}
                <div className="max-w-7xl mx-auto py-6 px-4 pb-28 sm:px-6 lg:px-8 lg:pb-6">
                    <div className="lg:absolute lg:top-0 lg:left-64 lg:right-0">
                    </div>
                    {children}
                </div>
            </main>

            {/* La barra de abajo: donde está el pulgar. */}
            <BarraInferiorMovil
                destinos={filteredNavItems.slice(0, 4).map(({ name, href, icon }) => ({ name, href, icon }))}
                alAbrirMenu={() => setSidebarOpen((v) => !v)}
                menuAbierto={isSidebarOpen}
            />

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
