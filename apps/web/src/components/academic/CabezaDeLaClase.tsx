'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

/**
 * LA CABECERA DE UNA SECCIÓN O DE UNA MATERIA, EN UNA LÍNEA
 *
 * Pedido por Cristian (16-oct-2026): la miga de pan repetía el año y la
 * sección que ya decía el título, «20 Estudiantes» repetía la ocupación de
 * debajo (y además contaba solo la primera página), y cada documento tenía su
 * botón. Ahora: la flecha, el título con una línea gris debajo y, a la
 * derecha, lo que se elige (el lapso) y UN botón de documentos que abre su
 * ventana. Aprovecha el espacio sin apretar.
 */
export function CabezaDeLaClase({
    volverA,
    rotuloVolver,
    titulo,
    subtitulo,
    children,
}: {
    volverA: string;
    rotuloVolver: string;
    titulo: React.ReactNode;
    subtitulo?: React.ReactNode;
    /** Lo de la derecha: el selector de lapso, los documentos… */
    children?: React.ReactNode;
}) {
    return (
        <header className="flex items-center gap-2">
            <Link
                href={volverA}
                aria-label={rotuloVolver}
                className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
            >
                <ChevronLeft className="h-6 w-6" aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold leading-tight text-gray-900 sm:text-2xl">{titulo}</h1>
                {subtitulo && <p className="truncate text-xs font-medium text-gray-600 sm:text-sm">{subtitulo}</p>}
            </div>
            {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
        </header>
    );
}

export interface Documento {
    href: string;
    titulo: string;
    detalle: string;
    icono?: LucideIcon;
}

/**
 * UN SOLO BOTÓN PARA LOS DOCUMENTOS, QUE ABRE SU VENTANA
 *
 * Cristian lo prefiere siempre así (16-oct-2026): nada de un botón suelto por
 * cada documento. En la ventana, cada uno es una fila (icono, nombre y una
 * línea de qué es), como las de Configuración.
 */
export function BotonDeDocumentos({ documentos, titulo = 'Documentos' }: { documentos: Documento[]; titulo?: string }) {
    const [abierto, setAbierto] = React.useState(false);
    if (documentos.length === 0) return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setAbierto(true)}
                aria-label={titulo}
                title={titulo}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-indigo-700 shadow-[0_1px_2px_rgba(13,71,161,0.08)] ring-1 ring-gray-200 transition-colors hover:bg-indigo-50"
            >
                <FileText className="h-5 w-5" aria-hidden />
            </button>
            {abierto && (
                <Sheet open onOpenChange={(v) => !v && setAbierto(false)}>
                    <SheetContent
                        side="bottom"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
                    >
                        <SheetTitle className="pr-12 text-lg font-bold text-gray-900">{titulo}</SheetTitle>
                        <SheetDescription className="sr-only">Elige el documento que quieres abrir</SheetDescription>
                        <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                            {documentos.map((d) => {
                                const Icono = d.icono ?? FileText;
                                return (
                                    <li key={d.href}>
                                        <Link
                                            href={d.href}
                                            onClick={() => setAbierto(false)}
                                            className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
                                        >
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
                                                <Icono className="h-4 w-4" aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15px] font-medium text-gray-900">{d.titulo}</span>
                                                <span className="block text-sm text-gray-600">{d.detalle}</span>
                                            </span>
                                            <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </SheetContent>
                </Sheet>
            )}
        </>
    );
}

export interface Parte {
    id: string;
    nombre: string;
    /** El nombre largo, para quien no ve (si el corto no basta). */
    rotulo?: string;
    icono: LucideIcon;
}

/**
 * LAS PARTES DE LA PANTALLA, EN CUADROS
 *
 * La forma de los accesos de Finanzas (y del Inicio): un cuadro redondeado con
 * su icono y el nombre debajo; el elegido, relleno del color de la app. Cuatro
 * por fila; si hay más, bajan a otra, sin arrastrar de lado.
 */
export function PartesDeLaPantalla({
    partes,
    activa,
    alElegir,
    etiqueta,
}: {
    partes: Parte[];
    activa: string;
    alElegir: (id: string) => void;
    etiqueta: string;
}) {
    return (
        <nav className="-mx-1 grid grid-cols-4 gap-y-3" aria-label={etiqueta}>
            {partes.map((p) => {
                const Icono = p.icono;
                const esta = activa === p.id;
                return (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => alElegir(p.id)}
                        data-pestana
                        aria-current={esta ? 'page' : undefined}
                        aria-label={p.rotulo}
                        className="group flex min-h-[44px] min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1 text-center"
                    >
                        <span
                            className={cn(
                                'flex h-[52px] w-[52px] items-center justify-center rounded-[18px] shadow-[0_1px_2px_rgba(13,71,161,0.08)] transition-colors group-active:scale-95',
                                esta ? 'bg-indigo-600 text-white' : 'bg-white text-cabecera-tinta group-hover:bg-gray-50'
                            )}
                        >
                            <Icono className="h-[22px] w-[22px]" aria-hidden />
                        </span>
                        <span className={cn('max-w-full truncate text-xs leading-tight tracking-tight', esta ? 'font-bold text-gray-900' : 'font-medium text-gray-800')}>
                            {p.nombre}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

/** El buscador de alumnos de la sección y de la materia: el mismo en las dos. */
export function BuscadorDeAlumnos({ valor, alCambiar }: { valor: string; alCambiar: (v: string) => void }) {
    return (
        <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Buscar alumno</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input
                type="search"
                value={valor}
                onChange={(e) => alCambiar(e.target.value)}
                placeholder="Buscar por nombre o cédula"
                className="!h-11 w-full !rounded-full !border-gray-200 !bg-gray-50 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:!border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
        </label>
    );
}

/** Los tres momentos (o lapsos), en una barra segmentada: sin colores de arcoíris. */
export function ElegirMomento({ valor, alCambiar }: { valor: string; alCambiar: (v: string) => void }) {
    const momentos = [
        ['1', '1er Momento'],
        ['2', '2do Momento'],
        ['3', '3er Momento'],
    ] as const;
    return (
        <div className="flex rounded-full bg-gray-200/70 p-1" role="group" aria-label="Momento">
            {momentos.map(([id, texto]) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => alCambiar(id)}
                    aria-pressed={valor === id}
                    className={cn(
                        'min-h-[44px] min-w-0 flex-1 rounded-full px-1 text-[13px] font-semibold transition-colors',
                        valor === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                    )}
                >
                    {texto}
                </button>
            ))}
        </div>
    );
}
