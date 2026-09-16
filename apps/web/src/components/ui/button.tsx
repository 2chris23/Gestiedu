import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * EL BOTÓN
 *
 * Pastilla, no rectángulo. Se hunde al pulsarlo. Y **nunca baja de 44 px de
 * alto** en su tamaño normal: es la medida mínima que una persona acierta con
 * el dedo sin mirar. Los botones de 32 px son de ratón; aquí la mitad del liceo
 * entra por el teléfono.
 *
 * ─── LOS TONOS, Y CUÁNDO USAR CADA UNO ──────────────────────────────────────
 *
 *   solido      la acción principal de la pantalla. UNA por pantalla.
 *   suave       acciones secundarias, las que acompañan.
 *   contorno    alternativas: "cancelar", "volver".
 *   fantasma    lo que vive dentro de una tarjeta y no debe competir con ella.
 *   peligro     borrar, expulsar, cerrar un ciclo. Lo que no se deshace.
 *   enlace      cuando de verdad es un enlace y no un botón.
 *
 * Si una pantalla tiene dos botones sólidos, uno de los dos está mintiendo
 * sobre su importancia.
 */
const estilos = cva(
    [
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold',
        'rounded-pastilla transition-all duration-200 ease-suave',
        'disabled:pointer-events-none disabled:opacity-45',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0',
        // Se hunde al pulsar: el gesto se siente, no solo se ve.
        'active:scale-[0.97]',
    ].join(' '),
    {
        variants: {
            variant: {
                solido: 'bg-indigo text-indigo-encima shadow-2 hover:bg-indigo-hondo hover:shadow-3',
                suave: 'bg-indigo-claro text-indigo-hondo hover:bg-indigo-suave',
                contorno: 'border border-linea-fuerte bg-tarjeta text-tinta shadow-1 hover:bg-lienzo-hundido',
                fantasma: 'text-tinta-suave hover:bg-lienzo-hundido hover:text-tinta',
                peligro: 'bg-coral text-coral-encima shadow-2 hover:bg-coral-hondo hover:shadow-3',
                enlace: 'text-indigo underline-offset-4 hover:underline',

                // ── Nombres de antes ─────────────────────────────────────
                // Lo ya escrito sigue funcionando mientras se migra pantalla a
                // pantalla. No usar en código nuevo.
                default: 'bg-indigo text-indigo-encima shadow-2 hover:bg-indigo-hondo hover:shadow-3',
                destructive: 'bg-coral text-coral-encima shadow-2 hover:bg-coral-hondo hover:shadow-3',
                outline: 'border border-linea-fuerte bg-tarjeta text-tinta shadow-1 hover:bg-lienzo-hundido',
                secondary: 'bg-indigo-claro text-indigo-hondo hover:bg-indigo-suave',
                ghost: 'text-tinta-suave hover:bg-lienzo-hundido hover:text-tinta',
                link: 'text-indigo underline-offset-4 hover:underline',
            },
            size: {
                // 44 px: el dedo acierta. No bajar de aquí sin un buen motivo.
                default: 'h-11 px-5 text-cuerpo [&_svg]:size-[18px]',
                sm: 'h-9 px-3.5 text-etiqueta [&_svg]:size-4',
                lg: 'h-13 px-7 text-titulo [&_svg]:size-5',
                icon: 'h-11 w-11 [&_svg]:size-[18px]',
                'icon-sm': 'h-9 w-9 [&_svg]:size-4',
            },
        },
        defaultVariants: {
            variant: 'solido',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof estilos> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, type, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                // Un `<button>` sin tipo dentro de un formulario lo envía sin querer.
                // Es un fallo clásico y aquí no puede pasar.
                type={asChild ? undefined : (type ?? 'button')}
                className={cn(estilos({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button, estilos as buttonVariants };
