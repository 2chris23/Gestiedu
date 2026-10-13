'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { GraduationCap, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BACKEND_URL } from '@/config/env';
import type { DestinoDelMenu } from '@/lib/el-menu';
import { esElAtajoDeLaBarra, recogerLaBarra } from '@/lib/barra-lateral';
import { useBarraRecogida } from '@/hooks/useBarraRecogida';
import MiNombreYMenu from '@/components/layout/MiNombreYMenu';
import { BotonDelRecorrido } from '@/components/common/Recorrido';
import { Campana } from '@/components/layout/Campana';

/**
 * LA BARRA LATERAL DEL ORDENADOR (octubre 2026)
 *
 * Una de las cajas del ordenador (como Spotify): la barra, la del promedio en
 * el Inicio y la hoja clara del contenido, con las esquinas redondeadas; las
 * azules, de cristal sobre las luces del marco (`.marco-del-ordenador`).
 * Abajo, en una fila, recogerla, el «?» y la campana: la franja de arriba que
 * los llevaba se quitó (en las demás pantallas solo ocupaba sitio).
 *
 * Se recoge en una columna de iconos (`lib/barra-lateral.ts`). Todo dentro
 * mide lo mismo abierta y recogida —filas de 44 px, a 16 px del borde—, así
 * que recoger es solo estrechar: los iconos ya quedan centrados en 76 px y
 * los nombres, que tienen un ancho fijo, se desvanecen sin volver a partirse
 * en líneas a media animación. Siguen ahí para el lector de pantalla: el
 * enlace se llama igual abierta que recogida.
 *
 * La página activa lleva una pastilla blanca que se DESLIZA de una fila a la
 * otra: un solo elemento movido con `transform`. Sin framer-motion: hoy solo
 * lo carga la portada, y en el armazón bajaría con cada pantalla (CARGA-01).
 */

const PASO = 48; // 44 px de fila + 4 de hueco

