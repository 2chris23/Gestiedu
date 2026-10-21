import { cn } from '@/lib/utils';

/** El círculo de una materia: su color y su inicial (gris si no tiene color). */
export function CirculoDeMateria({ nombre, color, className }: { nombre: string; color?: string | null; className?: string }) {
    return (
        <span
            className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold', color ? 'text-white' : 'bg-gray-100 text-gray-700', className)}
            style={color ? { backgroundColor: color } : undefined}
            aria-hidden
        >
            {nombre.charAt(0).toUpperCase()}
        </span>
    );
}
