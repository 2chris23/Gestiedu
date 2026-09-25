import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { abreFuera } from './contacto';

/**
 * «PIDE UNA DEMOSTRACIÓN»: LA LLAMADA PARA QUIEN AÚN NO ES CLIENTE
 *
 * Un enlace, no un formulario: el sistema no tiene registro abierto y la
 * portada no guarda datos de nadie. Solo sale si quien despliega dice adónde
 * lleva (`contactoDemo()`, en `contacto.ts`).
 */
export function BotonDeContacto({
    enlace,
    variante = 'lleno',
    className,
    children = 'Pide una demostración',
}: {
    enlace: string;
    variante?: 'lleno' | 'claro';
    className?: string;
    children?: React.ReactNode;
}) {
    const fuera = abreFuera(enlace);
    return (
        <a
            href={enlace}
            {...(fuera ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className={cn(
                'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4',
                variante === 'lleno'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/25 hover:bg-indigo-700 focus-visible:ring-indigo-200'
                    : 'bg-white text-indigo-700 shadow-sm hover:bg-indigo-50 focus-visible:ring-white/50',
                className
            )}
        >
            <MessageCircle className="h-4 w-4" aria-hidden />
            <span>{children}</span>
            {fuera && <span className="sr-only">(se abre en otra pestaña)</span>}
        </a>
    );
}
