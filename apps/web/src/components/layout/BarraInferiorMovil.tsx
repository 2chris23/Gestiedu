'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LA BARRA DE ABAJO, EN EL TELÉFONO
 *
 * **Inicio en el centro**, con una casita, y a cada lado lo que ese rol abre
 * todos los días: dos por lado para el personal (cinco en total), uno por
 * lado para el alumno y el representante, que no tienen más pantallas que
 * esas. Lo que se elige vive en `lib/el-menu.ts` (`losDeLaBarra`).
 *
 * Antes en el centro había un botón de «Menú» que abría una cortina lateral
 * con todo; el sitio de honor —el del medio, el más grande, el que se pulsa
 * sin mirar— lo ocupaba un cajón de sastre en vez de la pantalla a la que
 * todo el mundo vuelve.
 *
 * ─── DETALLES QUE SE ROMPIERON Y NO DAN ERROR ───────────────────────────────
 *
 *  · **Se esconde al bajar** y vuelve al subir: una barra fija se come 60 px
 *    de una pantalla que ya es pequeña. No se esconde del TODO: se queda la
 *    franja de la barra de gestos del teléfono (`--zona-segura-abajo`), para
 *    que ahí siempre haya algo opaco. En un teléfono sin esa barra, esa franja
 *    vale cero y desaparece entera.
 *  · **La casita sobresale por arriba** de la barra, y al esconderla se
 *    quedaba asomando: un medio círculo morado flotando encima del contenido
 *    (visto en un Motorola). Ahora baja con la barra y se desvanece.
 *  · Cada botón mide 44 px o más: menos que eso, el dedo falla.
 *  · En pantalla grande no existe: ahí está la barra lateral.
 */

export interface DestinoDeLaBarra {
    name: string;
    href: string;
    icon: LucideIcon;
    /** En vez de ir a una pantalla, hace algo (abrir «Mi cuenta»). */
    alPulsar?: () => void;
}

interface Props {
    /** Los de los lados, de izquierda a derecha: la mitad a cada lado de Inicio. */
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

    const mitad = Math.ceil(destinos.length / 2);
    const izquierda = destinos.slice(0, mitad);
    const derecha = destinos.slice(mitad);
    const enInicio = pathname === '/dashboard';

    const clasesDelBoton = (activo: boolean) =>
        cn(
            'flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-xs font-semibold transition-colors',
            activo ? 'text-indigo-700' : 'text-gray-600'
        );

    const Boton = ({ destino }: { destino: DestinoDeLaBarra }) => {
        const Icono = destino.icon;
        const contenido = (
            <>
                <Icono className="h-5 w-5 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{destino.name}</span>
            </>
        );
        if (destino.alPulsar) {
            return (
                <button type="button" onClick={destino.alPulsar} className={clasesDelBoton(false)}>
                    {contenido}
                </button>
            );
        }
        const activo = esElActivo(destino.href);
        return (
            <Link href={destino.href} aria-current={activo ? 'page' : undefined} className={clasesDelBoton(activo)}>
                {contenido}
            </Link>
        );
    };

    return (
        <nav
            aria-label="Navegación principal"
            className="zona-segura-abajo fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-1px_8px_rgba(15,23,42,0.06)] transition-transform duration-200 ease-out lateral:hidden"
            style={
                escondida
                    ? { transform: 'translateY(calc(100% - var(--zona-segura-abajo)))' }
                    : undefined
            }
        >
            <div className="mx-auto flex max-w-xl items-end justify-between px-1">
                {izquierda.map((d) => (
                    <Boton key={d.name} destino={d} />
                ))}

                {/* El centro: Inicio, que es donde está todo lo demás. */}
                <Link
                    href="/dashboard"
                    aria-current={enInicio ? 'page' : undefined}
                    aria-label="Inicio"

                    className="flex min-h-[52px] w-[72px] shrink-0 flex-col items-center justify-end px-1 pb-1.5"
                >
                    <span
                        className={cn(
                            'flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-white transition-[transform,opacity,background-color] duration-200 ease-out',
                            enInicio ? 'bg-indigo-700' : 'bg-indigo-600',
                            // Sobresale 12 px por encima de la barra: escondida,
                            // baja con ella y se desvanece, o se queda asomando.
                            escondida ? 'translate-y-8 opacity-0' : '-translate-y-3 opacity-100'
                        )}
                    >
                        <Home className="h-6 w-6 text-white" aria-hidden />
                    </span>
                    <span className="-mt-2.5 text-xs font-semibold text-gray-800">Inicio</span>
                </Link>

                {derecha.map((d) => (
                    <Boton key={d.name} destino={d} />
                ))}
            </div>
        </nav>
    );
}

export default BarraInferiorMovil;