/** Los tres botones de abajo: sobre el cristal, claros; al pasar, blancos. */
const ICONO_DE_ABAJO =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-transparent text-[#BBDEFB] outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60';

const NOMBRE = 'w-[176px] shrink-0 truncate transition-opacity duration-150 recogida:opacity-0';

export interface BarraLateralProps {
    menu: DestinoDelMenu[];
    logo?: string | null;
    liceo?: string;
    nombre: string;
    apellido: string;
    correo?: string;
    avatar?: string | null;
    rol: string;
    alCerrarSesion: () => void | Promise<void>;
}

export function BarraLateral({ menu, logo, liceo, nombre, apellido, correo, avatar, rol, alCerrarSesion }: BarraLateralProps) {
    const pathname = usePathname();
    const recogida = useBarraRecogida();
    const [globo, setGlobo] = React.useState<{ texto: string; y: number } | null>(null);

    // Ctrl+B (⌘B): recoger y abrir, sin animar (lo del teclado es inmediato).
    React.useEffect(() => {
        const alPulsar = (e: KeyboardEvent) => {
            if (!esElAtajoDeLaBarra(e)) return;
            e.preventDefault();
            recogerLaBarra(document.documentElement.dataset.lateral !== 'recogida', { alInstante: true });
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, []);

    // Al abrirla, ningún globo se queda colgado.
    React.useEffect(() => {
        if (!recogida) setGlobo(null);
    }, [recogida]);

    const activa = menu.findIndex((d) =>
        d.href === '/dashboard' ? pathname === '/dashboard' : pathname === d.href || pathname.startsWith(d.href + '/')
    );

    /** Recogida, el nombre de cada icono sale en un globo a la derecha (fijo: la lista se desplaza y lo recortaría). */
    const conGlobo = (texto: string) => ({
        onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
            if (!recogida) return;
            const r = e.currentTarget.getBoundingClientRect();
            setGlobo({ texto, y: r.top + r.height / 2 });
        },
        onPointerLeave: () => setGlobo(null),
        onFocus: (e: React.FocusEvent<HTMLElement>) => {
            if (!recogida) return;
            const r = e.currentTarget.getBoundingClientRect();
            setGlobo({ texto, y: r.top + r.height / 2 });
        },
        onBlur: () => setGlobo(null),
    });

    const logoDelLiceo = logo && logo.startsWith('/') ? (logo.startsWith('/uploads') ? `${BACKEND_URL}${logo}` : logo) : null;
    const textoDelBoton = recogida ? 'Mostrar la barra' : 'Ocultar la barra';

    return (
        <aside
            id="barra-lateral"
            aria-label="Barra lateral"
            className="transicion-lateral fixed inset-y-2 left-2 z-50 hidden w-[var(--ancho-lateral)] flex-col overflow-hidden rounded-[24px] border border-white/[0.14] bg-[var(--azul-cabecera)] shadow-[0_16px_48px_rgba(4,24,64,0.28)] lateral:flex print:!hidden"
        >
            {/* El liceo: su logo, grande, en una baldosa blanca (sobre azul, un escudo
                de colores se pierde). Sin el nombre: el logo ya lo dice (Cristian).
                Alineado en altura con la franja de promedio del Inicio (192 px); en una
                pantalla bajita, menor (`--logo-cabecera`, globals.css). */}
            <div className="flex h-[var(--logo-cabecera)] shrink-0 flex-col items-center justify-start pt-5 transition-[height,padding] duration-200 recogida:h-[76px] recogida:justify-center recogida:pt-0">
                <span
                    title={liceo}
                    className="flex h-[var(--logo-baldosa)] w-[var(--logo-baldosa)] shrink-0 items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-[0_8px_24px_rgba(4,24,64,0.35)] transition-[width,height,border-radius] duration-200 recogida:h-11 recogida:w-11 recogida:rounded-[14px]"
                >
                    {logoDelLiceo ? (
                        <Image
                            src={logoDelLiceo}
                            alt={liceo ? `Logo de ${liceo}` : 'Logo del liceo'}
                            width={128}
                            height={128}
                            className="h-[calc(var(--logo-baldosa)-26px)] w-[calc(var(--logo-baldosa)-26px)] object-contain transition-[width,height] duration-200 recogida:h-9 recogida:w-9"
                            unoptimized
                        />
                    ) : (
                        <GraduationCap className="h-16 w-16 text-[#0D47A1] recogida:h-6 recogida:w-6" aria-label={liceo ?? 'Liceo'} />
                    )}
                </span>
            </div>

            {/* El menú: lo de cada rol (`lib/el-menu.ts`). */}
            <nav aria-label="Menú principal" data-recorrido="menu" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-2 [scrollbar-width:none]">
                <ul className="relative flex flex-col gap-1">
                    {activa >= 0 && (
                        <li
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 h-11 rounded-[14px] bg-white shadow-[0_2px_10px_rgba(4,24,64,0.22)] transition-transform duration-200 ease-suave motion-reduce:transition-none"
                            style={{ transform: `translateY(${activa * PASO}px)` }}
                        />
                    )}
                    {menu.map((item, i) => {
                        const esLaActiva = i === activa;
                        const Icono = item.icon;
                        return (
                            <li key={item.href} className="relative">
                                <Link
                                    href={item.href}
                                    aria-current={esLaActiva ? 'page' : undefined}
                                    {...conGlobo(item.name)}
                                    className={cn(
                                        'flex h-11 items-center gap-3 rounded-[14px] px-3 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70',
                                        esLaActiva ? 'font-extrabold text-[#0B1B33]' : 'font-semibold text-[#BBDEFB] hover:bg-white/10 hover:text-white'
                                    )}
                                >
                                    <Icono
                                        className={cn('h-5 w-5 shrink-0', esLaActiva && 'text-[var(--acento-hondo)]')}
                                        strokeWidth={esLaActiva ? 2.3 : 2}
                                        aria-hidden
                                    />
                                    <span className={NOMBRE}>{item.name}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Abajo: recoger la barra, y tu nombre con su menú. */}
            <div className="shrink-0 border-t border-white/[0.12] px-4 pb-4 pt-2">
                {/* Recoger la barra, el «?» y los avisos: una fila de iconos (una columna, recogida). */}
                <div className="mb-1.5 flex items-center gap-1 recogida:flex-col">
                    <button
                        type="button"
                        onClick={() => recogerLaBarra(!recogida)}
                        aria-controls="barra-lateral"
                        aria-expanded={!recogida}
                        aria-label={textoDelBoton}
                        title={`${textoDelBoton} (Ctrl+B)`}
                        {...conGlobo(textoDelBoton)}
                        className={`${ICONO_DE_ABAJO} recogida:order-last`}
                    >
                        {recogida ? <PanelLeftOpen className="h-5 w-5" aria-hidden /> : <PanelLeftClose className="h-5 w-5" aria-hidden />}
                    </button>
                    <span className="flex-1 recogida:hidden" />
                    <BotonDelRecorrido className={ICONO_DE_ABAJO} />
                    <Campana className={ICONO_DE_ABAJO} lado="right" />
                </div>
                <MiNombreYMenu
                    nombre={nombre}
                    apellido={apellido}
                    correo={correo}
                    avatar={avatar}
                    rol={rol}
                    liceo={liceo}
                    recogida={recogida}
                    alCerrarSesion={alCerrarSesion}
                />
            </div>

            {globo && recogida && (
                <span
                    aria-hidden
                    data-globo-lateral
                    className="pointer-events-none fixed left-[92px] z-[60] -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0B1B33] px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
                    style={{ top: globo.y }}
                >
                    {globo.texto}
                </span>
            )}
        </aside>
    );
}

export default BarraLateral;
