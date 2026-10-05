'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Eye, EyeOff, CalendarCheck } from 'lucide-react';
import { losAccesosDe } from '@/lib/el-menu';
import { CuadroDeHonorWidget } from '@/components/dashboard/widgets';
import { Carril } from '@/components/ui/carril';

/**
 * EL INICIO DEL ADMIN EN EL TELÉFONO (diseño «Panel Admin — App móvil», 2026-10-05)
 *
 * Arriba, en azul y pegado a la cabecera: el promedio del liceo, el ciclo, y
 * asistencia y alumnos en riesgo. Debajo, sobre una hoja que se monta en el
 * azul: los accesos, lo de hoy y el cuadro de honor. El acento (botón de
 * Inicio, los iconos redondos, la franja de hoy) es el que cada uno elige en
 * «Mi cuenta» (`lib/tema-de-la-app.ts`).
 *
 * En el ordenador sigue el Inicio de siempre: esto es `lateral:hidden`.
 */

export interface DatosDelInicioMovil {
    promedioGeneral: number | null;
    ciclo: string | null;
    estudiantes: number;
    asistencia: number;
    enRiesgo: number;
    actividadesDeHoy: number;
    hoyLeido: string;
    lapso: string | null;
}

// Los cuatro del diseño van primero; los demás siguen en el carrusel sin fin.
const PRIMERO = ['/dashboard/academico', '/dashboard/horarios', '/dashboard/pagos', '/dashboard/eventos'];
const LLAVE_OCULTO = 'gestiedu:promedio-oculto';

function Acceso({ href, name, Icono }: { href: string; name: string; Icono: React.ComponentType<{ className?: string }> }) {
    return (
        <Link href={href} draggable={false} className="flex w-full flex-col items-center gap-2 text-center text-xs font-semibold text-[#33415C]">
            <span className="flex h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-white text-[#0D47A1] shadow-[0_1px_2px_rgba(13,71,161,0.08)]">
                <Icono className="h-6 w-6" aria-hidden />
            </span>
            <span className="w-full truncate">{name}</span>
        </Link>
    );
}

