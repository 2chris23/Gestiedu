'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { getApiErrorMessage } from '@/lib/utils';
import { imprimir } from '@/lib/imprimir';

export type Papel = 'carta' | 'carta-apaisada' | 'oficio-apaisado';

/** Tamaño y margen de cada papel. Las cajas del margen (sin la fecha ni la
 *  dirección del navegador) las pone `globals.css`. */
const PAGINA: Record<Papel, string> = {
    carta: 'size: letter; margin: 15mm;',
    'carta-apaisada': 'size: letter landscape; margin: 10mm;',
    'oficio-apaisado': 'size: 330mm 216mm; margin: 8mm;',
};

/** El `@page` de un documento; con `paginas`, «Página N de M» abajo a la derecha. */
export function EstiloDelPapel({ papel = 'carta', paginas = false }: { papel?: Papel; paginas?: boolean }) {
    const numero = paginas ? ` @bottom-right { content: 'Página ' counter(page) ' de ' counter(pages); font-size: 8pt; color: #555; }` : '';
    return <style>{`@media print { @page { ${PAGINA[papel]}${numero} } }`}</style>;
}

/**
 * El nombre del documento en la pestaña, que es también el nombre del PDF al
 * guardarlo («Constancia de estudio — Ana Pérez», no «Sistema de Gestión
 * Escolar»). Se devuelve el de antes al salir.
 */
export function useNombreDelDocumento(nombre: string | null | undefined) {
    React.useEffect(() => {
        if (!nombre) return;
        const antes = document.title;
        document.title = nombre;
        return () => {
            document.title = antes;
        };
    }, [nombre]);
}

/** Imprimir y, si la APK es vieja y no sabe, decirlo (`lib/imprimir.ts`). */
export async function imprimirConAviso() {
    try {
        if ((await imprimir()) === 'actualizar') toast.error('Para imprimir desde el teléfono, actualiza la app del liceo.');
    } catch {
        toast.error('No se pudo abrir la impresión.');
    }
}

/** «Imprimir»: en el navegador, su diálogo; en la APK, el de Android (`lib/imprimir.ts`). */
export function BotonImprimir({ texto = 'Imprimir', className }: { texto?: string; className?: string }) {
    return (
        <button
            type="button"
            onClick={() => void imprimirConAviso()}
            className={
                className ??
                'inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 print:hidden'
            }
        >
            <Printer className="h-4 w-4" aria-hidden /> {texto}
        </button>
    );
}

/**
 * UNA HOJA DEL LICEO PARA IMPRIMIR
 *
 * Lo que comparten la planilla de inscripción, la citación, las notas
 * parciales, el acta del consejo, la constancia de trabajo…: «Volver» e
 * «Imprimir» arriba (no salen en el papel), el membrete oficial, el título, y
 * la firma y el sello abajo. Cada documento pone lo suyo en medio.
 *
 * `papel`: carta vertical (lo normal) u oficio apaisado (las planillas anchas
 * del MPPE, como el resumen final).
 */
export function HojaImprimible({
    etiqueta,
    titulo,
    subtitulo,
    cargando,
    error,
    textoDeCarga = 'Cargando…',
    papel = 'carta',
    paginas = false,
    nombreDelArchivo,
    controles,
    children,
}: {
    /** Nombre de la hoja para los lectores de pantalla (y las pruebas). */
    etiqueta: string;
    titulo?: string;
    subtitulo?: React.ReactNode;
    cargando?: boolean;
    error?: unknown;
    textoDeCarga?: string;
    papel?: Papel;
    /** «Página N de M» al pie: para lo que ocupa varias hojas (listas, actas). */
    paginas?: boolean;
    /** El nombre del PDF al guardarlo (el título de la pestaña). Sin él, `titulo` y `subtitulo`. */
    nombreDelArchivo?: string;
    /** Lo que va junto a «Imprimir» (un selector de lapso, de tipo…). */
    controles?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const router = useRouter();
    useNombreDelDocumento(
        nombreDelArchivo ?? (titulo ? [titulo, typeof subtitulo === 'string' ? subtitulo : null].filter(Boolean).join(' — ') : etiqueta)
    );
    const volver = (
        <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Volver
        </button>
    );
    if (cargando) return <div className="p-8 text-sm text-gray-600">{textoDeCarga}</div>;
    if (error) {
        return (
            <div className="space-y-4 p-8">
                <p className="text-sm font-medium text-red-600">{getApiErrorMessage(error, 'No se pudo cargar el documento.')}</p>
                {volver}
            </div>
        );
    }
    const ancha = papel !== 'carta';
    return (
        <div className={`mx-auto space-y-4 p-4 sm:p-6 print:max-w-none print:p-0 ${ancha ? 'max-w-7xl' : 'max-w-4xl'}`}>
            <EstiloDelPapel papel={papel} paginas={paginas} />
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                {volver}
                <div className="flex flex-wrap items-center gap-2">
                    {controles}
                    <BotonImprimir />
                </div>
            </div>
            <article
                className="rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none"
                aria-label={etiqueta}
            >
                <header className="text-center">
                    <MembreteOficial />
                    {titulo && <h1 className="mt-4 text-base font-bold uppercase tracking-wide text-gray-900">{titulo}</h1>}
                    {subtitulo && <div className="text-sm text-gray-700">{subtitulo}</div>}
                </header>
                {children}
            </article>
        </div>
    );
}

/** Una raya para firmar, con quién firma debajo. */
export function Firma({ nombre, detalle }: { nombre?: string | null; detalle?: React.ReactNode }) {
    return (
        <div className="break-inside-avoid pt-12 text-center text-sm">
            {/* Hasta 224 px, y menos si no cabe: dos firmas lado a lado en un
                teléfono se salían de ancho. */}
            <div className="mx-auto w-full max-w-56 border-t border-gray-600 pt-1">
                {nombre && <span className="block font-medium">{nombre}</span>}
                {detalle && <span className="block text-gray-700">{detalle}</span>}
            </div>
        </div>
    );
}

/** Los párrafos de una plantilla del liceo, ya rellenos por el servidor (texto, no HTML). */
export function Parrafos({ parrafos, className = '' }: { parrafos: string[]; className?: string }) {
    return (
        <>
            {parrafos.map((p, i) => (
                <p key={i} className={`mt-4 text-justify text-sm leading-7 ${className}`}>
                    {p}
                </p>
            ))}
        </>
    );
}

/** «2026-09-27» → «27/09/2026». */
export const fechaCorta = (ymd: string | null | undefined) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '—');
