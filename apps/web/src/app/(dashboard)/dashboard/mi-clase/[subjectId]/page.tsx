'use client';

import * as React from 'react';
import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, ChevronLeft, ClipboardList, Loader2, MessageSquareText } from 'lucide-react';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useMiClase, type ActividadDeMiClase } from '@/hooks/useMiClase';
import { ESTADO_DE_ACTIVIDAD } from '@/hooks/useActividadesDelAlumno';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import PlanPorBloques from '@/components/evaluation/PlanPorBloques';
import { dbRowsToWeekRows, getWeekDates } from '@/components/evaluation/planEnSemanas';
import { DEFAULT_PLAN_COLUMNS, type PlanColumnDef } from '@/components/evaluation/planColumns';
import { cn } from '@/lib/utils';
import { BotonesDeAsistencia } from '@/components/asistencia/AsistenciaDelAlumno';
import { NIVELES_POR_DEFECTO, type Instrumento, type Marcas } from '@/lib/instrumentos';

/**
 * «MI CLASE»: LA MATERIA, VISTA POR EL ALUMNO O SU REPRESENTANTE
 *
 * Se llega tocando una clase del horario. Antes se abría una ventanita con el
 * tema del día; el liceo quiere que el alumno vea lo que necesita de esa
 * materia: el plan de evaluación, sus actividades con SU nota y SUS
 * observaciones. Nada de los compañeros: eso lo recorta el servidor.
 *
 * Solo mira: el alumno no sube, no edita, no agrega nada.
 *
 * El representante llega con `?alumno=<id>` (el de su representado); el
 * servidor comprueba que de verdad lo sea.
 */

type Pestana = 'plan' | 'actividades' | 'observaciones';

