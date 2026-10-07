'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Carril } from '@/components/ui/carril';

/**
 * PIEZA COMÚN DEL INICIO EN EL TELÉFONO (Fase C)
 *
 * Arriba, en azul y pegado a la cabecera: cifra destacada con toggle de ojo,
 * bloque secundario opcional, y dos tarjetas con barra de progreso.
 * Debajo, sobre una hoja que se monta 30px sobre el azul: carrusel infinito
 * de accesos rápidos y un hueco (slot) para los componentes específicos de cada rol.
 *
 * En el ordenador sigue el panel normal: esto es `lateral:hidden`.
 */

export const LLAVE_PROMEDIO_OCULTO = 'gestiedu:promedio-oculto';

export interface AccesoMovilItem {
    href: string;
    name: string;
    icon: React.ComponentType<{ className?: string }>;
}

export interface TarjetaMetricaMovil {
    titulo: string;
    valor: string | number;
    subtitulo: string;
    porcentajeBarra?: number; // 0 a 100
    colorBarra?: string; // color CSS o var(--acento)
    icono: React.ReactNode;
    href?: string;
}

export interface InicioMovilProps {
    tituloCifra?: string;
    cifra: number | null | string;
    sufijoCifra?: string;
    etiquetaSecundaria?: React.ReactNode;
    bloqueLateralCifra?: React.ReactNode;
    tarjetaIzquierda: TarjetaMetricaMovil;
    tarjetaDerecha: TarjetaMetricaMovil;
    accesos?: AccesoMovilItem[];
    children?: React.ReactNode;
    etiquetaAria?: string;
}

function AccesoBoton({ href, name, Icono }: { href: string; name: string; Icono: React.ComponentType<{ className?: string }> }) {
    return (
        <Link href={href} draggable={false} className="flex w-full flex-col items-center gap-2 text-center text-xs font-semibold text-[#33415C]">
            <span className="flex h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-white text-[#0D47A1] shadow-[0_1px_2px_rgba(13,71,161,0.08)]">
                <Icono className="h-6 w-6" aria-hidden />
            </span>
            <span className="w-full truncate">{name}</span>
        </Link>
    );
}

function TarjetaMetrica({ tarjeta }: { tarjeta: TarjetaMetricaMovil }) {
    const contenido = (
        <>
            <span className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                    {tarjeta.icono}
                    <span className="text-[13px] font-semibold">{tarjeta.titulo}</span>
                </span>
                {tarjeta.href && <ChevronRight className="h-4 w-4 text-[#90CAF9]" aria-hidden />}
            </span>
            <span className="flex flex-col gap-0.5">
                <span className="text-2xl font-extrabold tracking-[-0.5px]">{tarjeta.valor}</span>
                {tarjeta.porcentajeBarra !== undefined && (
                    <span aria-hidden className="my-1 h-1.5 overflow-hidden rounded-full bg-white/15">
                        <span
                            className="block h-full rounded-full transition-[width] duration-700 ease-suave"
                            style={{
                                width: `${Math.max(0, Math.min(100, tarjeta.porcentajeBarra))}%`,
                                backgroundColor: tarjeta.colorBarra || 'var(--acento)',
                            }}
                        />
                    </span>
                )}
                <span className="text-xs font-medium text-[#BBDEFB]">{tarjeta.subtitulo}</span>
            </span>
        </>
    );

    const clases =
        'flex flex-col gap-2.5 rounded-[20px] border border-white/[0.16] bg-white/10 p-3.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(4,24,64,0.25)] backdrop-blur-md transition-transform active:scale-[0.98]';

    if (tarjeta.href) {
        return (
            <Link href={tarjeta.href} className={clases}>
                {contenido}
            </Link>
        );
    }
    return <div className={clases}>{contenido}</div>;
}

