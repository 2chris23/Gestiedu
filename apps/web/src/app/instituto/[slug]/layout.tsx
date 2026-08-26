'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Institute {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    primaryColor?: string;
}

interface NavItem {
    href: string;
    label: string;
    icon: ReactNode;
    roles: string[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

function getToken(): string {
    if (typeof document === 'undefined') return '';
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [key, ...valueParts] = cookie.trim().split('=');
        if (key === 'access_token') {
            return valueParts.join('=');
        }
    }
    return '';
}

/** Decodifica el JWT localmente (sin verificar firma) y checa si expiró */
function isTokenExpired(token: string): boolean {
    try {
        // JWT usa base64 URL-safe (- y _ en vez de + y /); atob() necesita base64 estándar
        const base64 = token.split('.')[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        // Añadir padding si falta
        const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
        const payload = JSON.parse(atob(padded));
        return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
    } catch {
        // Si no se puede decodificar, NO bloquear — dejar que el backend lo rechace si es inválido
        return false;
    }
}

/** Limpia las cookies de sesión del instituto */
function clearSession() {
    document.cookie = 'access_token=; path=/; max-age=0';
    document.cookie = 'refresh_token=; path=/; max-age=0';
    document.cookie = 'institute_slug=; path=/; max-age=0';
}

function SchoolIcon() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
    );
}

export default function InstituteLayout({ children }: { children: ReactNode; params: Promise<{ slug: string }> }) {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname();
    const slug = params.slug as string;

    const [institute, setInstitute] = useState<Institute | null>(null);
    const [userRole, setUserRole] = useState<string>('');
    const [userName, setUserName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // pathname '/' ocurre cuando el middleware hace rewrite de / → /instituto/slug/login
    const isLoginPage = pathname === '/' || pathname.includes('/login');

    useEffect(() => {
        // Fetch institute info (doesn't require auth)
        fetch(`/api/instituto/${slug}/info`, {
            headers: { 'X-Institute-Slug': slug },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) setInstitute(data);
                else setError('Instituto no encontrado');
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));

        // Fetch current user role (skip on login page)
        if (!isLoginPage) {
            const token = getToken();
            // Verificar token ANTES de hacer la llamada (evita 401 en consola)
            if (!token || isTokenExpired(token)) {
                clearSession();
                router.push('/login');
                return;
            }
            fetch(`${API_URL}/api/users/profile/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Institute-Slug': slug,
                },
            })
                .then(async r => {
                    if (r.status === 401) {
                        clearSession();
                        router.push('/login');
                        return null;
                    }
                    return r.ok ? r.json() : null;
                })
                .then(data => {
                    if (data?.user) {
                        setUserRole(data.user.role);
                        setUserName(`${data.user.firstName} ${data.user.lastName}`);
                    }
                })
                .catch(() => { });
        }
    }, [slug, isLoginPage, router]);

    const handleLogout = () => {
        document.cookie = 'access_token=; path=/; max-age=0';
        document.cookie = 'refresh_token=; path=/; max-age=0';
        document.cookie = 'institute_slug=; path=/; max-age=0';
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="flex items-center gap-3 text-gray-400">
                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    Cargando...
                </div>
            </div>
        );
    }

    if (error || !institute) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
                <div className="text-center">
                    <p className="text-6xl mb-6">🏫</p>
                    <h1 className="text-2xl font-bold text-white mb-2">{error || 'Instituto no encontrado'}</h1>
                    <p className="text-gray-400 mb-6">El instituto <strong className="text-gray-200">{slug}</strong> no está disponible.</p>
                    <Link href="/" className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors">
                        Ir al inicio
                    </Link>
                </div>
            </div>
        );
    }

    // Login page: render children directly without nav
    if (isLoginPage) {
        return <>{children}</>;
    }

    const navItems = [
        {
            href: `/instituto/${slug}/dashboard`,
            label: 'Dashboard',
            icon: '📊',
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
        },
        {
            href: `/instituto/${slug}/grades`,
            label: 'Calificaciones',
            icon: '📝',
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
        },
        {
            href: `/instituto/${slug}/attendance`,
            label: 'Asistencia',
            icon: '📋',
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
        },
        {
            href: `/instituto/${slug}/subjects`,
            label: 'Materias',
            icon: '📚',
            roles: ['ADMIN', 'TEACHER', 'STUDENT'],
        },
        {
            href: `/instituto/${slug}/students`,
            label: 'Estudiantes',
            icon: '👥',
            roles: ['ADMIN', 'TEACHER'],
        },
        {
            href: `/instituto/${slug}/profile`,
            label: 'Mi Perfil',
            icon: '👤',
            roles: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'],
        },
    ].filter(item => !userRole || item.roles.includes(userRole));

    const isActive = (href: string) => pathname === href || (href !== `/instituto/${slug}/dashboard` && pathname.startsWith(href));

    return (
        <div className="min-h-screen bg-gray-950 flex" suppressHydrationWarning>
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col w-60 shrink-0 bg-gray-900 border-r border-gray-800 fixed h-full z-20">
                {/* Institute identity */}
                <div className="p-5 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                            {institute.logo ? (
                                <Image src={institute.logo} alt={institute.name} width={28} height={28} className="rounded-lg object-contain" />
                            ) : (
                                <span className="text-violet-400">
                                    <SchoolIcon />
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{institute.name}</p>
                            <p className="text-xs text-gray-500 truncate">{slug}.localhost</p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                    {navItems.map(({ href, label, icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive(href)
                                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <span className="text-base">{icon}</span>
                            {label}
                        </Link>
                    ))}
                </nav>

                {/* User + Logout */}
                <div className="p-3 border-t border-gray-800">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-sm font-bold text-violet-300 shrink-0">
                            {userName.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{userName || 'Usuario'}</p>
                            <p className="text-xs text-gray-500">{userRole}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            title="Cerrar sesión"
                            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-gray-900/95 border-b border-gray-800 backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="text-violet-400"><SchoolIcon /></span>
                        <span className="text-sm font-bold text-white truncate max-w-[150px]">{institute.name}</span>
                    </div>
                    <button
                        onClick={() => setMobileMenuOpen(o => !o)}
                        className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {mobileMenuOpen
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                        </svg>
                    </button>
                </div>
                {mobileMenuOpen && (
                    <nav className="px-4 pb-4 space-y-1">
                        {navItems.map(({ href, label, icon }) => (
                            <Link
                                key={href}
                                href={href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${isActive(href) ? 'bg-violet-600/20 text-violet-300' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                <span>{icon}</span>{label}
                            </Link>
                        ))}
                        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 w-full">
                            <span>🚪</span> Cerrar sesión
                        </button>
                    </nav>
                )}
            </div>

            {/* Main content */}
            <main className="flex-1 md:ml-60 min-h-screen">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-8 mt-14 md:mt-0">
                    {children}
                </div>
            </main>
        </div>
    );
}
