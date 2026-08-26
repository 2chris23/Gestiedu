'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface InstituteInfo {
    id: string;
    name: string;
    slug: string;
    logo?: string;
    primaryColor?: string;
}

export default function InstituteLoginPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    const [institute, setInstitute] = useState<InstituteInfo | null>(null);
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [instituteStatus, setInstituteStatus] = useState<'loading' | 'ok' | 'not_found' | 'maintenance' | 'error'>('loading');

    useEffect(() => {
        fetch(`/api/instituto/${slug}/info`, {
            headers: { 'X-Institute-Slug': slug },
        })
            .then(async r => {
                if (r.ok) {
                    const data = await r.json();
                    setInstitute(data);
                    setInstituteStatus('ok');
                } else if (r.status === 404) {
                    setInstituteStatus('not_found');
                } else if (r.status === 503) {
                    setInstituteStatus('maintenance');
                } else {
                    setInstituteStatus('error');
                }
            })
            .catch(() => setInstituteStatus('error'));
    }, [slug]);

    const primaryColor = institute?.primaryColor || '#4f46e5';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch(
                `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '')}/api/auth/login`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Institute-Slug': slug,
                    },
                    body: JSON.stringify(formData),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || data.message || 'Credenciales incorrectas');
                return;
            }

            // El backend devuelve { user, tokens: { accessToken, refreshToken, ... } }
            const accessToken = data.tokens?.accessToken || data.accessToken;
            const refreshToken = data.tokens?.refreshToken || data.refreshToken;

            if (!accessToken) {
                setError('No se recibió token de acceso del servidor');
                return;
            }

            const maxAge = 60 * 60 * 24 * 7;
            document.cookie = `access_token=${accessToken}; path=/; max-age=${maxAge}`;
            if (refreshToken) {
                document.cookie = `refresh_token=${refreshToken}; path=/; max-age=${maxAge}`;
            }
            document.cookie = `institute_slug=${slug}; path=/; max-age=${maxAge}`;

            router.push('/dashboard');
        } catch {
            setError('Error de conexión. Intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    // Pantalla de carga inicial
    if (instituteStatus === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Verificando instituto...</p>
                </div>
            </div>
        );
    }

    // Instituto no existe
    if (instituteStatus === 'not_found') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="text-center max-w-sm">
                    <div className="text-6xl mb-4">🏫</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Instituto no encontrado</h1>
                    <p className="text-gray-500 mb-1">
                        El instituto <span className="font-semibold text-gray-700">&quot;{slug}&quot;</span> no existe
                        o ha sido eliminado del sistema.
                    </p>
                    <p className="text-gray-400 text-sm mt-4">
                        Si crees que esto es un error, contacta al administrador de tu institución.
                    </p>
                </div>
            </div>
        );
    }

    // Instituto en mantenimiento
    if (instituteStatus === 'maintenance') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="text-center max-w-sm">
                    <div className="text-6xl mb-4">🔧</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Instituto en mantenimiento</h1>
                    <p className="text-gray-500">
                        El portal de <span className="font-semibold text-gray-700">&quot;{slug}&quot;</span> está
                        temporalmente fuera de servicio. Intenta nuevamente en unos minutos.
                    </p>
                </div>
            </div>
        );
    }

    // Error de conexión genérico
    if (instituteStatus === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="text-center max-w-sm">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Error de conexión</h1>
                    <p className="text-gray-500 mb-4">No se pudo conectar con el servidor. Intenta recargando la página.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                    >
                        Recargar página
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md">
                {/* Card blanca */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    {/* Barra de color del instituto */}
                    <div className="h-1.5 w-full" style={{ backgroundColor: primaryColor }} />

                    <div className="p-8">
                        {/* Branding del instituto */}
                        <div className="text-center mb-8">
                            <div
                                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                                style={{ backgroundColor: `${primaryColor}15`, border: `1.5px solid ${primaryColor}35` }}
                            >
                                {institute?.logo ? (
                                    <Image src={institute.logo} alt={institute.name} width={48} height={48} className="rounded-xl object-contain" />
                                ) : (
                                    <svg className="w-8 h-8" fill="none" stroke={primaryColor} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                                    </svg>
                                )}
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800">
                                {institute?.name ?? slug}
                            </h1>
                            <p className="text-gray-500 text-sm mt-1">Portal Estudiantil — Acceso Seguro</p>
                        </div>

                        {/* Formulario */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {error && (
                                <div className="flex items-center gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    {error}
                                </div>
                            )}

                            {/* Email */}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Correo electrónico
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                        </svg>
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        autoComplete="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="tu@correo.com"
                                        className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                                        onFocus={e => { e.target.style.borderColor = primaryColor; e.target.style.boxShadow = `0 0 0 3px ${primaryColor}20`; }}
                                        onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                                    />
                                </div>
                            </div>

                            {/* Contraseña */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        autoComplete="current-password"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="••••••••"
                                        className="w-full pl-10 pr-12 py-3 bg-white border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none transition-all"
                                        onFocus={e => { e.target.style.borderColor = primaryColor; e.target.style.boxShadow = `0 0 0 3px ${primaryColor}20`; }}
                                        onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(p => !p)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {showPassword ? (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 px-4 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                style={{ backgroundColor: primaryColor }}
                                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(0.88)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        Verificando...
                                    </>
                                ) : (
                                    <>
                                        Ingresar al Portal
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-400 text-xs mt-5">
                    Sistema de Gestión Escolar · {institute?.name ?? slug}
                </p>
            </div>
        </div>
    );
}
