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
import { BookOpen, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { BACKEND_URL } from '@/config/env';
import NotFound from '@/app/not-found';
import { elLiceoDelHost } from '@/lib/el-liceo-de-la-direccion';
import { abrirConLaHuella, guardarLaLlave, hayHuella, hayLlaveGuardada, olvidarLaLlave } from '@/lib/la-huella';

const loginSchema = z.object({
    instituteSlug: z.string().min(1, 'Ingresa el slug del instituto'),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'La contraseña es muy corta'),
    keepSession: z.boolean().default(false),
});

type LoginInput = z.input<typeof loginSchema>;
type LoginFormData = z.output<typeof loginSchema>;

/** Ver `lib/el-liceo-de-la-direccion.ts`: una dirección de red no nombra a ningún liceo. */
const getSubdomainFromBrowser = () =>
    typeof window === 'undefined' ? null : elLiceoDelHost(window.location.hostname);

export default function LoginPage() {
    const router = useRouter();
    const setAuth = useAuthStore((state) => state.login);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [isCheckingScope, setIsCheckingScope] = useState(true);
    const [directAccessForbidden, setDirectAccessForbidden] = useState(false);

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
            setIsCheckingScope(false);
        } else if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const slugParam = params.get('slug') || params.get('instituto') || params.get('institute');
            if (slugParam) {
                setDetectedSlug(slugParam);
                setIsCheckingScope(false);
            } else {
                // Sin subdominio ni parámetro: se prohíbe el acceso directo y se muestra 404
                setDirectAccessForbidden(true);
                setIsCheckingScope(false);
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

    /**
     * EL ICONITO DE LA PESTAÑA, EL DEL LICEO — Y SOLO EL NUESTRO
     *
     * Esto quitaba del documento TODOS los enlaces de icono, incluidos los que
     * pone React (`metadata.icons` en `app/layout.tsx`; ojo:
     * `rel="apple-touch-icon"` también contiene la palabra «icon»). Cuando
     * React iba a tocar uno de esos nodos ya no estaba, y reventaba con
     * «Cannot read properties of null (reading 'removeChild')» — justo al
     * cambiar de pantalla, porque la limpieza corre al salir de esta.
     *
     * Eso no se ve como un error: se ve como que **la pantalla se queda
     * pegada**. Se entraba, la dirección pasaba a `/dashboard` y se seguía
     * viendo este formulario hasta recargar a mano (AUTH-01).
     *
     * Regla: solo se toca lo que se crea aquí, y por eso va marcado.
     */
    useEffect(() => {
        const MARCA = 'data-icono-del-liceo';
        const quitarLosNuestros = () =>
            document.querySelectorAll(`link[${MARCA}]`).forEach((el) => el.remove());

        if (!instituteData?.favicon) {
            quitarLosNuestros();
            return quitarLosNuestros;
        }

        const faviconUrl = instituteData.favicon.startsWith('/uploads')
            ? `${BACKEND_URL}${instituteData.favicon}`
            : instituteData.favicon;

        quitarLosNuestros();

        const iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        iconLink.type = faviconUrl.endsWith('.ico') ? 'image/x-icon' : 'image/png';
        iconLink.href = `${faviconUrl}?v=login`;
        iconLink.setAttribute(MARCA, '');
        document.head.appendChild(iconLink);

        return quitarLosNuestros;
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

    // ── ENTRAR CON LA HUELLA ────────────────────────────────────────────
    const [conHuella, setConHuella] = useState(false);
    const [contrasenaALaVista, setContrasenaALaVista] = useState(false);

    /**
     * El botón de la huella solo se pinta si ESTE teléfono guardó una llave, y
     * eso solo pasa después de entrar con la contraseña y pedirlo en «Mi
     * cuenta». En un navegador no aparece nunca: no hay dónde guardar algo así
     * detrás de una huella, y fingirlo sería peor que no tenerlo.
     */
    useEffect(() => {
        if (!detectedSlug) return;
        let vivo = true;
        (async () => {
            const puede = (await hayHuella()) && (await hayLlaveGuardada(detectedSlug));
            if (vivo) setConHuella(puede);
        })();
        return () => {
            vivo = false;
        };
    }, [detectedSlug]);

    const entrarConHuella = async () => {
        if (!detectedSlug) return;
        setError('');

        const abierto = await abrirConLaHuella(detectedSlug);
        if (!abierto) {
            // Cancelar la huella no es un error: se sigue con la contraseña.
            return;
        }

        setIsLoading(true);
        try {
            const respuesta = await fetch('/api/auth/entrar-con-el-telefono', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Institute-Slug': detectedSlug },
                body: JSON.stringify({ llave: abierto.llave, instituteSlug: detectedSlug }),
            });

            if (!respuesta.ok) {
                // La llave ya no vale: se tira y se entra como siempre. Pasa
                // cuando se cerró sesión en otro sitio o alguien usó una copia.
                await olvidarLaLlave(detectedSlug);
                setConHuella(false);
                setError('Esta llave ya no vale. Entra con tu contraseña.');
                return;
            }

            const resultado = await respuesta.json();

            // La de antes se gastó: se guarda la nueva o la próxima vez tocará
            // escribir la contraseña.
            if (resultado.llave) {
                await guardarLaLlave(detectedSlug, abierto.correo, resultado.llave);
            }

            guardarCredencial(resultado.tokens?.accessToken || resultado.accessToken);
            setAuth(resultado.user, resultado.accessToken || '', true);
            router.push('/dashboard');
        } catch {
            setError('No se pudo entrar con la huella. Prueba con tu contraseña.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isCheckingScope) {
        return <div className="min-h-screen bg-slate-50" />;
    }

    if (directAccessForbidden || !detectedSlug) {
        return <NotFound />;
    }

    return (
        <div className="alto-util zona-segura-arriba zona-segura-abajo flex flex-col justify-center bg-gray-50 px-4 py-8 sm:px-6">
            <div className="mx-auto w-full max-w-md">
                {/* El liceo: su escudo y su nombre. Quien entra tiene que
                    reconocer el sitio antes de escribir su contraseña. */}
                <div className="mb-6 flex flex-col items-center text-center">
                    {instituteData?.logo ? (
                        <Image
                            src={instituteData.logo.startsWith('/uploads')
                                ? `${BACKEND_URL}${instituteData.logo}`
                                : instituteData.logo}
                            alt={displayName || 'Logo del Instituto'}
                            width={84}
                            height={84}
                            className="max-h-20 w-auto object-contain drop-shadow-sm"
                            unoptimized
                            priority
                        />
                    ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-primary-600">
                            <BookOpen size={32} />
                        </span>
                    )}

                    <h1 className="mt-4 text-2xl font-extrabold leading-tight text-gray-900 sm:text-3xl">
                        {hasAutoSlug
                            ? validatingInstitute
                                ? 'Cargando...'
                                : instituteNotFound
                                  ? 'Instituto No Encontrado'
                                  : displayName
                            : 'Gestión Escolar'}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600">
                        {instituteNotFound
                            ? 'El subdominio al que intentas acceder no existe en la plataforma'
                            : 'Sistema de Gestión Escolar'}
                    </p>
                </div>

                {instituteNotFound ? (
                    <Card className="rounded-2xl px-5 py-8 text-center shadow-sm">
                        <div className="mb-3 flex justify-center text-amber-500">
                            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="mb-2 text-lg font-bold text-gray-900">
                            El instituto «{detectedSlug}» no está registrado
                        </h2>
                        <p className="mb-6 text-sm text-gray-500">
                            Verifica que la dirección sea correcta o comunícate con el administrador de tu institución.
                        </p>
                    </Card>
                ) : (
                    <Card className="rounded-2xl px-5 py-6 shadow-sm sm:px-8 sm:py-8">
                        {/*
                            ENTRAR CON LA HUELLA

                            Solo sale si ESTE teléfono guardó una llave, y eso
                            solo pasa después de haber entrado con la contraseña
                            y haberlo pedido. La huella no entra al sistema:
                            abre el cajón del teléfono donde está la llave.
                            Ver `lib/la-huella.ts`.
                        */}
                        {conHuella && (
                            <div className="mb-6">
                                <button
                                    type="button"
                                    onClick={entrarConHuella}
                                    disabled={isLoading}
                                    className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 text-sm font-bold text-indigo-700 transition-colors active:bg-indigo-100 disabled:opacity-60"
                                >
                                    <Fingerprint className="h-5 w-5" aria-hidden />
                                    Entrar con la huella
                                </button>
                                <div className="mt-5 flex items-center gap-3">
                                    <span className="h-px flex-1 bg-gray-200" />
                                    <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                                        o con tu contraseña
                                    </span>
                                    <span className="h-px flex-1 bg-gray-200" />
                                </div>
                            </div>
                        )}

                        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
                            {error && (
                                <p className="rounded-lg border-l-4 border-red-400 bg-red-50 p-3 text-sm text-red-700">
                                    {error}
                                </p>
                            )}

                            {/* Campo slug: visible solo si NO hay subdominio auto-detectado */}
                            {!hasAutoSlug && (
                                <div>
                                    <label htmlFor="instituteSlug" className="mb-1 block text-sm font-medium text-gray-700">
                                        Instituto
                                    </label>
                                    <Input
                                        id="instituteSlug"
                                        type="text"
                                        placeholder="ej: san-miguel"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        {...register('instituteSlug')}
                                        className={`h-12 ${errors.instituteSlug ? 'border-red-300' : ''}`}
                                    />
                                    {errors.instituteSlug && (
                                        <p className="mt-1.5 text-sm text-red-600">{errors.instituteSlug.message}</p>
                                    )}
                                </div>
                            )}

                            {/* Input oculto para que react-hook-form siempre tenga el slug */}
                            {hasAutoSlug && <input type="hidden" {...register('instituteSlug')} />}

                            <div>
                                <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                                    Correo Electrónico
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    {...register('email')}
                                    className={`h-12 ${errors.email ? 'border-red-300' : ''}`}
                                    placeholder="tu@correo.com"
                                />
                                {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
                            </div>

                            <div>
                                <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                                    Contraseña
                                </label>
                                {/* El ojo: escribir una contraseña larga a ciegas en
                                    un teclado de teléfono es la primera causa de
                                    «no me deja entrar». */}
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={contrasenaALaVista ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        {...register('password')}
                                        className={`h-12 pr-12 ${errors.password ? 'border-red-300' : ''}`}
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setContrasenaALaVista((v) => !v)}
                                        aria-label={contrasenaALaVista ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                                        aria-pressed={contrasenaALaVista}
                                        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-colors active:bg-gray-100"
                                    >
                                        {contrasenaALaVista ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>
                                )}
                            </div>

                            <label htmlFor="keep-session" className="flex min-h-[44px] items-center gap-2.5 text-sm text-gray-900">
                                <input
                                    id="keep-session"
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    {...register('keepSession')}
                                />
                                Mantener sesión iniciada
                            </label>

                            <Button type="submit" disabled={isLoading} className="flex h-12 w-full justify-center text-base">
                                {isLoading ? 'Iniciando...' : 'Ingresar'}
                            </Button>
                        </form>
                    </Card>
                )}

                <p className="mt-6 text-center text-xs text-gray-500">
                    Powered by <span className="font-medium text-primary-600">GestiEdu</span>
                </p>
            </div>
        </div>
    );
}
