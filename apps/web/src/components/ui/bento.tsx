'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * LA CAJA DE BENTO
 *
 * Una caja de bento japonesa tiene compartimentos de distinto tamaño que encajan
 * sin hueco: el arroz ocupa la mitad, el pescado un cuarto, el encurtido una
 * esquina. El tamaño dice qué es lo importante **antes de leer nada**.
 *
 * Aquí igual. El panel no es una cuadrícula de tarjetas iguales —eso obliga a
 * leerlas todas para saber cuál importa—: es una rejilla donde lo grande es lo
 * que hay que mirar primero.
 *
 * ─── EN EL TELÉFONO NO HAY BENTO ────────────────────────────────────────────
 *
 * Con 375 px de ancho, cualquier rejilla es una columna. El bento se desarma
 * solo y las piezas caen **en el orden en que se escribieron**, así que ese
 * orden tiene que ser el de importancia. Lo primero que se escribe es lo
 * primero que se ve en el teléfono.
 */

/**
 * LOS CORTES MIRAN LA CAJA, NO LA VENTANA
 *
 * `@lg:` y `@4xl:` no son `lg:` y `4xl:`. La arroba cambia la pregunta: en vez
 * de «¿cuánto mide la pantalla?» preguntan «¿cuánto mide **el sitio que tengo**?».
 *
 * Importa porque el mismo panel vive en sitios de ancho distinto: a pantalla
 * completa, dentro de una columna junto a un menú lateral, o en un teléfono.
 * Con cortes de ventana, el panel metido en una columna estrecha de un monitor
 * grande sigue creyendo que tiene sitio de sobra y se aplasta — que es justo lo
 * que se veía mal.
 *
 * Quien use `<Bento>` tiene que meterlo dentro de algo con la clase
 * `@container`. El armazón del panel ya la trae.
 */
export function Bento({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                // DOS por fila ya en el teléfono. Una sola columna de tarjetas
                // gordas obliga a desplazar dos pantallas para ver seis datos;
                // así caben seis de un vistazo, que es de lo que va un panel.
                'grid grid-cols-2 gap-2.5 @lg:gap-3 @4xl:grid-cols-4 @4xl:gap-3.5',
                className
            )}
        >
            {children}
        </div>
    );
}

/** Cuánto ocupa una pieza cuando hay sitio. Si no lo hay, todas ocupan lo mismo. */
type Tamano = 'normal' | 'ancha' | 'completa' | 'alta';

const tamanos: Record<Tamano, string> = {
    normal: '',
    // La pieza que manda: ocupa la fila entera también en el teléfono.
    ancha: 'col-span-2',
    completa: 'col-span-2 @4xl:col-span-4',
    alta: '@lg:row-span-2',
};

export function Pieza({
    children,
    tamano = 'normal',
    className,
    ...resto
}: React.HTMLAttributes<HTMLDivElement> & { tamano?: Tamano }) {
    return (
        <div className={cn(tamanos[tamano], className)} {...resto}>
            {children}
        </div>
    );
}

/**
 * LA TARJETA
 *
 * Blanca sobre papel hueso (o levantada sobre la tinta, en oscuro). Esquinas muy
 * redondeadas y sombra suave: es lo que hace que esto se lea como una app y no
 * como un panel de administración.
 */
export const Tarjeta = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { pulsable?: boolean; tono?: Tono }
>(({ className, pulsable, tono = 'papel', ...resto }, ref) => (
    <div
        ref={ref}
        className={cn(
            'relative overflow-hidden rounded-lg p-5 transition-all duration-200 ease-suave',
            tonos[tono],
            pulsable &&
                'cursor-pointer hover:-translate-y-0.5 hover:shadow-3 active:translate-y-0 active:scale-[0.99] active:shadow-1',
            className
        )}
        {...resto}
    />
));
Tarjeta.displayName = 'Tarjeta';

/**
 * Los tonos de una tarjeta. Cada color dice UNA cosa — ver `globals.css`—, así
 * que el tono no se elige por gusto: se elige por lo que la tarjeta significa.
 */
export type Tono = 'papel' | 'indigo' | 'menta' | 'ambar' | 'coral' | 'cian' | 'tinta';

const tonos: Record<Tono, string> = {
    papel: 'border border-linea bg-tarjeta text-tinta shadow-1',
    indigo: 'border border-indigo-suave/60 bg-indigo-claro text-indigo-hondo shadow-1',
    menta: 'border border-menta-suave/60 bg-menta-claro text-menta-hondo shadow-1',
    ambar: 'border border-ambar-suave/60 bg-ambar-claro text-ambar-hondo shadow-1',
    coral: 'border border-coral-suave/60 bg-coral-claro text-coral-hondo shadow-1',
    cian: 'border border-cian-suave/60 bg-cian-claro text-cian-hondo shadow-1',
    // La pieza que manda en el bento: bloque sólido, como en las apps de banco.
    tinta: 'border-0 bg-indigo text-indigo-encima shadow-2',
};

