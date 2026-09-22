'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LA BARRA DE ABAJO, EN EL TELÉFONO
 *
 * Tres cosas: **Inicio en el centro**, con una casita, y un destino a cada
 * lado. Abajo, donde está el pulgar.
 *
 * Antes en el centro había un botón de «Menú» que abría una cortina lateral
 * con todo. Eran cinco cosas en 390 px, y el sitio de honor —el del medio, el
 * más grande, el que se pulsa sin mirar— lo ocupaba un cajón de sastre en vez
 * de la pantalla a la que todo el mundo vuelve. Ahora lo que estaba en la
 * cortina vive en el propio panel de inicio, así que la cortina sobra.
 *
 * ─── DETALLES QUE SE ROMPIERON Y NO DAN ERROR ───────────────────────────────
 *
 *  · **Se esconde al bajar** y vuelve al subir: una barra fija se come 60 px
 *    de una pantalla que ya es pequeña. Pero no se esconde del TODO: se queda
 *    la franja de la barra de gestos del teléfono (`--zona-segura-abajo`), para
 *    que ahí siempre haya algo opaco y el contenido no aparezca por debajo del
 *    sistema. En un teléfono sin esa barra, esa franja vale cero y desaparece
 *    entera.
 *  · Cada botón mide 44 px de alto: menos que eso, el dedo falla.
 *  · En pantalla grande no existe: ahí está la barra lateral.
 */

export interface DestinoDeLaBarra {
    name: string;
    href: string;
    icon: LucideIcon;
}

interface Props {
    /** Los dos destinos de los lados. El primero va a la izquierda. */
    destinos: DestinoDeLaBarra[];
}

/** Lo que hay que bajar para que se esconda: menos que esto es un temblor. */
const UMBRAL = 12;

export function BarraInferiorMovil({ destinos }: Props) {
    const pathname = usePathname();
    const [escondida, setEscondida] = React.useState(false);

    React.useEffect(() => {
        let ultimo = window.scrollY;
        let pedido = 0;

        const alDesplazar = () => {
            if (pedido) return;
            pedido = window.requestAnimationFrame(() => {
                pedido = 0;
                const ahora = window.scrollY;
                const diferencia = ahora - ultimo;
                if (Math.abs(diferencia) < UMBRAL) return;
                // Arriba del todo siempre se ve: si no, al llegar al principio
                // la barra se queda escondida y parece que ha desaparecido.
                setEscondida(ahora > 80 && diferencia > 0);
                ultimo = ahora;
            });
        };

        window.addEventListener('scroll', alDesplazar, { passive: true });
        return () => {
            window.removeEventListener('scroll', alDesplazar);
            if (pedido) window.cancelAnimationFrame(pedido);
        };
    }, []);

    // Al cambiar de pantalla, la barra vuelve: se llega arriba del todo.
    React.useEffect(() => setEscondida(false), [pathname]);

    const esElActivo = (href: string) =>
        href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

    const izquierda = destinos[0];
    const derecha = destinos[1];
    const enInicio = pathname === '/dashboard';

    const Boton = ({ destino }: { destino?: DestinoDeLaBarra }) => {
        if (!destino) return <span className="flex-1" aria-hidden />;
        const activo = esElActivo(destino.href);
        const Icono = destino.icon;
        return (
            <Link
                href={destino.href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                    'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-semibold transition-colors',
                    activo ? 'text-indigo-700' : 'text-gray-600'
                )}
            >
                <Icono className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate">{destino.name}</span>
            </Link>
        );
    };

    return (
        <nav
            aria-label="Navegación principal"
            className={cn(
                'zona-segura-abajo fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-1px_8px_rgba(15,23,42,0.06)] transition-transform duration-200 ease-out lg:hidden'
            )}
            style={
                escondida
                    ? { transform: 'translateY(calc(100% - var(--zona-segura-abajo)))' }
                    : undefined
            }
        >
            <div className="mx-auto flex max-w-xl items-end justify-between px-2">
                <Boton destino={izquierda} />

                {/* El centro: Inicio, que es donde está todo lo demás. */}
                <Link
                    href="/dashboard"
                    aria-current={enInicio ? 'page' : undefined}
                    aria-label="Inicio"
                    className="flex min-h-[52px] min-w-[72px] flex-col items-center justify-end px-1 pb-1.5"
                >
                    <span
                        className={cn(
                            'flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full shadow-lg ring-4 ring-white transition-colors',
                            enInicio ? 'bg-indigo-700' : 'bg-indigo-600'
                        )}
                    >
                        <Home className="h-6 w-6 text-white" aria-hidden />
                    </span>
                    <span className="-mt-2.5 text-xs font-semibold text-gray-800">Inicio</span>
                </Link>

                <Boton destino={derecha} />
            </div>
        </nav>
    );
}

export default BarraInferiorMovil;
