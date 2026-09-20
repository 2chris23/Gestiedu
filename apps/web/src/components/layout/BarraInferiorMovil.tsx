'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LA BARRA DE ABAJO, EN EL TELÉFONO
 *
 * En un teléfono, lo de arriba a la izquierda queda lejos: hay que cambiar la
 * mano o estirar el pulgar. Las tres o cuatro pantallas que se usan todo el día
 * van abajo, donde está el dedo, como en las aplicaciones que la gente ya sabe
 * usar.
 *
 * En el centro, más grande y en redondo, el menú completo: lo que no cabe aquí
 * sigue estando a un toque.
 *
 * Detalles que importan y se olvidan:
 *   · `pb-[env(safe-area-inset-bottom)]`: en los teléfonos con barra de gestos,
 *     sin esto el último milímetro de los botones queda debajo de la barra del
 *     sistema y no se pueden pulsar;
 *   · cada botón mide al menos 44 px de alto, que es el mínimo para un dedo;
 *   · en pantalla grande no existe: ahí está la barra lateral.
 */

export interface DestinoDeLaBarra {
    name: string;
    href: string;
    icon: LucideIcon;
}

interface Props {
    destinos: DestinoDeLaBarra[];
    alAbrirMenu: () => void;
    menuAbierto?: boolean;
}

/** Cuántos caben a cada lado del botón del centro. */
const POR_LADO = 2;

export function BarraInferiorMovil({ destinos, alAbrirMenu, menuAbierto }: Props) {
    const pathname = usePathname();

    const esElActivo = (href: string) =>
        href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

    /**
     * El botón del centro tiene que quedar EN EL CENTRO también cuando hay
     * pocos destinos —el alumno solo tiene Inicio y Calendario—, así que los
     * destinos se reparten por mitades y el lado que se queda corto se rellena
     * con un hueco del mismo ancho. Sin esto, al alumno le salía el botón
     * pegado al borde derecho.
     */
    const aLaIzquierda = Math.min(POR_LADO, Math.ceil(destinos.length / 2));
    const izquierda = destinos.slice(0, aLaIzquierda);
    const derecha = destinos.slice(aLaIzquierda, POR_LADO * 2);
    const huecos = Math.max(0, izquierda.length - derecha.length);

    const Boton = ({ destino }: { destino: DestinoDeLaBarra }) => {
        const activo = esElActivo(destino.href);
        const Icono = destino.icon;
        return (
            <Link
                href={destino.href}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                    'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-semibold transition-colors',
                    activo ? 'text-indigo-700' : 'text-gray-600 hover:text-gray-900'
                )}
            >
                <Icono className={cn('h-5 w-5', activo && 'text-indigo-700')} />
                <span className="max-w-full truncate">{destino.name}</span>
            </Link>
        );
    };

    return (
        <nav
            aria-label="Navegación principal"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)] lg:hidden"
        >
            <div className="mx-auto flex max-w-xl items-end justify-between px-2">
                {izquierda.map((d) => (
                    <Boton key={d.href} destino={d} />
                ))}

                {/* El centro: todo lo demás */}
                <button
                    type="button"
                    onClick={alAbrirMenu}
                    aria-expanded={menuAbierto}
                    className="flex min-w-[64px] flex-col items-center justify-center gap-0.5 px-1 pb-1.5"
                >
                    <span
                        className={cn(
                            'flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full shadow-lg ring-4 ring-white transition-colors',
                            menuAbierto ? 'bg-indigo-800' : 'bg-indigo-600'
                        )}
                    >
                        <LayoutGrid className="h-6 w-6 text-white" />
                    </span>
                    <span className="-mt-2 text-[10px] font-semibold text-gray-700">Menú</span>
                </button>

                {derecha.map((d) => (
                    <Boton key={d.href} destino={d} />
                ))}
                {Array.from({ length: huecos }).map((_, i) => (
                    <span key={`hueco-${i}`} className="flex-1" aria-hidden />
                ))}
            </div>
        </nav>
    );
}

export default BarraInferiorMovil;
