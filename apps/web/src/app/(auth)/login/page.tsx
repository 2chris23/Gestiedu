'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Card } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';

const loginSchema = z.object({
    instituteSlug: z.string().min(1, 'Ingresa el slug del instituto'),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'La contraseña es muy corta'),
    keepSession: z.boolean().default(false),
});

type LoginInput = z.input<typeof loginSchema>;
type LoginFormData = z.output<typeof loginSchema>;

const TUNNEL_HOSTS = ['lhr.life', 'localhost.run', 'localtunnel.me', 'ngrok-free.app', 'trycloudflare.com', 'pinggy.link', 'pinggy.io'];

/**
 * Extrae el subdominio del hostname actual.
 * san-miguel.localhost → "san-miguel"
 * localhost → null
 */
function getSubdomainFromBrowser(): string | null {
    if (typeof window === 'undefined') return null;
    const host = window.location.hostname;

    // Ignorar hosts de túneles públicos
    for (const tunnel of TUNNEL_HOSTS) {
        if (host === tunnel || host.endsWith('.' + tunnel)) {
            return null;
        }
    }

    if (host.endsWith('.localhost')) {
        const sub = host.slice(0, host.length - '.localhost'.length);
        if (sub && sub !== 'www' && sub !== 'superadmin' && sub !== 'super-admin') {
            return sub;
        }
    }
    // Producción: sub.tuapp.com
    const parts = host.split('.');
    if (parts.length >= 3) {
        const sub = parts[0];
        if (sub !== 'www' && sub !== 'superadmin' && sub !== 'super-admin') {
            return sub;
        }
    }
    return null;
}

export default function LoginPage() {
    const router = useRouter();
    const setAuth = useAuthStore((state) => state.login);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [detectedSlug, setDetectedSlug] = useState<string | null>(null);

    useEffect(() => {
        const sub = getSubdomainFromBrowser();
        if (sub) {
            setDetectedSlug(sub);
        } else if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const slugParam = params.get('slug') || params.get('instituto') || params.get('institute');
            if (slugParam) {
                setDetectedSlug(slugParam);
            }
        }
    }, []);

    const hasAutoSlug = !!detectedSlug;

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<LoginInput, any, LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            keepSession: true,
            instituteSlug: detectedSlug || '',
        }
    });

    // Sincronizar slug detectado
    useEffect(() => {
        if (detectedSlug) {
            setValue('instituteSlug', detectedSlug);
        }
    }, [detectedSlug, setValue]);

    const onSubmit = async (data: LoginFormData) => {
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(data.instituteSlug ? { 'X-Institute-Slug': data.instituteSlug } : {}),
                },
                body: JSON.stringify({
                    email: data.email,
                    password: data.password,
                    instituteSlug: data.instituteSlug,
                    rememberMe: Boolean(data.keepSession),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Error al iniciar sesión');
            }

            const result = await response.json();
            const { user, tokens } = result;

            // Guardar el slug del instituto como cookie para que axios lo envíe al backend
            if (result.instituteSlug) {
                document.cookie = `institute_slug=${result.instituteSlug}; path=/; max-age=${60 * 60 * 24 * 30}`;
            }

            // Los tokens viven en cookies (los servicios los leen de ahí)
            const accessToken = tokens?.accessToken || result.accessToken;
            const refreshToken = tokens?.refreshToken || result.refreshToken;
            if (accessToken) {
                document.cookie = `access_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
            }
            if (refreshToken) {
                document.cookie = `refresh_token=${refreshToken}; path=/; max-age=${60 * 60 * 24 * 7}`;
            }

            // Store user data in Zustand for UI
            setAuth(user, accessToken || '', result.keepSession);
            router.push('/dashboard');

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
        } finally {
            setIsLoading(false);
        }
    };

    // Formatear el nombre del instituto para mostrar bonito
    const displayName = detectedSlug
        ? detectedSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : '';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center text-primary-600">
                    <BookOpen size={48} />
                </div>
                
                {hasAutoSlug ? (
                    <>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            {displayName}
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            Sistema de Gestión Escolar
                        </p>

                    </>
                ) : (
                    <>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            Gestión Escolar
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            Ingresa a tu cuenta institucional
                        </p>
                    </>
                )}
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <Card className="py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <div className="flex">
                                    <div className="ml-3">
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Campo slug: visible solo si NO hay subdominio auto-detectado */}
                        {!hasAutoSlug && (
                            <div>
                                <label htmlFor="instituteSlug" className="block text-sm font-medium text-gray-700">
                                    Instituto (slug)
                                </label>
                                <div className="mt-1">
                                    <Input
                                        id="instituteSlug"
                                        type="text"
                                        placeholder="ej: san-miguel"
                                        {...register('instituteSlug')}
                                        className={errors.instituteSlug ? 'border-red-300' : ''}
                                    />
                                    {errors.instituteSlug && (
                                        <p className="mt-2 text-sm text-red-600">{errors.instituteSlug.message}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Input oculto para que react-hook-form siempre tenga el slug */}
                        {hasAutoSlug && (
                            <input type="hidden" {...register('instituteSlug')} />
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                Correo Electrónico
                            </label>
                            <div className="mt-1">
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    {...register('email')}
                                    className={errors.email ? 'border-red-300' : ''}
                                    placeholder="tu@correo.com"
                                />
                                {errors.email && (
                                    <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Contraseña
                            </label>
                            <div className="mt-1">
                                <Input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    {...register('password')}
                                    className={errors.password ? 'border-red-300' : ''}
                                    placeholder="••••••••"
                                />
                                {errors.password && (
                                    <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input
                                    id="keep-session"
                                    type="checkbox"
                                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                    {...register('keepSession')}
                                />
                                <label htmlFor="keep-session" className="ml-2 block text-sm text-gray-900">
                                    Mantener sesión iniciada
                                </label>
                            </div>
                        </div>

                        <div>
                            <Button type="submit" disabled={isLoading} className="w-full flex justify-center">
                                {isLoading ? 'Iniciando...' : 'Ingresar'}
                            </Button>
                        </div>
                    </form>
                </Card>
                
                {/* Footer */}
                <p className="mt-6 text-center text-xs text-gray-500">
                    Powered by <span className="text-primary-600 font-medium">GestiEdu</span>
                </p>
            </div>
        </div>
    );
}
