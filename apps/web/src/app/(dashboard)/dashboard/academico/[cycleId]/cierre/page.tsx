'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Loader2 } from 'lucide-react';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { finDeAno, type EstadoDelFinDeAno } from '@/lib/fin-de-ano';
import { getApiErrorMessage } from '@/lib/utils';
import { diferido } from '@/components/common/Diferido';
import { cn } from '@/lib/utils';

/**
 * EL FIN DEL AÑO ESCOLAR, POR PASOS
 *
 * Lo que hace control de estudios al terminar el año, en su orden, cada paso
 * con cómo va (`services/fin-de-ano.service.ts`). Sustituye a entrar directo
 * a «Promoción», que ahora es el paso 6. Cada paso baja al abrirlo.
 */

const PasoFaltantes = diferido(() => import('@/components/fin-de-ano/PasoFaltantes'), { alto: 120 });
const PasoResultado = diferido(() => import('@/components/fin-de-ano/PasoResultado'), { alto: 120 });
const PasoRevision = diferido(() => import('@/components/fin-de-ano/PasoRevision'), { alto: 200 });
const PasoDecisiones = diferido(() => import('@/components/fin-de-ano/PasoDecisiones'), { alto: 200 });
const PasoAnoSiguiente = diferido(() => import('@/components/fin-de-ano/PasoAnoSiguiente'), { alto: 160 });
const PasoCerrar = diferido(() => import('@/components/fin-de-ano/PasoCerrar'), { alto: 120 });

type Tono = 'hecho' | 'falta' | 'info';

export default function FinDelAnoPage() {
    const params = useParams();
    const router = useRouter();
    const cycleParam = decodeURIComponent(params.cycleId as string);
    const { data: anos, isLoading: cargandoAnos } = useAcademicYears();
    const ano = (anos ?? []).find((y: any) => y.id === cycleParam || y.name === cycleParam);

    const { data: estado, isLoading, error } = useQuery({
        queryKey: ['fin-de-ano', ano?.id, 'estado'],
        queryFn: () => finDeAno.estado(ano!.id),
        enabled: !!ano?.id,
    });
    const [abierto, setAbierto] = React.useState<number | null>(null);
    React.useEffect(() => {
        if (estado?.cerrado) setAbierto((a) => a ?? 6);
    }, [estado?.cerrado]);

    if (cargandoAnos || isLoading) {
        return (
            <p className="flex items-center gap-2 p-6 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando el fin del año…
            </p>
        );
    }
    if (!ano) return <p className="p-6 text-sm text-gray-700">Ese año escolar no existe.</p>;
    if (error || !estado) return <p className="p-6 text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo cargar el fin del año.')}</p>;

    const pasos = armarPasos(estado);

    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <header className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={() => router.push(`/dashboard/academico/${estado.ciclo.nombre}`)}
                    aria-label="Volver al ciclo"
                    className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
                >
                    <ArrowLeft className="h-5 w-5" aria-hidden />
                </button>
                <div>
                    <h1 className="text-seccion font-bold text-gray-900 sm:text-pantalla">Fin del año escolar {estado.ciclo.nombre}</h1>
                    <p className="text-sm text-gray-600">
                        {estado.cerrado
                            ? 'Cerrado. Se pueden corregir decisiones (paso 6).'
                            : 'Paso a paso, como lo hace control de estudios. Las reglas son del liceo; lo del MPPE viene por defecto.'}
                    </p>
                </div>
            </header>

            <ol className="space-y-3">
                {pasos.map((p) => {
                    const esteAbierto = abierto === p.n;
                    return (
                        <li key={p.n} className="rounded-2xl border border-gray-200 bg-white shadow-xs">
                            <button
                                type="button"
                                onClick={() => setAbierto(esteAbierto ? null : p.n)}
                                aria-expanded={esteAbierto}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                                <span
                                    className={cn(
                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                                        p.tono === 'hecho' ? 'bg-emerald-100 text-emerald-800' : p.tono === 'falta' ? 'bg-amber-100 text-amber-900' : 'bg-indigo-100 text-indigo-800'
                                    )}
                                >
                                    {p.n}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold text-gray-900">{p.titulo}</span>
                                    <span className="block text-xs text-gray-600">{p.estado}</span>
                                </span>
                                <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', esteAbierto && 'rotate-180')} aria-hidden />
                            </button>
                            {esteAbierto && <div className="border-t border-gray-100 px-4 py-4">{p.contenido}</div>}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

function armarPasos(estado: EstadoDelFinDeAno): Array<{ n: number; titulo: string; estado: string; tono: Tono; contenido: React.ReactNode }> {
    const id = estado.ciclo.id;
    const r = estado.resultado;
    return [
        {
            n: 1,
            titulo: '¿Está todo cargado?',
            estado: 'Qué sección y materia tiene alumnos sin notas del último lapso, y de quién.',
            tono: 'info',
            contenido: <PasoFaltantes cicloId={id} />,
        },
        {
            n: 2,
            titulo: 'Resultado final',
            estado: `${r.promovidos} promovidos · ${r.conPendientes} con pendientes · ${r.noPromovidos} repiten${r.egresados ? ` · ${r.egresados} egresan` : ''}`,
            tono: 'info',
            contenido: <PasoResultado cicloId={id} estado={estado} />,
        },
        {
            n: 3,
            titulo: 'Revisión',
            estado: estado.revision
                ? estado.revision.reprobadas === 0
                    ? 'Nadie tiene materias reprobadas.'
                    : `${estado.revision.conRevision} de ${estado.revision.reprobadas} materias reprobadas con revisión. La pone el profesor de cada materia.`
                : 'Cerrada.',
            tono: estado.revision && estado.revision.conRevision < estado.revision.reprobadas ? 'falta' : 'hecho',
            contenido: <PasoRevision cicloId={id} reglas={estado.config} cerrado={estado.cerrado} />,
        },
        {
            n: 4,
            titulo: 'Decisión por alumno',
            estado: estado.decisiones.cambiadas
                ? `${estado.decisiones.cambiadas} decididas distinto de la sugerencia, con su motivo.`
                : 'La sugerencia del sistema, con las reglas del liceo. Se cambia con motivo.',
            tono: 'info',
            contenido: <PasoDecisiones cicloId={id} reglas={estado.config} cerrado={estado.cerrado} />,
        },
        {
            n: 5,
            titulo: 'El año siguiente',
            estado: estado.anoSiguiente
                ? `${estado.anoSiguiente.nombre}: ${estado.anoSiguiente.secciones} secciones.`
                : 'Falta: se crea con el calendario del MPPE y las secciones de este año.',
            tono: estado.anoSiguiente ? 'hecho' : 'falta',
            contenido: <PasoAnoSiguiente estado={estado} />,
        },
        {
            n: 6,
            titulo: estado.cerrado ? 'Cerrado · corregir' : 'Colocar y cerrar',
            estado: estado.cerrado ? 'Expedientes escritos. Corregir la decisión de un alumno, con motivo.' : 'Cada alumno a su sección, y se cierra el año.',
            tono: estado.cerrado ? 'hecho' : 'falta',
            contenido: <PasoCerrar estado={estado} />,
        },
    ];
}
