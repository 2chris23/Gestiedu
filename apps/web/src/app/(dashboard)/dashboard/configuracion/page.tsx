'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft,
    Bell,
    Building2,
    ChevronRight,
    FileText,
    GraduationCap,
    KeyRound,
    LogOut,
    Palette,
    QrCode,
    Search,
    Shield,
    SwatchBook,
    UtensilsCrossed,
    Wallet,
    X,
    type LucideIcon,
} from 'lucide-react';
import { GeneralSettings } from './components/GeneralSettings';
import { diferido } from '@/components/common/Diferido';
import ColorYModo from '@/components/configuracion/ColorYModo';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useCerrarSesion } from '@/hooks/useCerrarSesion';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// Cada apartado baja al abrirlo (carga diferida), no con la pantalla.
const AppearanceSettings = diferido(() => import('./components/AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })), { alto: 480 });
const AcademicSettings = diferido(() => import('./components/AcademicSettings').then((m) => ({ default: m.AcademicSettings })), { alto: 480 });
const NotificationSettings = diferido(() => import('./components/NotificationSettings').then((m) => ({ default: m.NotificationSettings })), { alto: 480 });
const SecuritySettings = diferido(() => import('./components/SecuritySettings').then((m) => ({ default: m.SecuritySettings })), { alto: 480 });
const PaymentSettings = diferido(() => import('./components/PaymentSettings').then((m) => ({ default: m.PaymentSettings })), { alto: 480 });
const DocumentSettings = diferido(() => import('./components/DocumentSettings').then((m) => ({ default: m.DocumentSettings })), { alto: 480 });
const PaeSettings = diferido(() => import('./components/PaeSettings').then((m) => ({ default: m.PaeSettings })), { alto: 360 });
const QrSettings = diferido(() => import('./components/QrSettings').then((m) => ({ default: m.QrSettings })), { alto: 480 });
const ContrasenaYAcceso = diferido(() => import('@/components/configuracion/ContrasenaYAcceso').then((m) => ({ default: m.ContrasenaYAcceso })), { alto: 360 });

/**
 * CONFIGURACIÓN, COMO LA DE RIAL (Cristian, 14-oct-2026)
 *
 * Un buscador, el título y cada apartado en su fila (icono, nombre, qué hay
 * dentro y la flecha), agrupados en tarjetas: lo TUYO (la contraseña, la
 * huella, el color) para todo el mundo y lo DEL LICEO solo para el admin.
 * Al tocar uno se ve ese apartado solo (`?seccion=`), con su flecha para
 * volver; así la flecha del teléfono también vuelve a la lista.
 *
 * En el ordenador hay sitio para los dos: la lista a la izquierda y el
 * apartado a la derecha (Información General, de entrada, para el admin).
 *
 * Lo tuyo vivía en la ficha de Mi cuenta, que «tenía demasiadas cosas»: la
 * ficha trae ahora solo Configuración y Cerrar sesión. Lo del liceo lo
 * protege el servidor; aquí solo no se le enseña a quien no es admin.
 */
interface Apartado {
    id: string;
    nombre: string;
    pista: string;
    /** Palabras que también lo encuentran en el buscador. */
    otras: string;
    icono: LucideIcon;
}

const DE_LA_PERSONA: Apartado[] = [
    { id: 'acceso', nombre: 'Contraseña y acceso', pista: 'Tu contraseña, la huella y tus sesiones', otras: 'seguridad clave pin sesiones biometria', icono: KeyRound },
    { id: 'color', nombre: 'Color y modo', pista: 'El color de la app, claro u oscuro', otras: 'apariencia tema oscuro claro', icono: SwatchBook },
];

const DEL_LICEO: Apartado[] = [
    { id: 'general', nombre: 'Información General', pista: 'Nombre, contacto y datos del Ministerio', otras: 'dea direccion telefono plantel municipio', icono: Building2 },
    { id: 'appearance', nombre: 'Apariencia', pista: 'Logo, escudo y colores', otras: 'logo escudo colores favicon', icono: Palette },
    { id: 'academic', nombre: 'Configuración Académica', pista: 'Notas, lapsos, horario y fin de año', otras: 'notas escala lapsos horario cuadro de honor pendiente labor social', icono: GraduationCap },
    { id: 'documents', nombre: 'Documentos', pista: 'Constancias, firma y recaudos', otras: 'constancia firma recaudos plantillas', icono: FileText },
    { id: 'payments', nombre: 'Pagos', pista: 'Cuotas, monedas y vencimientos', otras: 'finanzas cuotas monedas becas mora', icono: Wallet },
    { id: 'pae', nombre: 'Comedor (PAE)', pista: 'Activar y ajustar el comedor', otras: 'comedor pae', icono: UtensilsCrossed },
    { id: 'qr', nombre: 'Asistencia por QR', pista: 'Escanear para pasar lista', otras: 'qr asistencia faro', icono: QrCode },
    { id: 'notifications', nombre: 'Notificaciones', pista: 'Qué avisos se envían', otras: 'avisos notificaciones', icono: Bell },
    { id: 'security', nombre: 'Seguridad', pista: 'Sesión, contraseñas e intentos', otras: 'sesiones tiempo de espera', icono: Shield },
];

const CONTENIDO: Record<string, React.ComponentType> = {
    general: GeneralSettings,
    appearance: AppearanceSettings,
    academic: AcademicSettings,
    documents: DocumentSettings,
    payments: PaymentSettings,
    pae: PaeSettings,
    qr: QrSettings,
    notifications: NotificationSettings,
    security: SecuritySettings,
};

/** «Contraseña» encuentra «contrasena»: sin tildes ni mayúsculas. */
const plano = (t: string) =>
    t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

export default function ConfiguracionPage() {
    return (
        <React.Suspense fallback={null}>
            <Configuracion />
        </React.Suspense>
    );
}

function Configuracion() {
    const router = useRouter();
    const params = useSearchParams();
    const { yo } = useQuienSoy();
    const { user } = useAuthStore();
    // El rol sale del almacén del navegador: en el HTML del servidor aún no
    // está, y pintar lo del liceo antes de arrancar no cuadraría al hidratar.
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => setMontado(true), []);
    const esAdmin = montado && yo?.role === 'ADMIN';
    const [busqueda, setBusqueda] = React.useState('');
    const cerrarSesion = useCerrarSesion();

    const grupos = React.useMemo(
        () => [
            { id: 'tuyo', nombre: 'Tu cuenta', apartados: DE_LA_PERSONA },
            ...(esAdmin ? [{ id: 'liceo', nombre: 'El liceo', apartados: DEL_LICEO }] : []),
        ],
        [esAdmin]
    );
    const todos = grupos.flatMap((g) => g.apartados);
    const pedido = params.get('seccion');
    // Lo pedido, si es de quien mira. En el ordenador siempre hay uno abierto.
    const abierto = todos.find((a) => a.id === pedido) ?? null;
    const enElOrdenador = abierto ?? (montado && yo ? todos.find((a) => a.id === (esAdmin ? 'general' : 'acceso')) : null) ?? null;

    const q = plano(busqueda.trim());
    const filtrados = grupos
        .map((g) => ({ ...g, apartados: q ? g.apartados.filter((a) => plano(`${a.nombre} ${a.pista} ${a.otras}`).includes(q)) : g.apartados }))
        .filter((g) => g.apartados.length > 0);

    const abrir = (id: string) => router.push(`/dashboard/configuracion?seccion=${id}`);
    const nombreCompleto = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Usuario';

    return (
        <div className="lateral:grid lateral:grid-cols-[minmax(300px,380px)_1fr] lateral:items-start lateral:gap-6">
            {/* LA LISTA. En el teléfono se esconde con un apartado abierto. */}
            <div className={cn('space-y-5', abierto && 'hidden lateral:block')}>
                <div className="space-y-4" data-recorrido="pantalla">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        aria-label="Volver"
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 active:bg-gray-100 lateral:hidden"
                    >
                        <ArrowLeft className="h-5 w-5" aria-hidden />
                    </button>
                    <label className="flex min-h-[52px] items-center gap-3 rounded-full bg-white px-4 shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-indigo-500">
                        <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                        <span className="sr-only">Buscar configuración</span>
                        <input
                            type="search"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar configuración"
                            className="min-h-[44px] min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden"
                        />
                        {busqueda && (
                            <button
                                type="button"
                                onClick={() => setBusqueda('')}
                                aria-label="Borrar la búsqueda"
                                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-500"
                            >
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        )}
                    </label>
                    <h1 className="px-1 text-seccion font-bold text-gray-900 sm:text-pantalla">Configuración</h1>
                </div>

                {filtrados.map((g) => (
                    <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="space-y-2">
                        <h2 id={`grupo-${g.id}`} className="px-2 text-sm font-semibold text-gray-600">
                            {g.nombre}
                        </h2>
                        <ul className="divide-y divide-gray-200 overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-gray-200">
                            {g.apartados.map((a) => {
                                const Icono = a.icono;
                                const activo = enElOrdenador?.id === a.id;
                                return (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={() => abrir(a.id)}
                                            data-pestana
                                            data-recorrido={`config-${a.id}`}
                                            aria-label={a.nombre}
                                            aria-describedby={`pista-${a.id}`}
                                            aria-current={abierto?.id === a.id ? 'page' : undefined}
                                            className={cn(
                                                'flex min-h-[68px] w-full items-center gap-4 px-5 py-3 text-left transition-colors active:bg-gray-100',
                                                activo && 'lateral:bg-indigo-50'
                                            )}
                                        >
                                            <Icono className={cn('h-6 w-6 shrink-0 text-gray-800', activo && 'lateral:text-indigo-700')} aria-hidden />
                                            <span className="min-w-0 flex-1">
                                                <span className={cn('block text-base text-gray-900', activo && 'lateral:font-semibold lateral:text-indigo-800')}>{a.nombre}</span>
                                                <span id={`pista-${a.id}`} className="block text-sm text-gray-600">
                                                    {a.pista}
                                                </span>
                                            </span>
                                            <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
                {filtrados.length === 0 && (
                    <p className="rounded-[24px] bg-white px-5 py-6 text-center text-sm text-gray-600 ring-1 ring-gray-200">
                        Nada con «{busqueda.trim()}».
                    </p>
                )}

                {/* Como Rial: lo que saca de la cuenta va al final, en rojo, y
                    debajo la marca de la app con su versión. */}
                {!q && (
                    <ul className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-gray-200">
                        <li>
                            <button
                                type="button"
                                onClick={() => void cerrarSesion()}
                                className="flex min-h-[68px] w-full items-center gap-4 px-5 py-3 text-left transition-colors active:bg-red-50"
                            >
                                <LogOut className="h-6 w-6 shrink-0 text-red-600" aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-base text-gray-900">Cerrar sesión</span>
                                    <span className="block text-sm text-gray-600">Sales de la app en este aparato</span>
                                </span>
                                <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                            </button>
                        </li>
                    </ul>
                )}
                <MarcaYVersion />
            </div>

            {/* EL APARTADO ABIERTO. En el teléfono, solo con uno elegido. */}
            {enElOrdenador && (
                <div className={cn('min-w-0 space-y-5', !abierto && 'hidden lateral:block')}>
                    {/* Como Rial: la flecha redonda a la izquierda y el nombre en medio. */}
                    <div className="relative flex min-h-[48px] items-center justify-center px-14 lateral:justify-start lateral:px-0">
                        <Link
                            href="/dashboard/configuracion"
                            aria-label="Volver a Configuración"
                            className="absolute left-0 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 active:bg-gray-100 lateral:hidden"
                        >
                            <ArrowLeft className="h-5 w-5" aria-hidden />
                        </Link>
                        <h2 className="truncate text-center text-lg font-bold text-gray-900 lateral:text-2xl">{enElOrdenador.nombre}</h2>
                    </div>
                    <p className="hidden text-sm text-gray-600 lateral:-mt-3 lateral:block">{enElOrdenador.pista}</p>
                    <Contenido id={enElOrdenador.id} nombreCompleto={nombreCompleto} />
                </div>
            )}
        </div>
    );
}

function Contenido({ id, nombreCompleto }: { id: string; nombreCompleto: string }) {
    if (id === 'acceso') return <ContrasenaYAcceso nombreCompleto={nombreCompleto} />;
    if (id === 'color') return <ColorYModo />;
    const Componente = CONTENIDO[id];
    return <Componente />;
}

/** La versión de la APK (Capacitor); en el navegador no hay número que dar. */
function useVersionDeLaApp(): string | null {
    const [version, setVersion] = React.useState<string | null>(null);
    React.useEffect(() => {
        const app = (window as unknown as { Capacitor?: { Plugins?: { App?: { getInfo?: () => Promise<{ version: string }> } } } }).Capacitor?.Plugins?.App;
        if (!app?.getInfo) return;
        Promise.resolve(app.getInfo())
            .then((i) => setVersion(i.version))
            .catch(() => undefined);
    }, []);
    return version;
}

function MarcaYVersion() {
    const version = useVersionDeLaApp();
    return (
        <footer className="flex flex-col items-center gap-1 pb-2 pt-4 text-center">
            <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/favicon.svg" alt="" width={28} height={28} className="h-7 w-7" />
                <span className="text-xl font-bold tracking-tight text-gray-900">Gestiedu</span>
            </span>
            <span className="text-sm text-gray-600">{version ? `Versión ${version}` : 'Versión web'}</span>
        </footer>
    );
}
