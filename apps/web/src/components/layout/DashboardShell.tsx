'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { olvidarCredencial } from '@/lib/credencial-en-memoria';
import { olvidarLoDescargado } from '@/lib/lo-guardado-en-el-telefono';
import { laPuertaDelLiceo, elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { laLlaveGuardada, olvidarLaLlave } from '@/lib/la-huella';
import AvisoSinConexion from '@/components/common/AvisoSinConexion';
import ActualizarLaApp from '@/components/common/ActualizarLaApp';
import { AsistenciaEnPantalla } from '@/components/asistencia/AsistenciaDelAlumno';
import { LogOut, GraduationCap, UserCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { useSessionKeepAlive } from '@/hooks/useSessionKeepAlive';
import { usePagosActivos } from '@/hooks/usePagos';
import { BACKEND_URL } from '@/config/env';
import { elMenuDe, losDeLaBarra, MI_CUENTA } from '@/lib/el-menu';
import { abrirMiCuenta } from '@/components/layout/CabeceraMovil';
import BarraInferiorMovil from '@/components/layout/BarraInferiorMovil';
import CabeceraMovil from '@/components/layout/CabeceraMovil';
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

const ROLE_LABELS: Record<string, string> = {
    ADMIN: 'Administrador',
    TEACHER: 'Profesor',
    STUDENT: 'Estudiante',
    TUTOR: 'Tutor',
};

export default function DashboardShell({ user, children }: DashboardShellProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { logout: zustandLogout, user: usuarioDeLaSesion } = useAuthStore();
    const { data: instituteConfig } = useInstituteConfig();
    const { data: pagos } = usePagosActivos();

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
        const liceo = elLiceoDeLaCookie();
        const puerta = laPuertaDelLiceo();

        // La llave de la huella de ESTE teléfono: se manda para que el
        // servidor la anule, y se borra de aquí. Cerrar sesión es cerrar
        // sesión: si se quedara, el siguiente que abriera la app entraría con
        // la huella del dueño del móvil sin pasar por la contraseña.
        const llaveDelTelefono = liceo ? await laLlaveGuardada(liceo) : null;

        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ llaveDelTelefono: llaveDelTelefono ?? undefined }),
        });
        if (liceo) await olvidarLaLlave(liceo);
        // Y la llave que estaba en la memoria de la pestaña: si no, seguiría
        // sirviendo hasta que caduque aunque la sesión esté cerrada.
        olvidarCredencial();
        // Y lo descargado a este teléfono. Cerrar sesión es cerrar sesión: en
        // un móvil que se presta, lo de antes no se enseña al siguiente.
        await olvidarLoDescargado();
        // Clear Zustand UI state
        zustandLogout();
        router.push(puerta);
    };

    const menu = elMenuDe(user?.role, Boolean(pagos?.enabled));

    const destinosDeLaBarra = losDeLaBarra(user?.role, Boolean(pagos?.enabled)).flatMap((href) => {
        if (href === MI_CUENTA) return [{ name: 'Mi cuenta', href, icon: UserCircle, alPulsar: abrirMiCuenta }];
        const destino = menu.find((d) => d.href === href);
        return destino ? [{ name: destino.name, href: destino.href, icon: destino.icon }] : [];
    });

    const nombre = user.firstName?.split(' ')[0] || '';
    const apellido = user.lastName?.split(' ')[0] || '';

    return (
        <div className="min-h-screen bg-gray-50" suppressHydrationWarning={true}>
            {/* En el teléfono: una foto y un nombre, y el hueco del reloj. */}
            <CabeceraMovil
                nombre={nombre}
                apellido={apellido}
                avatar={usuarioDeLaSesion?.avatar}
                rol={user?.role}
                liceo={user?.institute?.name}
                esAdmin={user?.role === 'ADMIN'}
                alCerrarSesion={handleLogout}
            />

            {/* Sin señal se sigue viendo lo de antes, y hay que decirlo. */}
            <AvisoSinConexion />

            {/* En la APK: si hay una versión nueva publicada, se ofrece aquí. */}
            <ActualizarLaApp />
            {/* La cámara de la asistencia por QR del alumno, fuera de toda ventana. */}
            <AsistenciaEnPantalla />

            {/*
                LA BARRA LATERAL ES DEL ORDENADOR

                En el teléfono era una cortina, y una cortina de navegación
                sobra cuando el panel de inicio ya tiene todo a la vista: el
                menú entero estaba a dos toques (abrir, elegir) y obligaba a
                tapar la pantalla que se acababa de abrir. Aquí ya no se pinta.
            */}
            <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 bg-white shadow-lg lateral:block">
                <div className="flex h-full flex-col">
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
                                <p className="text-sm font-medium text-gray-900">{nombre} {apellido}</p>
                                <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role] ?? user?.role}</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {menu.map((item) => {
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

                    <div className="border-t p-4">
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
            <main className="min-h-screen lateral:ml-64">
                {/* El hueco de abajo es la barra del teléfono MÁS la del
                    sistema: sin él, lo último de cada pantalla queda donde el
                    dedo pulsa la barra de gestos. */}
                <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(7rem+var(--zona-segura-abajo))] sm:px-6 lg:px-8 lateral:pb-6">
                    {children}
                </div>
            </main>

            {/* La barra de abajo: donde está el pulgar. */}
            <BarraInferiorMovil destinos={destinosDeLaBarra} />
        </div>
    );
}
