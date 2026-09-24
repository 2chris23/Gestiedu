'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SchoolAccessModal } from './SchoolAccessModal';

/**
 * LA PUERTA AL PORTAL DEL LICEO, DESDE CUALQUIER SITIO DE LA PORTADA
 *
 * La portada es de servidor (así sale el texto en el primer pintado y lleva
 * su `metadata`); lo único que necesita el navegador es abrir la ventana del
 * portal. Un solo estado para toda la página, y botones que lo abren desde
 * la cabecera, el principio y el final.
 */

const Contexto = React.createContext<() => void>(() => {});

export function ProveedorDelPortal({ children }: { children: React.ReactNode }) {
    const [abierto, setAbierto] = React.useState(false);
    const abrir = React.useCallback(() => setAbierto(true), []);
    return (
        <Contexto.Provider value={abrir}>
            {children}
            <SchoolAccessModal isOpen={abierto} onClose={() => setAbierto(false)} />
        </Contexto.Provider>
    );
}

export function BotonDelPortal({
    children = 'Entrar a mi liceo',
    variante = 'lleno',
    className,
}: {
    children?: React.ReactNode;
    variante?: 'lleno' | 'claro';
    className?: string;
}) {
    const abrir = React.useContext(Contexto);
    return (
        <button
            type="button"
            onClick={abrir}
            className={cn(
                'inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4',
                variante === 'lleno'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25 hover:bg-indigo-700 focus-visible:ring-indigo-200'
                    : 'bg-white text-indigo-700 shadow-sm hover:bg-indigo-50 focus-visible:ring-white/50',
                className
            )}
        >
            <span>{children}</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
    );
}
