'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Printer } from 'lucide-react';
import api from '@/lib/axios';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { Lista } from '@/components/ui/lista';

/**
 * EL RESUMEN FINAL DEL RENDIMIENTO ESTUDIANTIL, CON EL FORMATO DEL MPPE
 *
 * Una fila por alumno —con su cédula (o cédula escolar), apellidos, nombres,
 * lugar y entidad de nacimiento, sexo y fecha de nacimiento— y una columna por
 * área con su abreviatura; abajo, cuántos aprobaron y reprobaron cada una, los
 * docentes con su cédula y firma, el director y el sello. En los tres tipos
 * del Ministerio: FINAL, REVISIÓN y MATERIA PENDIENTE. Se imprime horizontal,
 * en tamaño oficio. Lo arma el servidor con las reglas del cierre
 * (`services/resumen-final.service.ts`); lo ven el admin y el profesor guía.
 */

type Tipo = 'FINAL' | 'REVISION' | 'MATERIA_PENDIENTE';
type Nota = { definitiva: number | null; revision: number | null; apreciacion?: string | null; estado?: string | null };

interface ResumenFinal {
    tipo: Tipo;
    liceo: { nombre: string; codigo: string | null; direccion: string | null; ciudad: string | null };
    membrete: { codigoDelPlanDeEstudio?: string | null };
    mesYAno: string;
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    ciclo: { id: string; nombre: string; cerrado: boolean };
    seccion: { id: string; grado: number; seccion: string; turno: string | null; guia: string | null };
    materias: Array<{ id: string; nombre: string; cualitativa?: boolean; abreviatura: string; docente: { nombre: string; cedula: string } | null }>;
    alumnos: Array<{
        cedula: string;
        tipoDeCedula: string | null;
        apellidos: string;
        nombres: string;
        sexo: string | null;
        fechaDeNacimiento: string | null;
        lugarDeNacimiento: string | null;
        entidadDeNacimiento: string | null;
        notas: Record<string, Nota>;
        reprobadas: number;
        promedio: number | null;
        condicion: 'PROMOVIDO' | 'PROMOVIDO_CON_PENDIENTES' | 'NO_PROMOVIDO';
    }>;
    porMateria: Record<string, { aprobados: number; reprobados: number; sinNotas: number }>;
    totales: { inscritos: number; retirados: number; promovidos: number; conPendientes: number; noPromovidos: number };
    reglas: { notaMinima: number; redondeo: 'MPPE' | 'NINGUNO'; maxPendientes: number };
    emitidoEl: string;
}

const TIPOS: Array<{ valor: Tipo; texto: string }> = [
    { valor: 'FINAL', texto: 'Final' },
    { valor: 'REVISION', texto: 'Revisión' },
    { valor: 'MATERIA_PENDIENTE', texto: 'Materia pendiente' },
];

const CONDICION: Record<string, string> = {
    PROMOVIDO: 'Promovido',
    PROMOVIDO_CON_PENDIENTES: 'Con pendiente',
    NO_PROMOVIDO: 'Repite',
};

const nota = (n: number | null | undefined) =>
    n === null || n === undefined ? '' : Number.isInteger(n) ? String(n).padStart(2, '0') : n.toFixed(2);
const fecha = (ymd: string | null) => (ymd ? ymd.split('-').reverse().join('/') : '');
const SEXO: Record<string, string> = { MASCULINO: 'M', FEMENINO: 'F' };

/** Lo que va en la casilla según el tipo de resumen. */
function casilla(tipo: Tipo, n: Nota | undefined): string {
    if (!n) return '';
    if (n.apreciacion !== undefined && n.apreciacion !== null) return n.apreciacion;
    if (tipo === 'REVISION') return nota(n.revision);
    if (tipo === 'MATERIA_PENDIENTE') return n.estado === 'PENDIENTE' ? 'P' : nota(n.definitiva);
    return nota(n.definitiva);
}

const CELDA = 'border border-gray-400 px-1 py-0.5';

