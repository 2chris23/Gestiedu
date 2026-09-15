'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Card } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import { guardarCredencial } from '@/lib/credencial-en-memoria';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';
import { BACKEND_URL } from '@/config/env';

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
    const [instituteData, setInstituteData] = useState<{
        name: string;
        logo?: string;
        favicon?: string;
        primaryColor?: string;
        status?: string;
    } | null>(null);
    const [instituteNotFound, setInstituteNotFound] = useState(false);
    const [validatingInstitute, setValidatingInstitute] = useState(false);

    useEffect(() => {
        const sub = getSubdomainFromBrowser();
        if (sub) {
            setDetectedSlug(sub);
        } else if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const slugParam = params.get('slug') || params.get('instituto') || params.get('institute');
            if (slugParam) {
                setDetectedSlug(slugParam);
            } else {
                // Si no hay slug en URL, buscar en cookie si ya inició sesión previamente en un instituto
                const match = document.cookie.match(/(?:^|;\s*)institute_slug=([^;]+)/);
                if (match?.[1]) {
                    setDetectedSlug(decodeURIComponent(match[1]));
                }
            }
        }
    }, []);

    // Validar instituto contra la base de datos de la plataforma si viene de subdominio o parámetro
    useEffect(() => {
        if (!detectedSlug) {
            setInstituteData(null);
            setInstituteNotFound(false);
            return;
        }

        let isMounted = true;
        setValidatingInstitute(true);
        setInstituteNotFound(false);

        fetch(`/api/instituto/${detectedSlug}/info`)
            .then(async (res) => {
                if (!isMounted) return;
                if (res.ok) {
                    const data = await res.json();
                    setInstituteData(data);
                    setInstituteNotFound(false);
                } else if (res.status === 404) {
                    setInstituteNotFound(true);
                    setInstituteData(null);
                } else {
                    // Si hubo otro error o el instituto no está activo
                    const err = await res.json().catch(() => ({}));
                    setError(err.error || 'Error al validar el instituto');
                }
            })
            .catch(() => {
                if (isMounted) {
                    setInstituteNotFound(true);
                }
            })
            .finally(() => {
                if (isMounted) setValidatingInstitute(false);
            });

        return () => {
            isMounted = false;
        };
    }, [detectedSlug]);

    // Si el instituto tiene favicon, actualizarlo dinámicamente en la pantalla de login
    useEffect(() => {
        if (instituteData?.favicon) {
            const faviconUrl = instituteData.favicon.startsWith('/uploads')
                ? `${BACKEND_URL}${instituteData.favicon}`
                : instituteData.favicon;
            const finalUrl = `${faviconUrl}?v=login`;

            const existingLinks = document.querySelectorAll("link[rel*='icon']");
            existingLinks.forEach(el => el.remove());

            const iconLink = document.createElement('link');
            iconLink.rel = 'icon';
            iconLink.type = faviconUrl.endsWith('.ico') ? 'image/x-icon' : 'image/png';
            iconLink.href = finalUrl;
            document.head.appendChild(iconLink);
        }
    }, [instituteData?.favicon]);

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

            /**
             * LAS LLAVES LAS GUARDA EL SERVIDOR, NO ESTA PANTALLA
             *
             * `/api/auth/login` ya devolvió las cookies puestas como toca: la
             * llave larga (`refresh_token`) marcada `httpOnly`, para que ningún
             * programa de la página pueda leerla, y todas marcadas `Secure` en
             * producción, para que no viajen por conexión sin cifrar.
             *
             * Aquí se volvían a escribir a mano, y desde el navegador **no se
             * puede** poner ninguna de esas dos marcas. Al reescribirlas se
             * perdían:
             *
             *     document.cookie = `refresh_token=${refreshToken}; path=/; ...`
             *
             * Es decir, se deshacía lo que el servidor había hecho bien. Además
             * de innecesario: las cookies ya venían puestas en la respuesta.
             */
            const accessToken = tokens?.accessToken || result.accessToken;

            /**
             * La llave corta se queda **solo en la memoria de esta pestaña**.
             * No se escribe en ningún sitio del que se pueda copiar. Ver
             * `lib/credencial-en-memoria.ts`.
             */
            guardarCredencial(accessToken);

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

    // Nombre a mostrar: prioridad al nombre real registrado en base de datos
    const displayName = instituteData?.name || (detectedSlug
        ? detectedSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : '');

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center mb-2">
                    {instituteData?.logo ? (
                        <div className="relative flex items-center justify-center p-1">
                            <Image
                                src={instituteData.logo.startsWith('/uploads')
                                    ? `${BACKEND_URL}${instituteData.logo}`
                                    : instituteData.logo}
                                alt={displayName || 'Logo del Instituto'}
                                width={84}
                                height={84}
                                className="object-contain max-h-24 w-auto drop-shadow-sm"
                                unoptimized
                                priority
                            />
                        </div>
                    ) : (
                        <div className="flex justify-center text-primary-600">
                            <BookOpen size={48} />
                        </div>
                    )}
                </div>
                
                {hasAutoSlug ? (
                    <>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            {validatingInstitute ? 'Cargando...' : instituteNotFound ? 'Instituto No Encontrado' : displayName}
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-600">
                            {instituteNotFound ? 'El subdominio al que intentas acceder no existe en la plataforma' : 'Sistema de Gestión Escolar'}
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
                {instituteNotFound ? (
                    <Card className="py-8 px-4 shadow sm:rounded-lg sm:px-10 text-center">
                        <div className="text-amber-500 mb-3 flex justify-center">
                            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                            El instituto «{detectedSlug}» no está registrado
                        </h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Verifica que la dirección URL sea correcta o comunícate con el administrador de tu institución.
                        </p>
                        <a
                            href="http://localhost:3000/login"
                            className="inline-flex items-center justify-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition"
                        >
                            Ir al inicio general
                        </a>
                    </Card>
                ) : (
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
                )}
                
                {/* Footer */}
                <p className="mt-6 text-center text-xs text-gray-500">
                    Powered by <span className="text-primary-600 font-medium">GestiEdu</span>
                </p>
            </div>
        </div>
    );
}