/**
 * LA CIFRA
 *
 * Un número, qué es, y el matiz. El patrón de las apps de finanzas.
 *
 * ─── SE HIZO DOS VECES, Y LA PRIMERA ESTABA MAL ─────────────────────────────
 *
 * La primera versión ocupaba **230 px de alto para enseñar un número**. En un
 * teléfono de 812 px eso es más del 25% de la pantalla por dato: cabían tres y
 * media. Para ver seis indicadores había que desplazar dos pantallas enteras.
 *
 * Mirando las apps que se pusieron de ejemplo, la cuenta sale al revés: en
 * Cashea, dos tarjetas de saldo **con barra de progreso** y una rejilla de
 * cuatro acciones caben en menos de un tercio de la pantalla.
 *
 * Lo que sobraba, en orden de culpa:
 *
 *   · el hueco entre el rótulo y el número (`justify-between` estirando);
 *   · el icono metido en un cuadrado de 36 px con su propio fondo;
 *   · el relleno de 20 px por lado;
 *   · el número a 44 px, tamaño de portada.
 *
 * Ahora: relleno de 14, icono suelto de 15 px, número de 26, y **dos por fila
 * en el teléfono**. Mismo dato, un tercio del sitio.
 */
export function Cifra({
    rotulo,
    valor,
    pie,
    icono,
    tono = 'papel',
    tamano = 'normal',
    alPulsar,
    className,
}: {
    rotulo: string;
    valor: React.ReactNode;
    pie?: React.ReactNode;
    icono?: React.ReactNode;
    tono?: Tono;
    tamano?: Tamano;
    alPulsar?: () => void;
    className?: string;
}) {
    const sobreColor = tono !== 'papel';
    return (
        <Pieza tamano={tamano}>
            <Tarjeta
                tono={tono}
                pulsable={!!alPulsar}
                onClick={alPulsar}
                className={cn('flex h-full flex-col gap-1 p-3.5', className)}
            >
                <div className="flex items-center gap-1.5">
                    {/* El icono va suelto al lado del rótulo, sin cuadrado
                        alrededor: el cuadrado costaba 36 px de alto y no decía
                        nada que el icono no dijera ya. */}
                    {icono && <span className="shrink-0 opacity-70">{icono}</span>}
                    <span
                        className={cn(
                            'truncate text-micro font-semibold uppercase tracking-wide',
                            // Sin transparencia: el texto con opacidad sobre fondo de color
                            // bajaba a 3,3:1. El color «hondo» ya es el suave legible.
                            sobreColor ? '' : 'text-tinta-suave'
                        )}
                    >
                        {rotulo}
                    </span>
                </div>

                <div>
                    <p className="cifra">{valor}</p>
                    {pie && (
                        <p
                            className={cn(
                                'mt-0.5 truncate text-micro',
                                sobreColor ? '' : 'text-tinta-tenue'
                            )}
                        >
                            {pie}
                        </p>
                    )}
                </div>
            </Tarjeta>
        </Pieza>
    );
}

/**
 * EL MOSAICO DE ACCIONES
 *
 * Cuatro botones grandes en una rejilla, cada uno un icono y una palabra. Es el
 * bloque de «Pagar celular · Pagar servicios · Canjear cupones · Invitar» de las
 * apps de finanzas, y funciona por lo mismo: son las cuatro cosas que la gente
 * viene a hacer, están donde el pulgar llega, y ocupan menos que un menú.
 *
 * Aquí: pasar asistencia, poner notas, ver el horario, dejar una observación.
 *
 * Cuatro, no seis. Si hay más de cuatro cosas importantes, ninguna lo es.
 */
export function Mosaico({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('grid grid-cols-4 gap-2', className)}>{children}</div>
    );
}

export function Baldosa({
    icono,
    children,
    alPulsar,
    tono = 'papel',
}: {
    icono: React.ReactNode;
    children: React.ReactNode;
    alPulsar?: () => void;
    tono?: Tono;
}) {
    return (
        <button
            type="button"
            onClick={alPulsar}
            className={cn(
                'flex flex-col items-center justify-center gap-1.5 rounded-sm px-1 py-3',
                'transition-all duration-200 ease-suave active:scale-95',
                tonos[tono].replace('p-5', ''),
                alPulsar && 'hover:-translate-y-0.5 hover:shadow-2'
            )}
        >
            <span className="opacity-80">{icono}</span>
            {/* Dos líneas como mucho: si el nombre no cabe en dos palabras
                cortas, esa acción no va en el mosaico. */}
            <span className="line-clamp-2 text-center text-micro font-semibold leading-tight">
                {children}
            </span>
        </button>
    );
}

/**
 * LA PASTILLA
 *
 * El estado de algo, en una palabra. Nunca solo color: lleva siempre la palabra,
 * y si hace falta un punto delante. Uno de cada doce hombres no distingue el
 * rojo del verde, y «aprobado» y «reprobado» no se pueden confundir.
 */
export function Pastilla({
    children,
    tono = 'papel',
    punto = false,
    className,
}: {
    children: React.ReactNode;
    tono?: Tono;
    punto?: boolean;
    className?: string;
}) {
    const puntos: Record<Tono, string> = {
        papel: 'bg-tinta-tenue',
        indigo: 'bg-indigo',
        menta: 'bg-menta',
        ambar: 'bg-ambar',
        coral: 'bg-coral',
        cian: 'bg-cian',
        tinta: 'bg-indigo-encima',
    };
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-pastilla px-2.5 py-1 text-etiqueta font-semibold',
                tonos[tono].replace('shadow-1', '').replace('p-5', ''),
                className
            )}
        >
            {punto && <span className={cn('h-1.5 w-1.5 rounded-pastilla', puntos[tono])} />}
            {children}
        </span>
    );
}
