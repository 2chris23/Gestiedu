'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FileText, Pencil, Search, UserRound, type LucideIcon } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
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
    profesor,
    children,
}: {
    volverA: string;
    rotuloVolver: string;
    titulo: React.ReactNode;
    subtitulo?: React.ReactNode;
    /** El profesor (o el guía): arriba a la derecha en el ordenador; en el teléfono, una línea bajo el título. */
    profesor?: Profesor;
    /** Lo de la derecha: el selector de lapso, los documentos… */
    children?: React.ReactNode;
}) {
    return (
        <header>
            <div className="flex items-center gap-2">
                <Link
                    href={volverA}
                    aria-label={rotuloVolver}
                    className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100"
                >
                    <ChevronLeft className="h-6 w-6" aria-hidden />
                </Link>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-seccion font-bold text-gray-900 sm:text-pantalla">{titulo}</h1>
                    {subtitulo && <p className="truncate text-xs font-medium text-gray-600 sm:text-sm">{subtitulo}</p>}
                </div>
                {(children || profesor) && (
                    <div className="flex shrink-0 items-center gap-2">
                        {profesor && <ProfesorEnLaCabeza {...profesor} />}
                        {children}
                    </div>
                )}
            </div>
            {/* En el teléfono, el profesor va en una línea gris debajo, alineada con
                el título y a todo el ancho: junto al lapso no cabía entero. */}
            {profesor && <ProfesorDebajo {...profesor} />}
        </header>
    );
}

export interface Profesor {
    rotulo: string;
    nombre: string | null;
    avatar?: string | null;
    /** Solo si quien mira lo puede cambiar (el admin). */
    alCambiar?: () => void;
}

/**
 * EL PROFESOR, EN LA CABECERA
 *
 * Cristian (18-oct-2026): el profesor (o el guía) ocupaba una fila para él
 * solo. En el ordenador va arriba, junto al lapso: su foto, el rótulo y el
 * nombre. En el teléfono la foto le quitaba el ancho al título («1er A…»):
 * ahí es una línea gris debajo del año. Si quien mira lo puede cambiar (el
 * admin), es un botón.
 */
function ProfesorEnLaCabeza({ rotulo, nombre, avatar, alCambiar }: Profesor) {
    const dentro = (
        <>
            {nombre ? (
                <UserAvatar name={nombre} src={avatar ?? undefined} className="h-9 w-9 shrink-0" initialsClassName="text-xs" />
            ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <UserRound className="h-5 w-5" aria-hidden />
                </span>
            )}
            <span className="min-w-0 text-left">
                <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-gray-600">{rotulo}</span>
                <span className="block max-w-[180px] truncate text-sm font-semibold leading-tight text-gray-900">{nombre ?? 'Sin asignar'}</span>
            </span>
            {alCambiar && <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />}
        </>
    );
    const clases = 'hidden min-h-[44px] items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 ring-1 ring-gray-200 sm:flex';
    return alCambiar ? (
        <button
            type="button"
            onClick={alCambiar}
            aria-label={`${nombre ? 'Cambiar' : 'Asignar'} ${rotulo.toLowerCase()} (${nombre ?? 'sin asignar'})`}
            className={cn(clases, 'transition-colors hover:bg-indigo-50')}
        >
            {dentro}
        </button>
    ) : (
        <div className={clases}>{dentro}</div>
    );
}

/** En el teléfono: «Guía: nombre» bajo el título; tocable (44 px de alto) si se puede cambiar. */
function ProfesorDebajo({ rotulo, nombre, alCambiar }: Profesor) {
    const texto = (
        <>
            {/* En el teléfono, corto: el nombre es lo que importa. */}
            <span className="text-gray-600">{rotulo === 'Profesor guía' ? 'Guía' : rotulo}: </span>
            <span className="font-semibold text-gray-800">{nombre ?? 'sin asignar'}</span>
        </>
    );
    return alCambiar ? (
        <button
            type="button"
            onClick={alCambiar}
            aria-label={`${nombre ? 'Cambiar' : 'Asignar'} ${rotulo.toLowerCase()} (${nombre ?? 'sin asignar'})`}
            // El alto de 44 px para el dedo, sin empujar nada: el relleno se
            // come con el margen negativo.
            className="-mb-[14px] -mt-[10px] ml-11 flex max-w-[calc(100%-2.75rem)] items-center gap-1 pb-[14px] pt-[10px] text-left text-xs sm:hidden"
        >
            <span className="min-w-0 truncate">{texto}</span>
            <Pencil className="h-3 w-3 shrink-0 text-gray-500" aria-hidden />
        </button>
    ) : (
        <p className="ml-11 truncate text-xs sm:hidden">{texto}</p>
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
        // En el teléfono, cuatro por fila; con sitio (tableta, ordenador), todos en
        // UNA fila, cada cuadro con su ancho: estirados a cuatro columnas en 1600 px
        // quedaban sueltos y bajaban a una segunda fila sin necesidad.
        <nav className="-mx-1 grid grid-cols-4 gap-y-3 sm:mx-0 sm:flex sm:flex-wrap sm:gap-x-2" aria-label={etiqueta}>
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
                        className="group flex min-h-[44px] min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1 text-center outline-none focus-visible:outline-none sm:w-[92px]"
                    >
                        <span
                            className={cn(
                                'flex h-[52px] w-[52px] items-center justify-center rounded-[18px] shadow-[0_1px_2px_rgba(13,71,161,0.08)] transition-[transform,background-color,box-shadow,color] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_6px_14px_-6px_rgba(13,71,161,0.35)] group-active:translate-y-0 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-indigo-500 group-focus-visible:ring-offset-2 motion-reduce:transform-none',
                                esta ? 'bg-indigo-600 text-white' : 'bg-white text-cabecera-tinta group-hover:bg-indigo-50 group-hover:text-indigo-700'
                            )}
                        >
                            <Icono className="h-[22px] w-[22px]" aria-hidden />
                        </span>
                        <span className={cn('max-w-full truncate text-xs leading-tight tracking-tight', esta ? 'font-bold text-gray-900' : 'font-medium text-gray-800 group-hover:text-indigo-700')}>
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