export default function ResumenFinalPage({ params }: { params: Promise<{ classroomId: string }> }) {
    const { classroomId } = use(params);
    const router = useRouter();
    const buscar = useSearchParams();
    const inicial = TIPOS.some((t) => t.valor === buscar.get('tipo')) ? (buscar.get('tipo') as Tipo) : 'FINAL';
    const [tipo, setTipo] = React.useState<Tipo>(inicial);
    // Por `useQuery`: así se guarda en el teléfono y se puede ver sin señal.
    const { data: r, isLoading, error } = useQuery<ResumenFinal>({
        queryKey: ['resumen-final', classroomId, tipo],
        queryFn: async () => (await api.get(`/classrooms/${encodeURIComponent(classroomId)}/resumen-final?tipo=${tipo}`)).data.data,
        retry: (veces, e: any) => {
            const status = e?.response?.status;
            return !(status >= 400 && status < 500) && veces < 2;
        },
    });

    if (isLoading) return <div className="p-8 text-sm text-gray-600">Cargando el resumen final…</div>;
    if (error || !r) {
        const status = (error as any)?.response?.status;
        return (
            <div className="p-8">
                <p className="text-sm font-medium text-red-600">
                    {status === 403
                        ? 'El resumen final lo ven el admin y el profesor guía de la sección.'
                        : status === 404
                          ? 'Esta sección no existe.'
                          : 'No se pudo cargar el resumen final.'}
                </p>
                <button onClick={() => router.back()} className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-indigo-700 hover:underline">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>
        );
    }

    const min = r.reglas.notaMinima;
    const conCondicion = r.tipo === 'FINAL';
    const tituloDelTipo = TIPOS.find((t) => t.valor === r.tipo)?.texto.toUpperCase();

    return (
        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6 print:max-w-none print:p-0">
            {/* Horizontal y en oficio, como la planilla del Ministerio. */}
            <style>{`@media print { @page { size: 330mm 216mm; margin: 8mm; } }`}</style>
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <button onClick={() => router.back()} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-52">
                        <Lista etiqueta="Tipo de resumen" valor={tipo} alCambiar={(v) => setTipo(v as Tipo)} opciones={TIPOS} />
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <Printer className="h-4 w-4" /> Imprimir
                    </button>
                </div>
            </div>

            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 print:border-0 print:p-0 print:shadow-none" aria-label="Resumen final del rendimiento">
                <header className="border-b border-gray-300 pb-3">
                    <MembreteOficial respaldo={{ nombre: r.liceo.nombre, direccion: [r.liceo.direccion, r.liceo.ciudad].filter(Boolean).join(' · ') }} />
                    <h1 className="mt-2 text-center text-base font-bold uppercase tracking-wide text-gray-900">Resumen final del rendimiento estudiantil</h1>
                    <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-800 sm:grid-cols-4">
                        <div><dt className="inline font-semibold">Tipo de evaluación: </dt><dd className="inline">{tituloDelTipo}</dd></div>
                        <div><dt className="inline font-semibold">Mes y año: </dt><dd className="inline">{r.mesYAno}</dd></div>
                        <div><dt className="inline font-semibold">Año escolar: </dt><dd className="inline">{r.ciclo.nombre}</dd></div>
                        <div><dt className="inline font-semibold">Plan de estudio: </dt><dd className="inline">{r.membrete.codigoDelPlanDeEstudio ?? '—'}</dd></div>
                        <div><dt className="inline font-semibold">Año y sección: </dt><dd className="inline">{r.seccion.grado}° «{r.seccion.seccion}»</dd></div>
                        {r.seccion.guia && <div><dt className="inline font-semibold">Guía: </dt><dd className="inline">{r.seccion.guia}</dd></div>}
                    </dl>
                    {!r.ciclo.cerrado && r.tipo === 'FINAL' && (
                        <p className="mt-1 text-xs font-medium text-amber-800 print:hidden">
                            El año no se ha cerrado: la condición es la que sugiere el sistema con las reglas del liceo.
                        </p>
                    )}
                </header>

                {r.alumnos.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-700">
                        {r.tipo === 'REVISION' ? 'Nadie de esta sección presentó revisión.' : r.tipo === 'MATERIA_PENDIENTE' ? 'Nadie de esta sección cursó materias pendientes este año.' : 'La sección no tiene alumnos.'}
                    </p>
                ) : (
                    <div className="relative mt-3 overflow-x-auto">
                        <table className="w-full border-collapse text-[11px] leading-tight print:text-[9px]">
                            <thead>
                                <tr className="bg-gray-100 text-gray-800">
                                    <th scope="col" className={CELDA}>N.º</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Cédula</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Apellidos</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Nombres</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Lugar de nac.</th>
                                    <th scope="col" className={CELDA}>E.F.</th>
                                    <th scope="col" className={CELDA}>Sexo</th>
                                    <th scope="col" className={CELDA}>Fecha de nac.</th>
                                    {r.materias.map((m) => (
                                        <th key={m.id} scope="col" title={m.nombre} className={CELDA}>{m.abreviatura}</th>
                                    ))}
                                    {conCondicion && <th scope="col" className={CELDA}>Prom.</th>}
                                    {conCondicion && <th scope="col" className={CELDA}>Condición</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {r.alumnos.map((a, i) => (
                                    <tr key={a.cedula}>
                                        <td className={`${CELDA} text-center tabular-nums`}>{i + 1}</td>
                                        <td className={`${CELDA} font-mono`}>
                                            {a.cedula}
                                            {a.tipoDeCedula === 'ESCOLAR' && <span className="ml-0.5 text-[9px]">(CE)</span>}
                                        </td>
                                        <th scope="row" className={`${CELDA} text-left font-medium`}>{a.apellidos}</th>
                                        <td className={CELDA}>{a.nombres}</td>
                                        <td className={CELDA}>{a.lugarDeNacimiento ?? ''}</td>
                                        <td className={`${CELDA} text-center`}>{a.entidadDeNacimiento ?? ''}</td>
                                        <td className={`${CELDA} text-center`}>{a.sexo ? SEXO[a.sexo] ?? '' : ''}</td>
                                        <td className={`${CELDA} text-center tabular-nums`}>{fecha(a.fechaDeNacimiento)}</td>
                                        {r.materias.map((m) => {
                                            const n = a.notas[m.id];
                                            const texto = casilla(r.tipo, n);
                                            const numero = Number(texto);
                                            return (
                                                <td key={m.id} className={`${CELDA} text-center tabular-nums ${texto && Number.isFinite(numero) && numero < min ? 'font-bold text-red-700 print:text-black' : ''}`}>
                                                    {texto}
                                                </td>
                                            );
                                        })}
                                        {conCondicion && <td className={`${CELDA} text-center font-semibold tabular-nums`}>{nota(a.promedio)}</td>}
                                        {conCondicion && <td className={`${CELDA} text-center`}>{CONDICION[a.condicion]}</td>}
                                    </tr>
                                ))}
                                {r.tipo !== 'MATERIA_PENDIENTE' && (
                                    <>
                                        <tr className="bg-gray-50">
                                            <th scope="row" colSpan={8} className={`${CELDA} text-right font-semibold`}>Aprobados</th>
                                            {r.materias.map((m) => (
                                                <td key={m.id} className={`${CELDA} text-center tabular-nums`}>{m.cualitativa ? '—' : r.porMateria[m.id].aprobados}</td>
                                            ))}
                                            {conCondicion && <td colSpan={2} className={CELDA} />}
                                        </tr>
                                        <tr className="bg-gray-50">
                                            <th scope="row" colSpan={8} className={`${CELDA} text-right font-semibold`}>Reprobados</th>
                                            {r.materias.map((m) => (
                                                <td key={m.id} className={`${CELDA} text-center tabular-nums`}>{m.cualitativa ? '—' : r.porMateria[m.id].reprobados}</td>
                                            ))}
                                            {conCondicion && <td colSpan={2} className={CELDA} />}
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] print:grid-cols-[2fr_1fr]">
                    <table className="w-full border-collapse text-[11px] print:text-[9px]" aria-label="Docentes">
                        <thead>
                            <tr className="bg-gray-100 text-gray-800">
                                <th scope="col" className={CELDA}>Área</th>
                                <th scope="col" className={`${CELDA} text-left`}>Nombre del área</th>
                                <th scope="col" className={`${CELDA} text-left`}>Docente</th>
                                <th scope="col" className={CELDA}>Cédula</th>
                                <th scope="col" className={`${CELDA} w-28`}>Firma</th>
                            </tr>
                        </thead>
                        <tbody>
                            {r.materias.map((m) => (
                                <tr key={m.id}>
                                    <td className={`${CELDA} text-center font-semibold`}>{m.abreviatura}</td>
                                    <td className={CELDA}>{m.nombre}</td>
                                    <td className={CELDA}>{m.docente?.nombre ?? ''}</td>
                                    <td className={`${CELDA} font-mono`}>{m.docente?.cedula ?? ''}</td>
                                    <td className={CELDA} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="space-y-3 text-xs text-gray-800">
                        {r.tipo === 'FINAL' && (
                            <dl className="grid grid-cols-2 gap-1">
                                <dt>Inscritos</dt><dd className="font-bold tabular-nums">{r.totales.inscritos}</dd>
                                <dt>Retirados</dt><dd className="font-bold tabular-nums">{r.totales.retirados}</dd>
                                <dt>Promovidos</dt><dd className="font-bold tabular-nums">{r.totales.promovidos}</dd>
                                <dt>Con pendiente</dt><dd className="font-bold tabular-nums">{r.totales.conPendientes}</dd>
                                <dt>Repiten</dt><dd className="font-bold tabular-nums">{r.totales.noPromovidos}</dd>
                            </dl>
                        )}
                        <div className="pt-10 text-center">
                            <div className="mx-auto w-56 border-t border-gray-500 pt-1">
                                {r.firmante.nombre ?? ''}
                                <span className="block">{r.firmante.cargo}</span>
                                {r.firmante.cedula && <span className="block">C.I. {r.firmante.cedula}</span>}
                            </div>
                            <p className="mt-3">Sello del plantel</p>
                        </div>
                    </div>
                </div>
                <p className="mt-2 text-[11px] text-gray-600">
                    Nota mínima aprobatoria: {min}. {r.tipo === 'MATERIA_PENDIENTE' ? 'P: pendiente todavía.' : ''} (CE): cédula escolar.
                </p>
            </article>
        </div>
    );
}
