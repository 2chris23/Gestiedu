'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Printer } from 'lucide-react';
import { useConstancia, TIPOS_DE_CONSTANCIA, type TipoDeConstancia } from '@/hooks/useConstancia';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { EstiloDelPapel, imprimirConAviso, useNombreDelDocumento } from '@/components/documentos/HojaImprimible';

/**
 * LAS CONSTANCIAS, PARA IMPRIMIR
 *
 * La hoja con el membrete, el texto y la firma de quien el liceo haya puesto
 * en Configuración → Académico. `?tipo=` elige cuál: ESTUDIO (por defecto),
 * BUENA_CONDUCTA, PROSECUCION, RETIRO, INSCRIPCION o LABOR_SOCIAL. El texto es
 * la plantilla del liceo (Configuración → Documentos), rellena en el servidor.
 * Quién puede, lo decide el servidor.
 */

export default function ConstanciaPage({ params }: { params: Promise<{ cedula: string }> }) {
    useNombreDelDocumento('Constancia');
    const { cedula } = use(params);
    const router = useRouter();
    const buscar = useSearchParams();
    const pedido = buscar.get('tipo') as TipoDeConstancia | null;
    const tipo: TipoDeConstancia = pedido && TIPOS_DE_CONSTANCIA.includes(pedido) ? pedido : 'ESTUDIO';
    // `/dashboard/constancia/mia`: la del propio alumno.
    const { yo } = useQuienSoy();
    const deQuien = cedula === 'mia' ? (yo?.id ?? '') : decodeURIComponent(cedula);
    const { data: c, isLoading: cargando, error } = useConstancia(deQuien, tipo);

    if (cargando || (cedula === 'mia' && !yo?.id)) {
        return <div className="p-8 text-sm text-gray-600">Cargando la constancia…</div>;
    }
    if (error || !c) {
        const status = (error as any)?.response?.status;
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">
                    {status === 403
                        ? 'No tienes permiso para sacar esta constancia.'
                        : status === 409
                          ? ((error as any)?.response?.data?.error ?? 'No se puede sacar esta constancia.')
                          : status === 404
                            ? 'Este estudiante no tiene inscripción en ningún ciclo.'
                            : 'No se pudo cargar la constancia.'}
                </p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    const titulo = c.titulo;

    return (
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <EstiloDelPapel papel="carta" />
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <button
                    onClick={() => void imprimirConAviso()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-12 print:p-0 print:border-0 print:shadow-none" aria-label={titulo}>
                <header className="text-center">
                    <MembreteOficial
                        respaldo={{ nombre: c.liceo.nombre, direccion: [c.liceo.direccion, c.liceo.ciudad].filter(Boolean).join(' · ') }}
                    />
                    <h1 className="mt-8 text-base font-bold uppercase tracking-widest text-gray-900">{titulo}</h1>
                </header>

                {/* El texto sale de la plantilla del liceo (Configuración → Documentos),
                    relleno en el servidor: se pinta como TEXTO, nunca como HTML. */}
                {c.parrafos.map((p, i) => (
                    <p key={i} className={`${i === 0 ? 'mt-8' : 'mt-6'} text-justify text-sm leading-7 text-gray-900 sm:text-base sm:leading-8`}>
                        {p}
                    </p>
                ))}

                <footer className="mt-24 text-center text-sm">
                    <div className="mx-auto w-64 border-t border-gray-400 pt-1 text-gray-900">
                        {c.firmante.nombre ?? ''}
                        <span className="block text-gray-700">{c.firmante.cargo}</span>
                        {c.firmante.cedula && <span className="block text-xs text-gray-600">C.I. {c.firmante.cedula}</span>}
                    </div>
                    <p className="mt-6 text-xs text-gray-600">Sello del plantel</p>
                </footer>
            </article>
        </div>
    );
}