export function InicioMovil({
    tituloCifra = 'Promedio general',
    cifra,
    sufijoCifra = '/ 20',
    etiquetaSecundaria,
    bloqueLateralCifra,
    tarjetaIzquierda,
    tarjetaDerecha,
    accesos = [],
    children,
    etiquetaAria = 'El liceo hoy',
}: InicioMovilProps) {
    const [oculto, setOculto] = React.useState(false);

    React.useEffect(() => {
        try {
            setOculto(localStorage.getItem(LLAVE_PROMEDIO_OCULTO) === '1');
        } catch {
            /* sin almacén */
        }
    }, []);

    const alternar = () => {
        setOculto((v) => {
            try {
                localStorage.setItem(LLAVE_PROMEDIO_OCULTO, v ? '0' : '1');
            } catch {
                /* sin almacén */
            }
            return !v;
        });
    };

    const valorFormateado = (() => {
        if (oculto) return '••.•';
        if (cifra === null || cifra === undefined || cifra === '') return '—';
        if (typeof cifra === 'number') return cifra.toFixed(1);
        return cifra;
    })();

    return (
        <div className="lateral:hidden">
            {/* EL AZUL: sigue a la cabecera */}
            <section
                aria-label={etiquetaAria}
                data-diseno="cabecera-azul"
                className="relative -mx-4 -mt-6 overflow-hidden bg-[linear-gradient(180deg,var(--azul-cabecera)_0%,#0B3F94_55%,#08326F_100%)] px-5 pb-[50px] pt-2 sm:-mx-6"
            >
                <h1 className="sr-only">Panel</h1>
                <span aria-hidden className="pointer-events-none absolute inset-0">
                    <span className="absolute -right-10 top-24 h-56 w-56 rounded-full bg-[#42A5F5] opacity-30 blur-3xl motion-safe:animate-flotar" />
                    <span className="absolute -left-20 bottom-4 h-48 w-48 rounded-full bg-[var(--acento)] opacity-20 blur-3xl motion-safe:animate-flotar [animation-delay:-7s]" />
                </span>

                <div className="relative flex flex-col gap-1.5">
                    <button
                        type="button"
                        onClick={alternar}
                        aria-pressed={oculto}
                        className="-ml-1 flex min-h-[44px] items-center gap-1.5 self-start px-1 text-sm font-semibold text-[#90CAF9]"
                    >
                        {tituloCifra}
                        {oculto ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        <span className="sr-only">{oculto ? '(oculto: tocar para ver)' : '(tocar para ocultar)'}</span>
                    </button>

                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[52px] font-extrabold leading-none tracking-[-1.5px] text-white" data-recorrido="inicio-cifras">
                            {valorFormateado}{' '}
                            {sufijoCifra && <span className="text-xl font-bold tracking-normal text-[#90CAF9]">{sufijoCifra}</span>}
                        </p>
                        {bloqueLateralCifra && <div className="shrink-0">{bloqueLateralCifra}</div>}
                    </div>

                    {etiquetaSecundaria && (
                        typeof etiquetaSecundaria === 'string' ? (
                            <p className="mt-1.5 self-start rounded-full bg-white/[0.14] px-3 py-1.5 text-xs font-semibold text-white">
                                {etiquetaSecundaria}
                            </p>
                        ) : (
                            etiquetaSecundaria
                        )
                    )}
                </div>

                {/* Dos tarjetas con barra */}
                <div className="relative mt-[18px] grid grid-cols-2 gap-3">
                    <TarjetaMetrica tarjeta={tarjetaIzquierda} />
                    <TarjetaMetrica tarjeta={tarjetaDerecha} />
                </div>
            </section>

            {/* LA HOJA: se monta 30 px sobre el azul */}
            <div className="relative -mx-4 -mt-[30px] flex flex-col gap-[18px] rounded-t-[28px] bg-gray-50 px-5 pt-[22px] sm:-mx-6">
                {/* Carrusel de accesos */}
                {accesos.length > 0 && (
                    <nav aria-label="Accesos rápidos" data-recorrido="accesos" className="-mx-5">
                        <Carril
                            etiqueta="Accesos rápidos"
                            bucle
                            conFlechas={false}
                            anchoDeCada="basis-[23.5%]"
                            hueco="gap-0"
                            className="[mask-image:linear-gradient(to_right,transparent,#000_3%,#000_92%,transparent)]"
                        >
                            {accesos.map((a) => (
                                <div key={a.href} className="px-0.5">
                                    <AccesoBoton href={a.href} name={a.name} Icono={a.icon} />
                                </div>
                            ))}
                        </Carril>
                    </nav>
                )}

                {/* Slot para el contenido inferior */}
                {children}
            </div>
        </div>
    );
}

/**
 * Esqueleto del Inicio móvil mientras cargan los datos.
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
