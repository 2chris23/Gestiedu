'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Printer } from 'lucide-react';
import { useConstancia, type TipoDeConstancia } from '@/hooks/useConstancia';
import { useQuienSoy } from '@/hooks/useQuienSoy';

/**
 * CONSTANCIA DE ESTUDIO O DE BUENA CONDUCTA, PARA IMPRIMIR
 *
 * La hoja que hace constar que el alumno estudia (o estudió) en el liceo, con
 * el membrete, el párrafo y la firma de quien el liceo haya puesto en
 * Configuración → Académico. `?tipo=BUENA_CONDUCTA` para la de conducta (solo
 * el admin). Quién puede, lo decide el servidor.
 */

const ORDINAL = ['', '1er', '2do', '3er', '4to', '5to', '6to'];
const TURNO: Record<string, string> = { MANANA: 'mañana', TARDE: 'tarde', INTEGRAL: 'integral' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «a los 25 días del mes de septiembre de 2026», como se escribe en una constancia. */
const aLosDias = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return `a ${d === 1 ? 'un día' : `los ${d} días`} del mes de ${MESES[m - 1]} de ${y}`;
};

export default function ConstanciaPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const router = useRouter();
    const buscar = useSearchParams();
    const tipo: TipoDeConstancia = buscar.get('tipo') === 'BUENA_CONDUCTA' ? 'BUENA_CONDUCTA' : 'ESTUDIO';
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
                          ? 'El estudiante no está inscrito en el año escolar en curso: no se le puede hacer constar que estudia aquí.'
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

    const titulo = c.tipo === 'ESTUDIO' ? 'Constancia de estudio' : 'Constancia de buena conducta';
    const firmante = c.firmante.nombre ?? '____________________________';
    const quien = `${c.alumno.nombres} ${c.alumno.apellidos}`;
    const anio = `${ORDINAL[c.seccion.grado] ?? `${c.seccion.grado}°`} año, sección «${c.seccion.seccion}»`;
    const turno = c.seccion.turno && TURNO[c.seccion.turno] ? `, turno de la ${TURNO[c.seccion.turno]}` : '';

    return (
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            <div className="flex items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <button
                    onClick={() => window.print()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-12 print:border-0 print:shadow-none" aria-label={titulo}>
                <header className="text-center">
                    <p className="text-lg font-bold text-gray-900">{c.liceo.nombre}</p>
                    {c.liceo.codigoDea && <p className="text-xs text-gray-700">Código del plantel: {c.liceo.codigoDea}</p>}
                    {(c.liceo.direccion || c.liceo.ciudad) && (
                        <p className="text-xs text-gray-600">{[c.liceo.direccion, c.liceo.ciudad].filter(Boolean).join(' · ')}</p>
                    )}
                    <h1 className="mt-8 text-base font-bold uppercase tracking-widest text-gray-900">{titulo}</h1>
                </header>

                <p className="mt-8 text-justify text-sm leading-7 text-gray-900 sm:text-base sm:leading-8">
                    Quien suscribe, <strong>{firmante}</strong>
                    {c.firmante.cedula ? `, titular de la cédula de identidad ${c.firmante.cedula}` : ''}, en su carácter de{' '}
                    {c.firmante.cargo} de <strong>{c.liceo.nombre}</strong>, hace constar por medio de la presente que el (la)
                    estudiante <strong>{quien}</strong>, titular de la cédula {c.alumno.cedula},{' '}
                    {c.tipo === 'ESTUDIO' ? (
                        <>
                            cursa estudios de {c.nivel} en esta institución, en el <strong>{anio}</strong>
                            {turno}, durante el año escolar {c.ciclo.nombre}.
                        </>
                    ) : (
                        <>
                            {c.vigente ? 'cursa' : 'cursó'} estudios de {c.nivel} en esta institución ({anio}, año escolar {c.ciclo.nombre}) y
                            durante su permanencia en ella ha observado <strong>buena conducta</strong>.
                        </>
                    )}
                </p>
                <p className="mt-6 text-justify text-sm leading-7 text-gray-900 sm:text-base sm:leading-8">
                    Constancia que se expide a petición de la parte interesada{c.liceo.ciudad ? ` en ${c.liceo.ciudad}` : ''},{' '}
                    {aLosDias(c.emitidaEl)}.
                </p>

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
