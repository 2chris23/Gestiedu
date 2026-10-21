'use client';

import * as React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LAS PIEZAS DE CONFIGURACIÓN (como Rial, sin copiarlo; Cristian, 14-oct-2026)
 *
 * Fondo gris claro; cada grupo, su rótulo en versalitas y una tarjeta blanca
 * con filas separadas por una línea fina. En cada fila, lo que es a la
 * izquierda y su valor a la derecha (o debajo, si es largo). Nada de cajas
 * dentro de cajas ni de bordes grises en cada campo: el campo es la fila.
 *
 * Todos los apartados de Configuración se arman con esto, para que se vean
 * como una sola cosa.
 */

/** Un grupo: rótulo arriba (y su explicación) y la tarjeta con sus filas. */
export function Grupo({
    titulo,
    descripcion,
    id,
    className,
    children,
    pie,
}: {
    titulo?: React.ReactNode;
    descripcion?: React.ReactNode;
    id?: string;
    className?: string;
    children: React.ReactNode;
    /** Una nota debajo de la tarjeta. */
    pie?: React.ReactNode;
}) {
    const rotuloId = id ? `${id}-titulo` : undefined;
    return (
        <section aria-labelledby={titulo ? rotuloId : undefined} className={cn('space-y-2', className)}>
            {(titulo || descripcion) && (
                <div className="px-4">
                    {titulo && (
                        <h3 id={rotuloId} className="text-xs font-semibold uppercase tracking-[0.06em] text-gray-600">
                            {titulo}
                        </h3>
                    )}
                    {descripcion && <p className="mt-1 text-[13px] leading-snug text-gray-600">{descripcion}</p>}
                </div>
            )}
            <div className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] ring-1 ring-gray-200/70">
                {children}
            </div>
            {pie && <p className="px-4 text-xs leading-snug text-gray-600">{pie}</p>}
        </section>
    );
}

const FILA = 'flex min-h-[56px] items-center gap-3 px-4 py-2.5';
const ROTULO = 'min-w-0 shrink-0 text-[15px] text-gray-900';
// Con «!»: la red de seguridad de globals.css le pone caja a los campos numéricos.
const VALOR =
    'min-h-[44px] min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !px-0 text-right text-[15px] text-gray-700 outline-none placeholder:text-gray-400 focus:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60';

/** Icono pequeño de una fila, en su pastilla. */
function IconoDeFila({ icono: Icono }: { icono?: LucideIcon }) {
    if (!Icono) return null;
    return <Icono className="h-5 w-5 shrink-0 text-gray-700" aria-hidden />;
}

/** Texto, número, correo…: «Municipio ........ Valencia». */
export const FilaCampo = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: React.ReactNode; icono?: LucideIcon; ayuda?: React.ReactNode; sufijo?: React.ReactNode }
>(function FilaCampo({ etiqueta, icono, ayuda, sufijo, id, className, ...props }, ref) {
    const auto = React.useId();
    const elId = id ?? auto;
    return (
        <div className="px-4 py-1.5">
            <div className="flex min-h-[48px] items-center gap-3">
                <IconoDeFila icono={icono} />
                <label htmlFor={elId} className={cn(ROTULO, 'max-w-[55%]')}>
                    {etiqueta}
                </label>
                <input ref={ref} id={elId} className={cn(VALOR, className)} {...props} />
                {sufijo && <span className="shrink-0 text-[15px] text-gray-500">{sufijo}</span>}
            </div>
            {ayuda && <p className="pb-1.5 text-xs leading-snug text-gray-600">{ayuda}</p>}
        </div>
    );
});

/** Lo largo (una dirección, un texto): el rótulo arriba y el campo debajo. */
export function FilaTexto({
    etiqueta,
    ayuda,
    id,
    className,
    ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: React.ReactNode; ayuda?: React.ReactNode }) {
    const auto = React.useId();
    const elId = id ?? auto;
    return (
        <div className="px-4 py-3">
            <label htmlFor={elId} className="block text-[15px] text-gray-900">
                {etiqueta}
            </label>
            <textarea
                id={elId}
                className={cn(
                    'mt-1.5 w-full resize-y rounded-xl bg-gray-50 px-3 py-2.5 text-[15px] text-gray-800 outline-none ring-1 ring-gray-200/80 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500',
                    className
                )}
                {...props}
            />
            {ayuda && <p className="mt-1 text-xs leading-snug text-gray-600">{ayuda}</p>}
        </div>
    );
}

/** Un interruptor: casilla de verdad (las pruebas y los lectores la ven como casilla), con forma de interruptor. */
export function FilaInterruptor({
    titulo,
    descripcion,
    icono,
    checked,
    onChange,
    disabled,
    id,
    comoInterruptor,
}: {
    titulo: React.ReactNode;
    descripcion?: React.ReactNode;
    icono?: LucideIcon;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    id?: string;
    /** Que se anuncie como interruptor (`role="switch"`), no como casilla. */
    comoInterruptor?: boolean;
}) {
    const auto = React.useId();
    const elId = id ?? auto;
    return (
        <label htmlFor={elId} className={cn(FILA, 'relative cursor-pointer', disabled && 'cursor-not-allowed opacity-60')}>
            <IconoDeFila icono={icono} />
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-gray-900">{titulo}</span>
                {descripcion && <span className="mt-0.5 block text-sm leading-snug text-gray-600">{descripcion}</span>}
            </span>
            <input
                id={elId}
                type="checkbox"
                role={comoInterruptor ? 'switch' : undefined}
                aria-checked={comoInterruptor ? checked : undefined}
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                // Invisible y sobre toda la fila: el dedo (y las pruebas) la pulsan donde sea.
                className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            />
            <span
                aria-hidden
                className="relative h-7 w-12 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-indigo-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2"
            />
        </label>
    );
}

