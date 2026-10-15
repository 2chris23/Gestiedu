'use client';

import { HojaDeComprobante } from '@/components/pagos/HojaDeComprobante';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
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
import { UserCircle } from 'lucide-react';
import { useInstituteConfig } from '@/hooks/useInstitute';
import { useSessionKeepAlive } from '@/hooks/useSessionKeepAlive';
import { usePagosActivos } from '@/hooks/usePagos';
import { usePaeActivo } from '@/hooks/usePae';
import { elMenuDe, losDeLaBarra, MI_CUENTA } from '@/lib/el-menu';
import { abrirMiCuenta } from '@/components/layout/CabeceraMovil';
import BarraInferiorMovil from '@/components/layout/BarraInferiorMovil';
import { RecorridoGuiado } from '@/components/common/Recorrido';
import { ApuntarElTelefonoAlEntrar, OfrecerAvisos } from '@/components/layout/Campana';
import CabeceraMovil from '@/components/layout/CabeceraMovil';
import BarraLateral from '@/components/layout/BarraLateral';
import { FranjaDelInicio } from '@/components/dashboard/FranjaDelInicio';
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


/**
 * Las cajas azules del ordenador: cristal, como las tarjetas de Asistencia y
 * En riesgo (blanco translúcido y un borde suave), no un azul liso con una
 * raya oscura alrededor.
 */
const CRISTAL =
    'rounded-[24px] border border-cabecera-texto/[0.14] bg-cabecera shadow-[0_16px_48px_rgba(4,24,64,0.22)] dark:bg-[linear-gradient(180deg,var(--franja-arriba)_0%,var(--franja-medio)_60%,var(--franja-abajo)_100%)]';

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
    const esInicio = pathname === '/dashboard';

    /**
     * UN PAPEL SE VE SOLO (`lib/documentos.ts`)
     *
     * Sin cabecera, barra lateral ni barra de abajo: en pantalla, la hoja con
     * «Volver» e «Imprimir»; en el papel, solo la hoja. La franja del reloj
     * del teléfono se tapa igual (una banda blanca, que no se imprime).
     */
    if (esDocumento(pathname)) {
        return (
            <div className="modo-claro min-h-screen bg-gray-100 print:min-h-0 print:bg-white" suppressHydrationWarning={true}>
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
        <div
            className={cn(
                'marco-del-ordenador min-h-screen bg-gray-50 lateral:bg-[rgb(var(--lienzo-de-la-app))] print:min-h-0 print:!bg-white',
                // En una sola pantalla, sin bajar, solo donde cabe (desde 1280 px de
                // ancho, xl): en una tableta o un portátil estrecho el calendario y
                // el cuadro de honor van uno debajo del otro, y apretados a media
                // altura se montaban uno encima del otro.
                esInicio && 'xl:lateral:h-screen xl:lateral:overflow-hidden'
            )}
            suppressHydrationWarning={true}
        >
            {/* En el teléfono: una foto y un nombre, y el hueco del reloj. */}
            <CabeceraMovil
                nombre={nombre}
                apellido={apellido}
                avatar={usuarioDeLaSesion?.avatar}
                rol={user?.role}
                liceo={instituteConfig?.name || user?.institute?.name}
                esAdmin={user?.role === 'ADMIN'}
                alCerrarSesion={handleLogout}
                azul={esInicio}
                aura={pathname === '/dashboard/pagos'}
            />

            {/* Sin señal se sigue viendo lo de antes, y hay que decirlo. En el
                teléfono va dentro de la cabecera; este, el del ordenador. */}
            <AvisoSinConexion soloOrdenador />
            <AvisoDePantallaSinGuardar />
            {/* El comprobante de un pago, como el de un Pago Móvil: se abre desde cualquier lista. */}
            <HojaDeComprobante />
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

                En el ordenador, CAJAS redondeadas, como Spotify (lo propuso
                Cristian, octubre 2026): la barra lateral (y, en el Inicio, la
                caja del promedio), de cristal sobre el azul de la app con sus
                luces (`.marco-del-ordenador`, globals.css), y el contenido en
                una hoja clara con un halo suave.
            */}
            <BarraLateral
                menu={menu}
                logo={instituteConfig?.logo}
                // El nombre del liceo, el de su configuración: el de la sesión a
                // veces llega como el identificador («instituto-testing»).
                liceo={instituteConfig?.name || user?.institute?.name}
                nombre={user.firstName ?? ''}
                apellido={user.lastName ?? ''}
                correo={user.email}
                avatar={usuarioDeLaSesion?.avatar}
                rol={user?.role}
                alCerrarSesion={handleLogout}
            />

            <main
                className={cn(
                    'transicion-lateral min-h-screen lateral:ml-[calc(var(--ancho-lateral)+16px)] lateral:flex lateral:flex-col lateral:gap-2 lateral:pr-2 print:min-h-0 print:!m-0 print:!block print:!p-0',
                    esInicio
                        ? 'lateral:py-2 xl:lateral:my-2 xl:lateral:py-0 xl:lateral:h-[calc(100vh-16px)] xl:lateral:min-h-0'
                        : 'lateral:py-2'
                )}
            >
                {/* En el Inicio, el promedio y las cifras van en su caja azul (como en el
                    teléfono). En las demás pantallas no hay franja: la hoja empieza arriba
                    y el «?» y la campana viven en la barra. */}
                {esInicio && (
                    <div className={`hidden lateral:block shrink-0 print:!hidden ${CRISTAL}`}>
                        <FranjaDelInicio />
                    </div>
                )}
                {/* La hoja. Sin `overflow`, a propósito: las cabeceras pegadas
                    (`sticky`) de las tablas dejarían de pegarse. */}
                <div className={cn('lateral:flex-1 print:!rounded-none print:!bg-white print:!shadow-none', esInicio && 'xl:lateral:flex xl:lateral:flex-col xl:lateral:min-h-0')}>
                    {/* El hueco de abajo es la barra del teléfono MÁS la del
                        sistema: sin él, lo último de cada pantalla queda donde el
                        dedo pulsa la barra de gestos. */}
                    <div
                        data-marco
                        className={cn(
                            'mx-auto max-w-7xl pb-[calc(7rem+var(--zona-segura-abajo))] print:!p-0 print:max-w-none',
                            esInicio
                                ? 'px-4 py-6 sm:px-6 lateral:!m-0 lateral:!p-0 lateral:!w-full lateral:!max-w-none xl:lateral:flex-1 xl:lateral:flex xl:lateral:flex-col xl:lateral:min-h-0'
                                : 'px-4 py-6 sm:px-6 lg:px-8 lateral:max-w-[1600px] lateral:pb-6 lateral:pt-6'
                        )}
                    >
                        {!enMarco && <OfrecerAvisos />}
                        {/* En el navegador de un Android: la APK del liceo, la última. */}
                        {!enMarco && <DescargarLaApp />}
                        {children}
                    </div>
                </div>
            </main>

            {/* La barra de abajo: donde está el pulgar. */}
            <BarraInferiorMovil destinos={destinosDeLaBarra} />
            {/* «¿Cómo funciona?»: el globo que ilumina cada botón (rial). */}
            {!enMarco && <RecorridoGuiado />}
        </div>
    );
}
