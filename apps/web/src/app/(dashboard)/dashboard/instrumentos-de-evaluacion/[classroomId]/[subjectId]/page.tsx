'use client';

import { use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { HojaImprimible } from '@/components/documentos/HojaImprimible';
import { useInstrumentosDelLapso, type AlumnoDeLaLista, type EvaluacionConInstrumento } from '@/hooks/useInstrumentos';
import { NOMBRE_DEL_TIPO } from '@/components/evaluation/nombres-de-instrumentos';
import { NIVELES_POR_DEFECTO, notaDelInstrumento, type Instrumento, type Marcas } from '@/lib/instrumentos';

/**
 * LOS INSTRUMENTOS DE EVALUACIÓN DEL LAPSO, PARA IMPRIMIR
 *
 * Cada evaluación del plan con su técnica y su instrumento: la escala o la
 * rúbrica con sus niveles, cada indicador con su descripción, y la planilla de
 * la sección (N.º, nombre, un hueco por criterio y la nota). Sale con las notas
 * ya puestas en la clase; con `?enBlanco=1`, vacía para llenarla a mano.
 * `?evaluacion=<fila>` saca una sola; sin él, todas. `?lapso=1|2|3`.
 */
const CELDA = 'border border-gray-500 px-1.5 py-1';

function Referencia({ def }: { def: Instrumento }) {
    if (def.tipo === 'COTEJO' || def.tipo === 'PUNTOS') {
        // Lo que se mira en cada indicador y lo que vale.
        if (!def.criterios.some((c) => c.descripcion)) return null;
        return (
            <div className="relative mt-2 overflow-x-auto print:overflow-visible" data-carril-a-proposito>
        <table className="w-full border-collapse text-[11px]">
                <thead>
                    <tr className="bg-gray-100">
                        <th scope="col" className={`${CELDA} text-left`}>{def.tipo === 'COTEJO' ? 'Indicador' : 'Criterio'}</th>
                        <th scope="col" className={`${CELDA} text-left`}>Descripción</th>
                        <th scope="col" className={`${CELDA} w-14`}>Puntos</th>
                    </tr>
                </thead>
                <tbody>
                    {def.criterios.map((c) => (
                        <tr key={c.id} className="break-inside-avoid">
                            <th scope="row" className={`${CELDA} text-left font-medium`}>{c.texto}</th>
                            <td className={`${CELDA} align-top`}>{c.descripcion ?? ''}</td>
                            <td className={`${CELDA} text-center`}>{c.puntos}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        );
    }
    const niveles = def.niveles ?? NIVELES_POR_DEFECTO;
    return (
        <div className="relative mt-2 overflow-x-auto print:overflow-visible" data-carril-a-proposito>
        <table className="w-full border-collapse text-[11px]">
            <thead>
                <tr className="bg-gray-100">
                    <th scope="col" className={`${CELDA} text-left`}>Criterio</th>
                    {niveles.map((n) => (
                        <th key={n.id} scope="col" className={CELDA}>
                            {n.id} · {n.nombre} ({n.valor})
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {def.criterios.map((c) => (
                    <tr key={c.id} className="break-inside-avoid">
                        <th scope="row" className={`${CELDA} text-left font-medium`}>
                            {c.texto}
                            {(c.peso ?? 1) !== 1 ? ` (×${c.peso})` : ''}
                            {c.descripcion && <span className="block font-normal text-gray-700">{c.descripcion}</span>}
                        </th>
                        {niveles.map((n) => (
                            <td key={n.id} className={`${CELDA} align-top`}>
                                {def.tipo === 'RUBRICA' ? def.descriptores?.[c.id]?.[n.id] ?? '' : ''}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
}

function marcaLegible(def: Instrumento, m: Marcas[string] | undefined) {
    if (m === undefined || m === null) return '';
    // La lista de cotejo guarda puntos (antes, sí/no: sí es todo lo que vale).
    if (def.tipo === 'COTEJO') return m === true ? '✓' : m === false ? '' : String(m);
    return String(m);
}

function Planilla({ def, alumnos, detalle }: { def: Instrumento; alumnos: AlumnoDeLaLista[]; detalle?: Record<string, { marcas: Marcas; total: number | null }> }) {
    const cabeza = (c: Instrumento['criterios'][number]) => (def.tipo === 'COTEJO' || def.tipo === 'PUNTOS' ? `${c.texto} (${c.puntos} pts)` : c.texto);
    return (
        <div className="relative mt-2 overflow-x-auto print:overflow-visible" data-carril-a-proposito>
        <table className="w-full border-collapse text-[11px]">
            <thead>
                <tr className="bg-gray-100">
                    <th scope="col" className={`${CELDA} w-8`}>N.º</th>
                    <th scope="col" className={`${CELDA} text-left`}>Nombre y apellido</th>
                    {def.criterios.map((c) => (
                        <th key={c.id} scope="col" className={CELDA}>
                            {cabeza(c)}
                        </th>
                    ))}
                    <th scope="col" className={`${CELDA} w-14`}>Nota</th>
                </tr>
            </thead>
            <tbody>
                {alumnos.map((a) => {
                    const suyo = detalle?.[a.id];
                    let nota: number | null = null;
                    if (suyo) {
                        try {
                            nota = notaDelInstrumento(def, suyo.marcas);
                        } catch {
                            nota = suyo.total;
                        }
                    }
                    return (
                        <tr key={a.id} className="h-7 break-inside-avoid">
                            <td className={`${CELDA} text-center`}>{a.n}</td>
                            <td className={CELDA}>
                                {a.nombres} {a.apellidos}
                            </td>
                            {def.criterios.map((c) => (
                                <td key={c.id} className={`${CELDA} text-center`}>
                                    {suyo ? marcaLegible(def, suyo.marcas?.[c.id]) : ''}
                                </td>
                            ))}
                            <td className={`${CELDA} text-center font-bold`}>{nota ?? ''}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        </div>
    );
}

function Evaluacion({ e, i, alumnos, conNotas }: { e: EvaluacionConInstrumento; i: number; alumnos: AlumnoDeLaLista[]; conNotas: boolean }) {
    return (
        // Sin «no partir la sección»: una planilla de treinta alumnos no cabe
        // debajo del membrete, y la regla la mandaba entera a la hoja siguiente
        // y dejaba la primera en blanco. Se parte por las filas (cada fila,
        // entera) y el título no se queda solo al pie de una hoja.
        <section className="mt-6">
            <h2 className="break-after-avoid text-sm font-bold">
                Actividad {i + 1}: {e.actividad || 'Evaluación'} — semana {e.semana} ({e.puntos} pts.)
            </h2>
            <p className="text-xs text-gray-700">
                {[e.tecnica && `Técnica: ${e.tecnica}`, e.instrumento ? `Instrumento: ${NOMBRE_DEL_TIPO[e.instrumento.tipo]} (vale ${e.maximo}; se lleva a los ${e.puntos} pts. de la evaluación)` : e.nombreDelInstrumento && `Instrumento: ${e.nombreDelInstrumento}`]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {e.instrumento ? (
                <>
                    <Referencia def={e.instrumento} />
                    {conNotas && e.calificadas.length > 0 ? (
                        (
                            e.calificadas.map((c) => (
                                <div key={c.id} className="mt-3">
                                    <p className="text-xs font-semibold">{c.titulo}</p>
                                    <Planilla def={c.instrumento} alumnos={alumnos} detalle={c.detalle} />
                                </div>
                            ))
                        )
                    ) : (
                        <Planilla def={e.instrumento} alumnos={alumnos} />
                    )}
                </>
            ) : (
                <p className="mt-1 text-xs text-gray-600">Sin instrumento armado en el sistema.</p>
            )}
        </section>
    );
}

export default function InstrumentosDeEvaluacionPage({ params }: { params: Promise<{ classroomId: string; subjectId: string }> }) {
    const { classroomId, subjectId } = use(params);
    const q = useSearchParams();
    const lapso = q.get('lapso') || '1';
    // Con las notas, salvo que se pida en blanco (antes era al revés, y el
    // profesor imprimía la hoja vacía creyendo que salía con lo que puso).
    const conNotas = q.get('enBlanco') !== '1';
    const soloUna = q.get('evaluacion');
    const { data: d, isLoading, error } = useInstrumentosDelLapso(decodeURIComponent(classroomId), decodeURIComponent(subjectId), lapso, conNotas);
    const otra = `/dashboard/instrumentos-de-evaluacion/${classroomId}/${subjectId}?lapso=${lapso}${soloUna ? `&evaluacion=${encodeURIComponent(soloUna)}` : ''}${conNotas ? '&enBlanco=1' : ''}`;
    const evaluaciones = d ? (soloUna ? d.evaluaciones.filter((e) => e.id === soloUna) : d.evaluaciones) : [];
    const una = soloUna && evaluaciones[0];

    return (
        <HojaImprimible
            etiqueta="Instrumentos de evaluación"
            titulo={d ? (una ? `Instrumento de evaluación de ${d.area}` : `Instrumentos de evaluación de ${d.area}`) : 'Instrumentos de evaluación'}
            subtitulo={d ? `${d.seccion} · ${d.lapso} · ${d.ciclo} · Docente: ${d.docente}` : undefined}
            nombreDelArchivo={d ? (una ? `Instrumento semana ${una.semana} — ${d.area} ${d.seccion}` : `Instrumentos — ${d.area} ${d.seccion}`) : undefined}
            paginas
            cargando={isLoading}
            error={error}
            textoDeCarga="Preparando los instrumentos…"
            controles={
                <Link href={otra} className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                    {conNotas ? 'Sacarla en blanco' : 'Con las notas'}
                </Link>
            }
        >
            {d &&
                (evaluaciones.length === 0 ? (
                    <p className="mt-6 text-sm text-gray-600">{soloUna ? 'Esa evaluación ya no está en el plan.' : 'El plan de este lapso no tiene evaluaciones con puntos.'}</p>
                ) : (
                    evaluaciones.map((e) => <Evaluacion key={e.id} e={e} i={d.evaluaciones.indexOf(e)} alumnos={d.alumnos} conNotas={conNotas} />)
                ))}
        </HojaImprimible>
    );
}