/** Algo a la derecha que no es un campo (una lista, unos botones, un valor fijo). */
export function Fila({
    etiqueta,
    descripcion,
    icono,
    children,
    apilada,
    etiquetaId,
}: {
    etiqueta: React.ReactNode;
    descripcion?: React.ReactNode;
    icono?: LucideIcon;
    children?: React.ReactNode;
    /** El control debajo del rótulo, a todo el ancho (unas opciones, una lista larga). */
    apilada?: boolean;
    etiquetaId?: string;
}) {
    if (apilada) {
        return (
            <div className="space-y-2.5 px-4 py-3.5">
                <div className="flex items-start gap-3">
                    <IconoDeFila icono={icono} />
                    <div className="min-w-0">
                        <p id={etiquetaId} className="text-[15px] text-gray-900">
                            {etiqueta}
                        </p>
                        {descripcion && <p className="mt-0.5 text-sm leading-snug text-gray-600">{descripcion}</p>}
                    </div>
                </div>
                {children}
            </div>
        );
    }
    return (
        <div className={FILA}>
            <IconoDeFila icono={icono} />
            <div className="min-w-0 flex-1">
                <p id={etiquetaId} className="text-[15px] text-gray-900">
                    {etiqueta}
                </p>
                {descripcion && <p className="mt-0.5 text-sm leading-snug text-gray-600">{descripcion}</p>}
            </div>
            {children && <div className="flex shrink-0 items-center justify-end">{children}</div>}
        </div>
    );
}

/** Unas pocas opciones, en una píldora partida (la de «Claro · Oscuro · Teléfono»). */
export function Opciones<T extends string>({
    valor,
    opciones,
    alCambiar,
    etiqueta,
    className,
}: {
    valor: T;
    opciones: Array<{ valor: T; texto: string }>;
    alCambiar: (v: T) => void;
    etiqueta?: string;
    className?: string;
}) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className={cn('flex flex-wrap gap-1 rounded-2xl bg-gray-100 p-1', className)}>
            {opciones.map((o) => {
                const activa = valor === o.valor;
                return (
                    <button
                        key={o.valor}
                        type="button"
                        role="radio"
                        aria-checked={activa}
                        onClick={() => alCambiar(o.valor)}
                        className={cn(
                            'min-h-[40px] flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors',
                            activa ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'
                        )}
                    >
                        {o.texto}
                    </button>
                );
            })}
        </div>
    );
}

/** El botón de guardar, al final: ancho, redondo y del color de la app. */
export function BotonGuardar({
    guardando,
    texto = 'Guardar Cambios',
    onClick,
    type = 'submit',
    disabled,
}: {
    guardando?: boolean;
    texto?: string;
    onClick?: () => void;
    type?: 'submit' | 'button';
    disabled?: boolean;
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={guardando || disabled}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto sm:min-w-[220px]"
        >
            {guardando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            {guardando ? 'Guardando…' : texto}
        </button>
    );
}

/** Mientras llegan los datos: la forma de dos tarjetas, no un círculo que gira. */
export function CargandoAjustes() {
    return (
        <div className="space-y-6" aria-label="Cargando la configuración" role="status">
            {[3, 4].map((filas, g) => (
                <div key={g} className="space-y-2">
                    <div className="mx-4 h-3 w-28 animate-pulse rounded bg-gray-200" />
                    <div className="divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200/70">
                        {Array.from({ length: filas }).map((_, i) => (
                            <div key={i} className="flex h-14 items-center justify-between px-4">
                                <div className="h-3.5 w-32 animate-pulse rounded bg-gray-200" />
                                <div className="h-3.5 w-20 animate-pulse rounded bg-gray-100" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/** El apartado entero: los grupos uno debajo del otro, con aire. */
export function Ajustes({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn('mx-auto max-w-2xl space-y-7', className)} {...props}>
            {children}
        </div>
    );
}

/** Una `Lista` dentro de una fila: sin caja, el valor a la derecha. */
export const EN_LA_FILA = '!w-auto max-w-[62vw] border-0 bg-transparent font-normal text-gray-700 shadow-none sm:max-w-xs';

/** Un `SelectTrigger` dentro de una fila: una píldora gris pequeña, el valor a la derecha. */
export const SELECT_EN_FILA = 'h-auto min-h-[40px] w-auto max-w-[58vw] gap-1.5 rounded-xl border-0 bg-gray-100 px-3 text-[15px] text-gray-800 shadow-none sm:max-w-xs';
