'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import AvisoSinConexion from '@/components/common/AvisoSinConexion';
import AvisoDePantallaSinGuardar from '@/components/common/AvisoDePantallaSinGuardar';
import DescargaEnSegundoPlano from '@/providers/DescargaEnSegundoPlano';
import PrecargaAlEntrar from '@/components/arranque/PrecargaAlEntrar';
import RecordarElPerfil from '@/components/arranque/RecordarElPerfil';
import EnviarLoPendiente from '@/providers/EnviarLoPendiente';
import CambiosSinEnviar from '@/components/common/CambiosSinEnviar';
import ActualizarLaApp from '@/components/common/ActualizarLaApp';
import DescargarLaApp from '@/components/common/DescargarLaApp';
import { AsistenciaEnPantalla } from '@/components/asistencia/AsistenciaDelAlumno';
import FondoQuieto from '@/components/layout/FondoQuieto';
import { LogOut, GraduationCap, UserCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { useSessionKeepAlive } from '@/hooks/useSessionKeepAlive';
import { usePagosActivos } from '@/hooks/usePagos';
import { usePaeActivo } from '@/hooks/usePae';
import { BACKEND_URL } from '@/config/env';
import { elMenuDe, losDeLaBarra, MI_CUENTA } from '@/lib/el-menu';
import { abrirMiCuenta } from '@/components/layout/CabeceraMovil';
import BarraInferiorMovil from '@/components/layout/BarraInferiorMovil';
import { RecorridoGuiado, BotonDelRecorrido } from '@/components/common/Recorrido';
import { Campana, ApuntarElTelefonoAlEntrar, OfrecerAvisos } from '@/components/layout/Campana';
import CabeceraMovil from '@/components/layout/CabeceraMovil';
import UserAvatar from '@/components/ui/UserAvatar';
import Image from 'next/image';
import { esDocumento } from '@/lib/documentos';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useCerrarSesion } from '@/hooks/useCerrarSesion';
import { useEnElMarco } from '@/lib/en-el-marco';

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
    const pathname = usePathname();
    const { user: usuarioDeLaSesion } = useAuthStore();
    const { data: instituteConfig } = useInstituteConfig();
    const { data: pagos } = usePagosActivos();
    const { data: comedor } = usePaeActivo(user?.role === 'ADMIN');

    const { data: seccionesGuia } = useQuery({
        queryKey: ['misSeccionesGuia'],
        queryFn: async () => {
            const { data } = await api.get('/classrooms/mis-secciones-guia');
            return data as any[];
        },
        enabled: user?.role === 'TEACHER',
        staleTime: 5 * 60 * 1000,
    });
    const esGuia = Boolean(seccionesGuia && seccionesGuia.length > 0);

    // Mantener la sesión activa de forma transparente mientras la pestaña esté abierta
    useSessionKeepAlive();
    // Dentro del recorrido invisible de la precarga, nada de lo que trabaja de fondo.
    const enMarco = useEnElMarco();


    const handleLogout = useCerrarSesion();

    const menu = elMenuDe(user?.role, Boolean(pagos?.enabled), Boolean(comedor?.enabled), esGuia);

    const destinosDeLaBarra = losDeLaBarra(user?.role, Boolean(pagos?.enabled)).flatMap((href) => {
        if (href === MI_CUENTA) return [{ name: 'Mi cuenta', href, icon: UserCircle, alPulsar: abrirMiCuenta }];
        const destino = menu.find((d) => d.href === href);
        return destino ? [{ name: destino.name, href: destino.href, icon: destino.icon }] : [];
    });

    const nombre = user.firstName?.split(' ')[0] || '';
    const apellido = user.lastName?.split(' ')[0] || '';

    /**
     * UN PAPEL SE VE SOLO (`lib/documentos.ts`)
     *
     * Sin cabecera, barra lateral ni barra de abajo: en pantalla, la hoja con
     * «Volver» e «Imprimir»; en el papel, solo la hoja. La franja del reloj
     * del teléfono se tapa igual (una banda blanca, que no se imprime).
     */
    if (esDocumento(pathname)) {
        return (
            <div className="min-h-screen bg-gray-100 print:min-h-0 print:bg-white" suppressHydrationWarning={true}>
                <div className="zona-segura-arriba sticky top-0 z-40 bg-white print:hidden" aria-hidden />
                <AvisoSinConexion />
                <ActualizarLaApp />
                <main className="pb-[calc(1.5rem+var(--zona-segura-abajo))] print:p-0">{children}</main>
                {/* Y la barra de gestos, tapada igual (sin barra de abajo, nada la tapaba). */}
                <div className="zona-segura-abajo fixed inset-x-0 bottom-0 z-40 bg-white print:hidden" aria-hidden />
            </div>
        );
    }
    return (
        <div className="min-h-screen bg-gray-50 print:min-h-0 print:bg-white" suppressHydrationWarning={true}>
            {/* En el teléfono: una foto y un nombre, y el hueco del reloj. */}
            <CabeceraMovil
                nombre={nombre}
                apellido={apellido}
                avatar={usuarioDeLaSesion?.avatar}
                rol={user?.role}
                liceo={user?.institute?.name}
                esAdmin={user?.role === 'ADMIN'}
                alCerrarSesion={handleLogout}
                azul={pathname === '/dashboard' && user?.role === 'ADMIN'}
            />

            {/* Sin señal se sigue viendo lo de antes, y hay que decirlo. En el
                teléfono va dentro de la cabecera; este, el del ordenador. */}
            <AvisoSinConexion soloOrdenador />
            <AvisoDePantallaSinGuardar />
            {!enMarco && (
                <>
                    {/* Como WhatsApp: con conexión, lo de cada uno se baja solo. */}
                    <DescargaEnSegundoPlano />
                    {/* Y la primera vez, TODO, con el libro (`lib/precarga.ts`). */}
                    <PrecargaAlEntrar />
                    {/* Quién usa el teléfono, para la pantalla de bloqueo. */}
                    <RecordarElPerfil />
                    {/* Lo hecho sin conexión: sube solo al volver, y aquí se ve (⏱). */}
                    <EnviarLoPendiente />
                    <CambiosSinEnviar />
                    {/* Si ya dio permiso, este teléfono recibe los avisos de quien entró. */}
                    <ApuntarElTelefonoAlEntrar />

                    {/* En la APK: si hay una versión nueva publicada, se ofrece aquí. */}
                    <ActualizarLaApp />
                </>
            )}
            {/* La cámara de la asistencia por QR del alumno, fuera de toda ventana. */}
            <AsistenciaEnPantalla />
            <FondoQuieto />

            {/*
                LA BARRA LATERAL ES DEL ORDENADOR

                En el teléfono era una cortina, y una cortina de navegación
                sobra cuando el panel de inicio ya tiene todo a la vista: el
                menú entero estaba a dos toques (abrir, elegir) y obligaba a
                tapar la pantalla que se acababa de abrir. Aquí ya no se pinta.
            */}
            <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 bg-white shadow-lg lateral:block print:!hidden">
                <div className="flex h-full flex-col">
                    {/* Logo / User Info */}
                    <div className="p-6 border-b">
                        {instituteConfig?.logo && instituteConfig.logo.startsWith('/') ? (
                            <div className="mb-4 flex items-center justify-center">
                                <Image
                                    src={instituteConfig.logo.startsWith('/uploads')
                                        ? `${BACKEND_URL}${instituteConfig.logo}`
                                        : instituteConfig.logo}
                                    alt="Logo del liceo"
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
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900">{nombre} {apellido}</p>
                                <p className="text-xs text-gray-500">{ROLE_LABELS[user?.role] ?? user?.role}</p>
                            </div>
                            <BotonDelRecorrido className="-mr-2" />
                            <Campana />
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto" data-recorrido="menu">
                        {menu.map((item) => {
                            const isActive = item.href === '/dashboard'
                                ? pathname === '/dashboard'
                                : pathname === item.href || pathname.startsWith(item.href + '/');
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
                            onClick={() => void handleLogout()}
                            className="flex w-full items-center px-4 py-3 text-sm font-medium text-red-600 rounded-md hover:bg-red-50 transition-colors"
                        >
                            <LogOut className="mr-3 h-5 w-5" />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="min-h-screen lateral:ml-64 print:min-h-0 print:!ml-0">
                {/* El hueco de abajo es la barra del teléfono MÁS la del
                    sistema: sin él, lo último de cada pantalla queda donde el
                    dedo pulsa la barra de gestos. */}
                <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(7rem+var(--zona-segura-abajo))] sm:px-6 lg:px-8 lateral:pb-6 print:!p-0 print:max-w-none">
                    {!enMarco && <OfrecerAvisos />}
                    {/* En el navegador de un Android: la APK del liceo, la última. */}
                    {!enMarco && <DescargarLaApp />}
                    {children}
                </div>
            </main>

            {/* La barra de abajo: donde está el pulgar. */}
            <BarraInferiorMovil destinos={destinosDeLaBarra} />
            {/* «¿Cómo funciona?»: el globo que ilumina cada botón (rial). */}
            {!enMarco && <RecorridoGuiado />}
        </div>
    );
}
