'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DashboardData {
    user?: {
        id: string;
        firstName: string;
        lastName: string;
        role: string;
    };
    stats?: {
        totalStudents?: number;
        totalTeachers?: number;
        totalClassrooms?: number;
        totalSubjects?: number;
        averageGrade?: number;
        attendanceRate?: number;
    };
    recentGrades?: Array<{
        id: string;
        score: number;
        activity: { title: string; type: string };
        subject: { name: string };
    }>;
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '');

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

function isTokenExpired(token: string): boolean {
    try {
        // JWT usa base64 URL-safe (- y _ en vez de + y /); atob() necesita base64 estándar
        const base64 = token.split('.')[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
        const payload = JSON.parse(atob(padded));
        return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
    } catch {
        return false; // Si no se puede decodificar, dejar que el backend lo rechace
    }
}

function clearSession() {
    document.cookie = 'access_token=; path=/; max-age=0';
    document.cookie = 'refresh_token=; path=/; max-age=0';
    document.cookie = 'institute_slug=; path=/; max-age=0';
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
    return (
        <div className={`relative overflow-hidden bg-gray-800/60 border border-gray-700/60 rounded-2xl p-6 backdrop-blur-sm`}>
            <div className={`absolute top-0 right-0 w-20 h-20 ${color} opacity-10 rounded-full -translate-y-1/2 translate-x-1/2`} />
            <span className="text-3xl">{icon}</span>
            <p className="text-gray-400 text-sm mt-3">{label}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
    );
}

export default function DashboardPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    const [data, setData] = useState<DashboardData>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function fetchDashboard() {
            try {
                const token = getToken();
                // Verificar localmente si el token expiró antes de llamar al backend
                if (!token || isTokenExpired(token)) {
                    clearSession();
                    router.push('/login');
                    return;
                }

                // Fetch dashboard stats and user profile in parallel
                const [dashRes, profileRes] = await Promise.all([
                    fetch(`${API_URL}/api/dashboard`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'X-Institute-Slug': slug,
                        },
                    }),
                    fetch(`${API_URL}/api/users/profile/me`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'X-Institute-Slug': slug,
                        },
                    }),
                ]);

                const dashboard: DashboardData = {};

                if (dashRes.ok) {
                    const d = await dashRes.json();
                    dashboard.stats = d.stats || d;
                } else if (dashRes.status === 401) {
                    clearSession();
                    router.push('/login');
                    return;
                }

                if (profileRes.ok) {
                    const p = await profileRes.json();
                    dashboard.user = p.user || p;
                } else if (profileRes.status === 401) {
                    clearSession();
                    router.push('/login');
                    return;
                }

                setData(dashboard);
            } catch (e) {
                setError('Error al cargar el dashboard');
            } finally {
                setLoading(false);
            }
        }

        fetchDashboard();
    }, [slug, router]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Cargando tu información...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-16">
                <p className="text-5xl mb-4">⚠️</p>
                <p className="text-white text-lg font-semibold">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 text-violet-400 hover:text-violet-300">
                    Reintentar
                </button>
            </div>
        );
    }

    const { user, stats } = data;
    const role = user?.role ?? '';

    const getRoleLabel = (r: string) => ({
        ADMIN: '🔑 Administrador',
        TEACHER: '👨‍🏫 Docente',
        STUDENT: '🎓 Estudiante',
        TUTOR: '👨‍👩‍👦 Tutor',
    }[r] ?? r);

    return (
        <div className="space-y-8">
            {/* Welcome header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        {user ? `Hola, ${user.firstName} 👋` : 'Dashboard'}
                    </h1>
                    <p className="text-gray-400 mt-1">
                        {user ? getRoleLabel(user.role) : 'Bienvenido al portal escolar'}
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-800/60 border border-gray-700/60 rounded-xl text-sm text-gray-300">
                    <span>📅</span>
                    <span>{new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
            </div>

            {/* Stats grid — shown to ADMIN/TEACHER, simplified for others */}
            {(role === 'ADMIN' || role === 'TEACHER') && stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {role === 'ADMIN' && (
                        <>
                            <StatCard icon="👥" label="Estudiantes" value={stats.totalStudents ?? '--'} color="bg-violet-500" />
                            <StatCard icon="👨‍🏫" label="Docentes" value={stats.totalTeachers ?? '--'} color="bg-blue-500" />
                            <StatCard icon="🏫" label="Aulas" value={stats.totalClassrooms ?? '--'} color="bg-emerald-500" />
                            <StatCard icon="📚" label="Materias" value={stats.totalSubjects ?? '--'} color="bg-amber-500" />
                        </>
                    )}
                    {role === 'TEACHER' && (
                        <>
                            <StatCard icon="👥" label="Mis Estudiantes" value={stats.totalStudents ?? '--'} color="bg-violet-500" />
                            <StatCard icon="📚" label="Mis Materias" value={stats.totalSubjects ?? '--'} color="bg-blue-500" />
                            <StatCard icon="📊" label="Promedio General" value={stats.averageGrade ? `${Number(stats.averageGrade).toFixed(1)}` : '--'} color="bg-emerald-500" />
                            <StatCard icon="✅" label="Asistencia" value={stats.attendanceRate ? `${stats.attendanceRate}%` : '--'} color="bg-amber-500" />
                        </>
                    )}
                </div>
            )}

            {/* Student/Tutor summary */}
            {(role === 'STUDENT' || role === 'TUTOR' || !role) && stats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <StatCard icon="📊" label="Promedio General" value={stats.averageGrade ? `${Number(stats.averageGrade).toFixed(1)}` : '--'} color="bg-violet-500" />
                    <StatCard icon="✅" label="% Asistencia" value={stats.attendanceRate ? `${stats.attendanceRate}%` : '--'} color="bg-emerald-500" />
                </div>
            )}

            {/* Quick access */}
            <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Acceso Rápido</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { href: '/grades', icon: '📝', label: 'Calificaciones' },
                        { href: '/attendance', icon: '📋', label: 'Asistencia' },
                        { href: '/subjects', icon: '📚', label: 'Materias' },
                        { href: '/profile', icon: '👤', label: 'Mi Perfil' },
                        ...(role === 'ADMIN' || role === 'TEACHER' ? [
                            { href: '/students', icon: '👥', label: 'Estudiantes' },
                        ] : []),
                    ].map(({ href, icon, label }) => (
                        <a
                            key={href}
                            href={href}
                            className="flex flex-col items-center gap-2 p-4 bg-gray-700/40 hover:bg-gray-700/70 border border-gray-600/40 hover:border-violet-500/40 rounded-xl transition-all duration-200 group"
                        >
                            <span className="text-2xl group-hover:scale-110 transition-transform duration-200">{icon}</span>
                            <span className="text-xs text-gray-400 group-hover:text-white transition-colors text-center">{label}</span>
                        </a>
                    ))}
                </div>
            </div>

            {/* Info card if no data */}
            {!stats && (
                <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl p-8 text-center">
                    <p className="text-4xl mb-3">🎓</p>
                    <h2 className="text-xl font-bold text-white mb-2">Bienvenido al Portal Escolar</h2>
                    <p className="text-gray-400 text-sm">
                        Usa el menú de navegación para acceder a tus calificaciones, asistencia y más.
                    </p>
                </div>
            )}
        </div>
    );
}