const fechaLegible = (iso: string | null) => {
    if (!iso) return 'Sin fecha';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

const CAMPOS_DEL_MEMBRETE: Array<{ clave: string; texto: string }> = [
    { clave: 'peic', texto: 'PEIC' },
    { clave: 'temaIndispensable', texto: 'Tema indispensable' },
    { clave: 'enfasisCurricular', texto: 'Énfasis curricular' },
    { clave: 'referentesEticos', texto: 'Referentes éticos' },
    { clave: 'intencionalidad', texto: 'Intencionalidad' },
];

/**
 * Cómo le fue en cada criterio del instrumento: «Portada 2/2 · Firmas 0/5…»,
 * o el nivel en la escala. Solo lo suyo (MICLASE-07).
 */
function DesgloseDelInstrumento({ instrumento, marcas }: { instrumento: Instrumento; marcas: Marcas }) {
    const niveles = instrumento.niveles ?? NIVELES_POR_DEFECTO;
    return (
        <ul className="mt-1 space-y-0.5 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-800" aria-label="Cómo le fue en cada criterio">
            {instrumento.criterios.map((c) => {
                const m = marcas?.[c.id];
                const que =
                    instrumento.tipo === 'COTEJO'
                        ? `${m === true ? c.puntos : 0} / ${c.puntos}`
                        : instrumento.tipo === 'PUNTOS'
                          ? `${typeof m === 'number' ? m : '—'} / ${c.puntos}`
                          : niveles.find((n) => n.id === m)?.nombre ?? '—';
                return (
                    <li key={c.id} className="flex justify-between gap-3">
                        <span>{c.texto}</span>
                        <span className="font-semibold tabular-nums">{que}</span>
                    </li>
                );
            })}
        </ul>
    );
}

function Actividad({ a }: { a: ActividadDeMiClase }) {
    const estado = ESTADO_DE_ACTIVIDAD[a.estado];
    return (
        <li className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">{a.title}</p>
                <p className="mt-0.5 text-xs text-gray-700">
                    {a.tag || a.type}
                    {' · '}
                    {fechaLegible(a.fecha)}
                    {a.semana ? ` · Semana ${a.semana}` : ''}
                </p>
                {a.criterio && <p className="mt-0.5 text-xs text-gray-600">Del plan: {a.criterio}</p>}
                {a.instrumento && a.miDetalle && <DesgloseDelInstrumento instrumento={a.instrumento} marcas={a.miDetalle.marcas} />}
                {a.otraForma && (
                    <p className="mt-1 inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        Evaluado con: {a.otraForma.metodo}
                        {a.otraForma.motivo ? ` (${a.otraForma.motivo})` : ''}
                    </p>
                )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', estado.clases)}>
                    {estado.texto}
                </span>
                {a.estado === 'EVALUADA' && (
                    <span className="text-sm font-bold text-gray-900">
                        {a.nota} / {a.maxScore ?? 20}
                    </span>
                )}
            </div>
        </li>
    );
}

export default function MiClasePage({ params }: { params: Promise<{ subjectId: string }> }) {
    const { subjectId } = use(params);
    const router = useRouter();
    const buscar = useSearchParams();
    const { yo } = useQuienSoy();

    // El alumno mira lo suyo; el representante, lo del representado que diga
    // la dirección (el servidor responde 403 si no es suyo).
    const alumnoId = yo?.role === 'STUDENT' ? yo.id : buscar.get('alumno');

    const [lapso, setLapso] = React.useState<string | null>(null);
    const [pestana, setPestana] = React.useState<Pestana>('plan');
    const { data, isLoading, error } = useMiClase(alumnoId, subjectId, lapso);

    const columnas: PlanColumnDef[] = React.useMemo(() => {
        const propias = data?.plan.membrete?.customColumns;
        if (propias) {
            try {
                const leidas = JSON.parse(propias);
                if (Array.isArray(leidas) && leidas.length > 0) return leidas;
            } catch {}
        }
        return DEFAULT_PLAN_COLUMNS;
    }, [data?.plan.membrete?.customColumns]);

    const semanas = React.useMemo(() => {
        if (!data) return [];
        const mayor = Math.max(0, ...data.plan.filas.map((f) => f.endWeekNumber ?? f.weekNumber ?? 0));
        return dbRowsToWeekRows(data.plan.filas, Math.max(data.semanas ?? 0, mayor, 1));
    }, [data]);

    const nada = () => undefined;

    if (!alumnoId || isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Cargando la clase" />
            </div>
        );
    }

    if (error || !data) {
        const codigo = (error as any)?.response?.status;
        return (
            <div className="mx-auto max-w-xl space-y-4 p-4">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-indigo-700"
                >
                    <ChevronLeft size={18} /> Volver
                </button>
                <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-800">
                    {codigo === 403
                        ? 'Esta clase no es de tu representado.'
                        : codigo === 404
                          ? 'Esa materia no es de su sección.'
                          : 'No se pudo cargar la clase.'}
                </p>
            </div>
        );
    }

    const membrete = data.plan.membrete ?? {};
    const conMembrete = CAMPOS_DEL_MEMBRETE.filter((c) => membrete[c.clave]);
    const pestanas: Array<{ clave: Pestana; texto: string; icono: React.ReactNode }> = [
        { clave: 'plan', texto: 'Plan', icono: <BookOpen size={16} aria-hidden /> },
        { clave: 'actividades', texto: `Actividades · ${data.actividades.length}`, icono: <ClipboardList size={16} aria-hidden /> },
        { clave: 'observaciones', texto: `Observaciones · ${data.observaciones.length}`, icono: <MessageSquareText size={16} aria-hidden /> },
    ];

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-indigo-700"
            >
                <ChevronLeft size={18} /> Volver
            </button>

            <EncabezadoDePantalla
                titulo={data.materia.name}
                descripcion={[data.seccion.name, data.profesor ? `Prof. ${data.profesor}` : null].filter(Boolean).join(' · ')}
            />

            {/* La asistencia por QR, desde su clase: escanear el QR del profesor
                o enseñar el suyo. Solo el alumno (el representante no pasa
                lista por él), y solo si el liceo la usa. */}
            {yo?.role === 'STUDENT' && <BotonesDeAsistencia />}

            {data.lapsos.length > 1 && (
                <div
                    className="grid gap-1 rounded-2xl bg-gray-100 p-1"
                    style={{ gridTemplateColumns: `repeat(${data.lapsos.length}, minmax(0, 1fr))` }}
                    role="group"
                    aria-label="Lapso"
                >
                    {data.lapsos.map((l) => (
                        <button
                            key={l.numero}
                            type="button"
                            onClick={() => setLapso(l.numero)}
                            aria-pressed={data.lapso === l.numero}
                            className={cn(
                                'relative min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors',
                                data.lapso === l.numero ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 hover:bg-white/70'
                            )}
                        >
                            Lapso {l.numero}
                            {l.numero === data.lapsoDeHoy && (
                                <span
                                    className={cn(
                                        'ml-1.5 inline-block h-2 w-2 rounded-full align-middle',
                                        data.lapso === l.numero ? 'bg-white' : 'bg-emerald-500'
                                    )}
                                    title="El lapso de ahora"
                                    aria-label="(el de ahora)"
                                />
                            )}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-gray-200 bg-white p-1" role="tablist">
                {pestanas.map((p) => (
                    <button
                        key={p.clave}
                        type="button"
                        role="tab"
                        aria-selected={pestana === p.clave}
                        onClick={() => setPestana(p.clave)}
                        className={cn(
                            'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:text-sm',
                            pestana === p.clave ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200' : 'text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        {p.icono}
                        <span>{p.texto}</span>
                    </button>
                ))}
            </div>

            {pestana === 'plan' && (
                <section className="space-y-3" role="tabpanel">
                    {conMembrete.length > 0 && (
                        <dl className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
                            {conMembrete.map((c) => (
                                <div key={c.clave}>
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">{c.texto}</dt>
                                    <dd className="mt-0.5 text-sm text-gray-900">{membrete[c.clave]}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {data.plan.filas.length === 0 ? (
                        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-800">
                            El profesor todavía no ha cargado el plan de este lapso.
                        </p>
                    ) : (
                        <PlanPorBloques
                            semanas={semanas}
                            columnas={columnas}
                            fechasDe={(n) => getWeekDates(data.inicioDelLapso ?? undefined, n)}
                            puedeEditar={false}
                            paraElAlumno
                            alEscribir={nada}
                            alAlargar={nada}
                            alAcortar={nada}
                        />
                    )}
                </section>
            )}

            {pestana === 'actividades' && (
                <section className="rounded-2xl border border-gray-200 bg-white" role="tabpanel">
                    {data.actividades.length === 0 ? (
                        <p className="p-6 text-center text-sm text-gray-800">Todavía no hay actividades en esta materia.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {data.actividades.map((a) => (
                                <Actividad key={a.id} a={a} />
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {pestana === 'observaciones' && (
                <section className="space-y-3" role="tabpanel">
                    {data.observaciones.length === 0 ? (
                        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-800">
                            No hay observaciones en esta materia.
                        </p>
                    ) : (
                        data.observaciones.map((o) => (
                            <article key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                                <p className="text-xs font-semibold text-gray-600">
                                    {fechaLegible(o.date)}
                                    {o.profesor ? ` · Prof. ${o.profesor}` : ''}
                                </p>
                                <h3 className="mt-1 text-sm font-bold text-gray-900">{o.title}</h3>
                                {o.description && <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{o.description}</p>}
                            </article>
                        ))
                    )}
                </section>
            )}
        </div>
    );
}