export function InicioDelAdminMovil({ datos, conPagos }: { datos: DatosDelInicioMovil; conPagos: boolean }) {
    const [oculto, setOculto] = React.useState(false);
    React.useEffect(() => {
        try {
            setOculto(localStorage.getItem(LLAVE_OCULTO) === '1');
        } catch {
            /* sin almacén */
        }
    }, []);
    const alternar = () => {
        setOculto((v) => {
            try {
                localStorage.setItem(LLAVE_OCULTO, v ? '0' : '1');
            } catch {
                /* sin almacén */
            }
            return !v;
        });
    };

    const accesos = losAccesosDe('ADMIN', conPagos);
    const ordenados = [
        ...(PRIMERO.map((h) => accesos.find((a) => a.href === h)).filter(Boolean) as typeof accesos),
        ...accesos.filter((a) => !PRIMERO.includes(a.href)),
    ];

    return (
        <div className="lateral:hidden">
            {/* EL AZUL: sigue a la cabecera (que en el Inicio también es azul). */}
            <section
                aria-label="El liceo hoy"
                data-diseno="cabecera-azul"
                className="relative -mx-4 -mt-6 overflow-hidden bg-[linear-gradient(180deg,var(--azul-cabecera)_0%,#0B3F94_55%,#08326F_100%)] px-5 pb-[50px] pt-2 sm:-mx-6"
            >
                <h1 className="sr-only">Panel</h1>
                {/*
                    LAS LUCES: dos manchas difusas que flotan despacio (una con el
                    acento elegido) y un anillo ENTERO que gira con un degradado.
                    El anillo de antes asomaba cortado por la esquina. Quieto con
                    «reducir movimiento».
                */}
                <span aria-hidden className="pointer-events-none absolute inset-0">
                    <span className="absolute -right-10 top-24 h-56 w-56 rounded-full bg-[#42A5F5] opacity-30 blur-3xl motion-safe:animate-flotar" />
                    <span className="absolute -left-20 bottom-4 h-48 w-48 rounded-full bg-[var(--acento)] opacity-20 blur-3xl motion-safe:animate-flotar [animation-delay:-7s]" />
                    <span className="absolute right-5 top-4 h-[132px] w-[132px] rounded-full p-[14px] opacity-60 [background:conic-gradient(from_0deg,rgba(144,202,249,0)_0%,rgba(144,202,249,0.55)_35%,var(--acento)_60%,rgba(144,202,249,0)_100%)] [mask:radial-gradient(farthest-side,transparent_calc(100%-14px),#000_calc(100%-13px))] motion-safe:animate-girar" />
                    <span className="absolute right-[53px] top-[49px] h-[66px] w-[66px] rounded-full border border-white/10" />
                </span>
                <div className="relative flex flex-col gap-1.5">
                    <button
                        type="button"
                        onClick={alternar}
                        aria-pressed={oculto}
                        className="-ml-1 flex min-h-[44px] items-center gap-1.5 self-start px-1 text-sm font-semibold text-[#90CAF9]"
                    >
                        Promedio general
                        {oculto ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        <span className="sr-only">{oculto ? '(oculto: tocar para ver)' : '(tocar para ocultar)'}</span>
                    </button>
                    <p className="text-[52px] font-extrabold leading-none tracking-[-1.5px] text-white" data-recorrido="inicio-cifras">
                        {oculto ? '••.•' : datos.promedioGeneral !== null ? datos.promedioGeneral.toFixed(1) : '—'}{' '}
                        <span className="text-xl font-bold tracking-normal text-[#90CAF9]">/ 20</span>
                    </p>
                    <p className="mt-1.5 self-start rounded-full bg-white/[0.14] px-3 py-1.5 text-xs font-semibold text-white">
                        {[datos.ciclo ? `Ciclo ${datos.ciclo}` : 'Sin ciclo activo', `${datos.estudiantes} estudiantes`].join(' · ')}
                    </p>
                </div>

                <div className="relative mt-[18px] grid grid-cols-2 gap-3">
                    <Link
                        href="/dashboard/academico"
                        className="flex flex-col gap-2.5 rounded-[20px] border border-white/[0.16] bg-white/10 p-3.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(4,24,64,0.25)] backdrop-blur-md transition-transform active:scale-[0.98]"
                    >
                        <span className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                                    <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                                </span>
                                <span className="text-[13px] font-semibold">Asistencia</span>
                            </span>
                            <ChevronRight className="h-4 w-4 text-[#90CAF9]" aria-hidden />
                        </span>
                        <span className="flex flex-col gap-0.5">
                            <span className="text-2xl font-extrabold tracking-[-0.5px]">{datos.asistencia}%</span>
                            <span aria-hidden className="my-1 h-1.5 overflow-hidden rounded-full bg-white/15">
                                <span
                                    className="block h-full rounded-full bg-[var(--acento)] transition-[width] duration-700 ease-suave"
                                    style={{ width: `${Math.max(0, Math.min(100, datos.asistencia))}%` }}
                                />
                            </span>
                            <span className="text-xs font-medium text-[#BBDEFB]">Últimos 30 días</span>
                        </span>
                    </Link>
                    <Link
                        href="/dashboard/academico"
                        className="flex flex-col gap-2.5 rounded-[20px] border border-white/[0.16] bg-white/10 p-3.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(4,24,64,0.25)] backdrop-blur-md transition-transform active:scale-[0.98]"
                    >
                        <span className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EF5350] text-sm font-extrabold text-white" aria-hidden>
                                    !
                                </span>
                                <span className="text-[13px] font-semibold">En riesgo</span>
                            </span>
                            <ChevronRight className="h-4 w-4 text-[#90CAF9]" aria-hidden />
                        </span>
                        <span className="flex flex-col gap-0.5">
                            <span className="text-2xl font-extrabold tracking-[-0.5px]">{datos.enRiesgo}</span>
                            <span aria-hidden className="my-1 h-1.5 overflow-hidden rounded-full bg-white/15">
                                <span
                                    className="block h-full rounded-full bg-[#EF5350] transition-[width] duration-700 ease-suave"
                                    style={{ width: `${datos.estudiantes > 0 ? Math.min(100, (datos.enRiesgo / datos.estudiantes) * 100) : 0}%` }}
                                />
                            </span>
                            <span className="text-xs font-medium text-[#BBDEFB]">Con materias reprobadas</span>
                        </span>
                    </Link>
                </div>
            </section>

            {/* LA HOJA: se monta 30 px sobre el azul. */}
            <div className="relative -mx-4 -mt-[30px] flex flex-col gap-[18px] rounded-t-[28px] bg-gray-50 px-5 pt-[22px] sm:-mx-6">
                {/*
                    Los accesos, en un carrusel SIN FIN: se arrastra de lado y al
                    pasar el último vuelve el primero (Embla, `bucle`). Asoma
                    medio acceso a la derecha para que se vea que hay más.
                */}
                <nav aria-label="Accesos rápidos" data-recorrido="accesos" className="-mx-5">
                    <Carril
                        etiqueta="Accesos rápidos"
                        bucle
                        conFlechas={false}
                        anchoDeCada="basis-[23.5%]"
                        hueco="gap-0"
                        className="[mask-image:linear-gradient(to_right,transparent,#000_3%,#000_92%,transparent)]"
                    >
                        {ordenados.map((a) => (
                            <div key={a.href} className="px-0.5">
                                <Acceso href={a.href} name={a.name} Icono={a.icon} />
                            </div>
                        ))}
                    </Carril>
                </nav>

                <div className="flex items-center gap-3 rounded-[18px] bg-[var(--acento-suave)] py-3 pl-3.5 pr-3" data-recorrido="calendario-del-liceo">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                        <CalendarCheck className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-extrabold text-[#0B1B33]">
                            {datos.actividadesDeHoy === 0
                                ? 'Nada programado hoy'
                                : `${datos.actividadesDeHoy} ${datos.actividadesDeHoy === 1 ? 'actividad' : 'actividades'} para hoy`}
                        </span>
                        <span className="truncate text-xs font-semibold text-[var(--acento-hondo)] first-letter:uppercase">
                            {[datos.hoyLeido, datos.lapso].filter(Boolean).join(' · ')}
                        </span>
                    </span>
                    <Link
                        href="/dashboard/eventos"
                        className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-white px-[18px] text-sm font-extrabold text-[#0D47A1]"
                    >
                        Ver <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                    </Link>
                </div>

                <div data-recorrido="cuadro-de-honor">
                    <CuadroDeHonorWidget />
                </div>
            </div>
        </div>
    );
}

/**
 * Mientras llegan las cifras: el mismo azul y la misma hoja, con barras que
 * laten. Antes salía el esqueleto del ordenador, en gris, y al cargar todo
 * saltaba a azul.
 */
export function EsqueletoDelInicioMovil() {
    const barra = 'rounded-full motion-safe:animate-latir';
    return (
        <div className="lateral:hidden" aria-busy="true" aria-label="Cargando el Inicio">
            <div className="-mx-4 -mt-6 bg-[linear-gradient(180deg,var(--azul-cabecera)_0%,#0B3F94_55%,#08326F_100%)] px-5 pb-[50px] pt-4 sm:-mx-6">
                <div className={`h-4 w-32 bg-white/20 ${barra}`} />
                <div className={`mt-4 h-12 w-40 bg-white/20 ${barra}`} />
                <div className={`mt-4 h-7 w-56 bg-white/[0.14] ${barra}`} />
                <div className="mt-[18px] grid grid-cols-2 gap-3">
                    <div className="h-[132px] rounded-[20px] bg-white/10 motion-safe:animate-latir" />
                    <div className="h-[132px] rounded-[20px] bg-white/10 motion-safe:animate-latir" />
                </div>
            </div>
            <div className="relative -mx-4 -mt-[30px] rounded-t-[28px] bg-gray-50 px-5 pt-[22px] sm:-mx-6">
                <div className="flex gap-3">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex flex-1 flex-col items-center gap-2">
                            <div className="h-[58px] w-[58px] rounded-[20px] bg-white motion-safe:animate-latir" />
                            <div className={`h-3 w-14 bg-gray-200 ${barra}`} />
                        </div>
                    ))}
                </div>
                <div className="mt-[18px] h-16 rounded-[18px] bg-[var(--acento-suave)] motion-safe:animate-latir" />
                <div className="mt-[18px] h-64 rounded-[24px] bg-white motion-safe:animate-latir" />
            </div>
        </div>
    );
}

export default InicioDelAdminMovil;
