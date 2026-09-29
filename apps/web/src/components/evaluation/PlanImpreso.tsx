'use client';

import { useEvaluationPlanMetadata, useEvaluationPlanRows, type AutoPopulatedData, type EvaluationPlanMetadata } from '@/hooks/useEvaluationPlan';
import { useMembrete } from '@/hooks/useMembrete';
import { LOGO_DEL_MINISTERIO } from '@/components/documentos/MembreteOficial';
import { getAssetUrl } from '@/config/env';
import { DEFAULT_PLAN_COLUMNS, type PlanColumnDef } from './planColumns';
import { dbRowsToWeekRows, getWeekDates, type WeekRow } from './planEnSemanas';
import { fechaCorta } from '@/components/documentos/HojaImprimible';

/**
 * EL PLAN DE EVALUACIÓN EN PAPEL
 *
 * Como lo entrega un profesor en un liceo (el de Física del «Medardo
 * Bacalao», 2026-27, sirvió de modelo): arriba el docente con su cédula,
 * teléfono y correo, el área, el año y la sección, el momento, las fechas y
 * los referentes; en medio el plan del lapso, SOLO con las semanas que tienen
 * algo (no dieciocho filas vacías); abajo «Entregado por / Fecha de entrega /
 * Recibido por», las observaciones y las firmas del docente y del coordinador.
 *
 * Antes se imprimía la pantalla de la sección entera, cortada a una hoja.
 */

const LAPSOS: Record<string, string> = { '1': '1er Momento', '2': '2do Momento', '3': '3er Momento' };
const CELDA = 'border border-gray-500 px-1.5 py-1 align-middle';
const ETIQUETA = 'border border-gray-500 bg-gray-100 px-1.5 py-1 font-bold uppercase';

/** Las semanas con algo escrito, y cuántas de ellas abarca cada celda unida. */
function semanasConContenido(semanas: WeekRow[], columnas: PlanColumnDef[]) {
    const conAlgo = semanas.filter((w) => columnas.some((c) => w.data[c.key] !== undefined && w.data[c.key] !== '' && w.data[c.key] !== 0));
    const incluidas = new Set(conAlgo.map((w) => w.weekNumber));
    // columna → semana donde empieza la celda → filas (de las incluidas) que abarca
    const abarca = new Map<string, Map<number, number>>();
    const tapadas = new Map<string, Set<number>>();
    for (const c of columnas) {
        abarca.set(c.key, new Map());
        tapadas.set(c.key, new Set());
        for (const w of conAlgo) {
            if (tapadas.get(c.key)!.has(w.weekNumber)) continue;
            const n = w.colSpan[c.key] || 1;
            let filas = 0;
            for (let s = w.weekNumber; s < w.weekNumber + n; s++) {
                if (!incluidas.has(s)) continue;
                filas++;
                if (s !== w.weekNumber) tapadas.get(c.key)!.add(s);
            }
            abarca.get(c.key)!.set(w.weekNumber, Math.max(1, filas));
        }
    }
    return { conAlgo, abarca, tapadas };
}

/**
 * EL PLAN COMO EL DEL MPPE (el de Física del «Medardo Bacalao», 2026-27)
 *
 * Una sola tabla de once columnas, como la hoja de Word que entregan los
 * profesores: arriba el logo del Ministerio y el del liceo DENTRO de la tabla,
 * el docente, el área en grande, «Tiempo de ejecución del proyecto lapso del
 * momento», desde y hasta, los referentes, el año y las secciones; en medio
 * solo las EVALUACIONES (no cada semana), con el tema generador unido y el
 * énfasis curricular de arriba abajo; y al pie «Entregado por / Fecha de
 * entrega / Recibido por / Observación» y las observaciones.
 *
 * Vale para las columnas de siempre. Un plan con columnas propias sale en la
 * forma general (`PlanGeneral`): no se sabe en qué casilla del modelo va cada una.
 */
const MOMENTOS: Record<string, string> = { '1': '1  PRIMER MOMENTO', '2': '2  SEGUNDO MOMENTO', '3': '3  TERCER MOMENTO' };
const ANNOS: Record<number, string> = { 1: '1ER', 2: '2DO', 3: '3ER', 4: '4TO', 5: '5TO', 6: '6TO' };
const COLUMNAS_DEL_MODELO = new Set(DEFAULT_PLAN_COLUMNS.map((c) => c.key));
const GRIS = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as const;
const RAYA = 'border border-gray-700 px-1 py-0.5 align-middle';
const ROTULO = `${RAYA} bg-gray-200 font-bold uppercase`;
const CENTRO = 'text-center';

function PlanComoElDelMinisterio({
    lapso,
    auto,
    meta,
    semanas,
}: {
    lapso: string;
    auto: AutoPopulatedData;
    meta: EvaluationPlanMetadata | null;
    semanas: WeekRow[];
}) {
    const { data: m } = useMembrete();
    const columnas = DEFAULT_PLAN_COLUMNS;
    // Las evaluaciones: las semanas con puntos o con una actividad de evaluación.
    // Sin ninguna todavía, las semanas con algo escrito.
    const evaluaciones = semanas.filter((w) => Number(w.data.puntos) > 0 || String(w.data.actividadEval ?? '').trim());
    const filas = evaluaciones.length ? evaluaciones : semanas;
    const { conAlgo, abarca, tapadas } = semanasConContenido(filas, columnas);

    const docente = meta?.nombreDocente || auto.teacherName || '';
    const desde = meta?.fechaDesde || auto.lapsoStartDate;
    const hasta = meta?.fechaHasta || auto.lapsoEndDate;
    const totalSemanas = meta?.totalSemanas || auto.lapsoWeeks;
    const secciones = auto.seccionesDelProfesor?.length ? auto.seccionesDelProfesor.join('-') : auto.classroomSection ?? '';
    const lugar = [m?.entidadFederal, m?.municipio].filter(Boolean).join(' ').toUpperCase();
    const dea = [m?.codigoDea && `Código DEA ${m.codigoDea}`, m?.circuitoEducativo].filter(Boolean).join(' ');
    const logoDelLiceo = m?.logo ? getAssetUrl(m.logo) : null;
    const totalPuntos = Math.round(filas.reduce((s, w) => s + (Number(w.data.puntos) || 0), 0) * 100) / 100;
    const totalPorcentaje = Math.round(filas.reduce((s, w) => s + (Number(w.data.ponderacion) || 0), 0) * 100) / 100;
    const texto = (v: unknown) => (v === undefined || v === null ? '' : String(v));

    return (
        <div className="relative overflow-x-auto print:overflow-visible" data-carril-a-proposito>
            <table className="w-full min-w-[980px] table-fixed border-collapse text-[10px] leading-tight text-gray-900 print:min-w-0 print:text-[8.5px]" aria-label="Plan de evaluación">
                <colgroup>
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                </colgroup>
                <tbody>
                    {/* ── La cabecera ─────────────────────────────────────── */}
                    <tr>
                        <td rowSpan={2} className={`${RAYA} ${CENTRO}`}>
                            {m?.logoDelMinisterio !== false && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={LOGO_DEL_MINISTERIO} alt="Ministerio del Poder Popular para la Educación" className="mx-auto h-10 w-full object-contain" />
                            )}
                        </td>
                        <td rowSpan={2} className={`${RAYA} ${CENTRO} font-bold uppercase`}>
                            {(m?.ministerio ?? []).map((l) => (
                                <span key={l} className="block">{l}</span>
                            ))}
                            {lugar && <span className="block">{lugar}</span>}
                        </td>
                        <th scope="row" rowSpan={2} className={ROTULO} style={GRIS}>Docente:</th>
                        <td rowSpan={2} className={`${RAYA} ${CENTRO} font-bold`}>{docente}</td>
                        <th scope="row" rowSpan={2} className={ROTULO} style={GRIS}>Área de formación:</th>
                        <td rowSpan={2} colSpan={2} className={`${RAYA} ${CENTRO} text-xl font-bold print:text-lg`}>
                            {meta?.areaFormacion || auto.subjectName || ''}
                        </td>
                        <th colSpan={4} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Tiempo de ejecución del proyecto lapso del momento:</th>
                    </tr>
                    <tr>
                        <td colSpan={4} className={`${RAYA} ${CENTRO} font-bold`}>{MOMENTOS[lapso] ?? `${lapso} MOMENTO`}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className={`${RAYA} ${CENTRO} font-bold uppercase`}>{m?.nombre ?? auto.instituteName ?? ''}</td>
                        <th scope="row" className={ROTULO} style={GRIS}>Cédula:</th>
                        <td className={`${RAYA} ${CENTRO} break-all`}>{meta?.cedulaDocente || auto.teacherCedula || ''}</td>
                        <th scope="row" className={ROTULO} style={GRIS}>Total de semanas:</th>
                        <td colSpan={2} className={`${RAYA} ${CENTRO}`}>{totalSemanas ? `${totalSemanas} semanas` : ''}</td>
                        <th scope="row" colSpan={2} className={ROTULO} style={GRIS}>Desde:</th>
                        <td colSpan={2} className={`${RAYA} ${CENTRO}`}>{fechaCorta(desde)}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} className={`${RAYA} ${CENTRO} font-bold`}>{dea}</td>
                        <th scope="row" className={ROTULO} style={GRIS}>Teléfono:</th>
                        <td className={`${RAYA} ${CENTRO}`}>{meta?.telefonoDocente || auto.teacherPhone || ''}</td>
                        <th scope="row" className={ROTULO} style={GRIS}>Correo e.:</th>
                        <td colSpan={2} className={`${RAYA} ${CENTRO} break-all`}>{meta?.correoDocente || auto.teacherEmail || ''}</td>
                        <th scope="row" colSpan={2} className={ROTULO} style={GRIS}>Hasta:</th>
                        <td colSpan={2} className={`${RAYA} ${CENTRO}`}>{fechaCorta(hasta)}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} rowSpan={4} className={`${RAYA} ${CENTRO}`}>
                            {logoDelLiceo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoDelLiceo} alt="" className="mx-auto h-14 w-full object-contain" />
                            )}
                        </td>
                        <th scope="row" rowSpan={2} className={ROTULO} style={GRIS}>Referentes éticos:</th>
                        <td colSpan={4} rowSpan={2} className={`${RAYA} ${CENTRO} font-bold`}>{meta?.referentesEticos ?? ''}</td>
                        <th colSpan={4} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Período escolar</th>
                    </tr>
                    <tr>
                        <td colSpan={4} className={`${RAYA} ${CENTRO} font-bold`}>{meta?.periodoEscolar || auto.academicYearName || ''}</td>
                    </tr>
                    <tr>
                        <th scope="row" rowSpan={2} className={ROTULO} style={GRIS}>P.E.I.C.:</th>
                        <td colSpan={4} rowSpan={2} className={`${RAYA} ${CENTRO} font-bold`}>{meta?.peic ?? ''}</td>
                        <th scope="row" className={ROTULO} style={GRIS}>Año:</th>
                        <td colSpan={3} className={`${RAYA} ${CENTRO} font-bold`}>{auto.classroomGrade ? ANNOS[auto.classroomGrade] ?? `${auto.classroomGrade}.º` : ''}</td>
                    </tr>
                    <tr>
                        <th scope="row" className={ROTULO} style={GRIS}>Secciones:</th>
                        <td colSpan={3} className={`${RAYA} ${CENTRO} font-bold`}>{secciones}</td>
                    </tr>

                    {/* ── El plan del lapso ───────────────────────────────── */}
                    <tr>
                        <th colSpan={11} className={`${ROTULO} ${CENTRO} bg-gray-400 text-xs`} style={GRIS}>Plan de lapso</th>
                    </tr>
                    <tr>
                        <th scope="col" rowSpan={2} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Tema generador<br />Tejido temático</th>
                        <th scope="col" rowSpan={2} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Referentes teórico-práctico</th>
                        <th scope="col" rowSpan={2} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Énfasis curricular</th>
                        <th scope="col" rowSpan={2} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Fecha</th>
                        <th scope="colgroup" colSpan={3} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Estrategias de evaluación</th>
                        <th scope="col" rowSpan={2} colSpan={2} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Criterios de evaluación<br />Conocer-Hacer-Ser-Convivir</th>
                        <th scope="colgroup" colSpan={2} className={`${ROTULO} ${CENTRO}`} style={GRIS}>Ponderación</th>
                    </tr>
                    <tr>
                        <th scope="col" className={`${ROTULO} ${CENTRO}`} style={GRIS}>Actividad</th>
                        <th scope="col" className={`${ROTULO} ${CENTRO}`} style={GRIS}>Técnica</th>
                        <th scope="col" className={`${ROTULO} ${CENTRO}`} style={GRIS}>Instrumento</th>
                        <th scope="col" className={`${ROTULO} ${CENTRO}`} style={GRIS}>%</th>
                        <th scope="col" className={`${ROTULO} ${CENTRO}`} style={GRIS}>Pts.</th>
                    </tr>
                    {conAlgo.length === 0 && (
                        <tr>
                            <td colSpan={11} className={`${RAYA} ${CENTRO} py-3 text-gray-600`}>El plan de este lapso todavía no tiene evaluaciones.</td>
                        </tr>
                    )}
                    {conAlgo.map((w, i) => {
                        const fechas = getWeekDates(auto.lapsoStartDate, w.weekNumber);
                        const tema = [texto(w.data.title), texto(w.data.label)].filter(Boolean).filter((t, j, a) => a.indexOf(t) === j).join('\n');
                        return (
                            <tr key={w.weekNumber} className="break-inside-avoid">
                                {!tapadas.get('title')!.has(w.weekNumber) && (
                                    <td rowSpan={abarca.get('title')!.get(w.weekNumber) ?? 1} className={`${RAYA} ${CENTRO} whitespace-pre-wrap font-bold`}>{tema}</td>
                                )}
                                <td className={`${RAYA} ${CENTRO} whitespace-pre-wrap font-bold`}>{texto(w.data.textContent)}</td>
                                {i === 0 && (
                                    <td rowSpan={conAlgo.length} className={`${RAYA} ${CENTRO} whitespace-pre-wrap font-bold`}>{meta?.enfasisCurricular ?? ''}</td>
                                )}
                                <td className={`${RAYA} ${CENTRO} font-bold`}>
                                    <span className="block">Semana {w.weekNumber}</span>
                                    {fechas && (
                                        <>
                                            <span className="block">{fechas.start}</span>
                                            <span className="block">Al</span>
                                            <span className="block">{fechas.end}</span>
                                        </>
                                    )}
                                </td>
                                <td className={`${RAYA} ${CENTRO} whitespace-pre-wrap font-bold`}>{texto(w.data.actividadEval)}</td>
                                <td className={`${RAYA} ${CENTRO} whitespace-pre-wrap font-bold`}>{texto(w.data.tecnicas)}</td>
                                <td className={`${RAYA} ${CENTRO} whitespace-pre-wrap font-bold`}>{texto(w.data.instrumentos)}</td>
                                <td colSpan={2} className={`${RAYA} whitespace-pre-wrap text-[9px] italic print:text-[7.5px]`}>{texto(w.data.criterios)}</td>
                                <td className={`${RAYA} ${CENTRO} font-bold`}>{w.data.ponderacion ? `${w.data.ponderacion}%` : ''}</td>
                                <td className={`${RAYA} ${CENTRO} font-bold`}>{w.data.puntos ? `${w.data.puntos} pts.` : ''}</td>
                            </tr>
                        );
                    })}
                    {conAlgo.length > 0 && (
                        <tr>
                            <th scope="row" colSpan={9} className={`${ROTULO} text-right`} style={GRIS}>Total</th>
                            <td className={`${RAYA} ${CENTRO} font-bold`}>{totalPorcentaje}%</td>
                            <td className={`${RAYA} ${CENTRO} font-bold`}>{totalPuntos} pts.</td>
                        </tr>
                    )}

                    {/* ── La entrega ──────────────────────────────────────── */}
                    <tr className="break-inside-avoid">
                        <th scope="row" className={ROTULO} style={GRIS}>Entregado por:</th>
                        <td className={`${RAYA} ${CENTRO} font-bold`}>{docente}</td>
                        <th scope="row" className={ROTULO} style={GRIS}>Fecha de entrega:</th>
                        <td className={RAYA} />
                        <th scope="row" className={ROTULO} style={GRIS}>Recibido por:</th>
                        <td colSpan={2} className={RAYA} />
                        <th scope="row" colSpan={2} className={ROTULO} style={GRIS}>Observación:</th>
                        <td colSpan={2} className={RAYA} />
                    </tr>
                    <tr className="break-inside-avoid">
                        <th scope="row" className={ROTULO} style={GRIS}>Observaciones:</th>
                        <td colSpan={10} className={`${RAYA} whitespace-pre-wrap py-1 text-[10px] font-bold print:text-[9px]`}>{meta?.observaciones ?? ''}</td>
                    </tr>
                </tbody>
            </table>
            <div className="grid grid-cols-2 gap-16 break-inside-avoid pt-10 text-xs">
                <div className="border-t border-gray-600 pt-1 text-center">
                    Firma del docente
                    {docente && <span className="block font-medium">{docente}</span>}
                </div>
                <div className="border-t border-gray-600 pt-1 text-center">Firma del coordinador</div>
            </div>
        </div>
    );
}

function columnasDelPlan(propias: string | undefined): PlanColumnDef[] {
    try {
        const leidas = propias ? JSON.parse(propias) : null;
        if (Array.isArray(leidas) && leidas.length > 0) return leidas;
    } catch {
        /* las de siempre */
    }
    return DEFAULT_PLAN_COLUMNS;
}

export default function PlanImpreso({ classroomId, subjectId, lapso }: { classroomId: string; subjectId: string; lapso: string }) {
    const { data: m, isLoading: cargandoMeta } = useEvaluationPlanMetadata({ classroomId, subjectId, lapso });
    const { data: filas, isLoading: cargandoFilas } = useEvaluationPlanRows({ classroomId, subjectId, lapso });
    const auto = m?.autoPopulated ?? {};
    const meta = m?.metadata ?? null;

    const columnas = columnasDelPlan(meta?.customColumns);
    const totalSemanas = auto.lapsoWeeks || meta?.totalSemanas || 24;
    const semanas = dbRowsToWeekRows(filas?.rows ?? [], totalSemanas);
    const { conAlgo, abarca, tapadas } = semanasConContenido(semanas, columnas);

    if (cargandoMeta || cargandoFilas) return <p className="mt-6 text-sm text-gray-600">Cargando el plan…</p>;

    // Con las columnas de siempre, la hoja del MPPE; con columnas propias, la general.
    if (columnas.every((c) => COLUMNAS_DEL_MODELO.has(c.key))) {
        return <PlanComoElDelMinisterio lapso={lapso} auto={auto} meta={meta} semanas={semanas} />;
    }

    const texto = columnas.filter((c) => !c.numeric);
    const numericas = columnas.filter((c) => c.numeric);
    const totalPuntos = Math.round(semanas.reduce((s, w) => s + (Number(w.data.puntos) || 0), 0) * 100) / 100;
    const totalPorcentaje = Math.round(semanas.reduce((s, w) => s + (Number(w.data.ponderacion) || 0), 0) * 100) / 100;
    const docente = meta?.nombreDocente || auto.teacherName || '';
    const desde = meta?.fechaDesde || auto.lapsoStartDate;
    const hasta = meta?.fechaHasta || auto.lapsoEndDate;
    const anno = auto.classroomGrade ? `${auto.classroomGrade}.º` : '';

    return (
        <div className="mt-3 space-y-3 text-[10px] leading-tight text-gray-900 print:text-[9px]">
            <div className="relative overflow-x-auto print:overflow-visible" data-carril-a-proposito>
<table className="w-full border-collapse" aria-label="Datos del plan">
                <tbody>
                    <tr>
                        <th scope="row" className={ETIQUETA}>Docente</th>
                        <td className={CELDA}>{docente || '—'}</td>
                        <th scope="row" className={ETIQUETA}>Cédula</th>
                        <td className={CELDA}>{meta?.cedulaDocente || auto.teacherCedula || '—'}</td>
                        <th scope="row" className={ETIQUETA}>Área de formación</th>
                        <td className={`${CELDA} font-bold`}>{meta?.areaFormacion || auto.subjectName || '—'}</td>
                    </tr>
                    <tr>
                        <th scope="row" className={ETIQUETA}>Teléfono</th>
                        <td className={CELDA}>{meta?.telefonoDocente || auto.teacherPhone || '—'}</td>
                        <th scope="row" className={ETIQUETA}>Correo</th>
                        <td className={CELDA}>{meta?.correoDocente || auto.teacherEmail || '—'}</td>
                        <th scope="row" className={ETIQUETA}>Año y sección</th>
                        <td className={CELDA}>{meta?.annoSeccion || `${anno} «${auto.classroomSection ?? ''}»`}</td>
                    </tr>
                    <tr>
                        <th scope="row" className={ETIQUETA}>Momento</th>
                        <td className={CELDA}>{LAPSOS[lapso] ?? `Lapso ${lapso}`}</td>
                        <th scope="row" className={ETIQUETA}>Período escolar</th>
                        <td className={CELDA}>{meta?.periodoEscolar || auto.academicYearName || '—'}</td>
                        <th scope="row" className={ETIQUETA}>Semanas</th>
                        <td className={CELDA}>
                            {totalSemanas} · del {fechaCorta(desde)} al {fechaCorta(hasta)}
                        </td>
                    </tr>
                    {(
                        [
                            ['Referentes éticos', meta?.referentesEticos],
                            ['P.E.I.C.', meta?.peic],
                            ['Énfasis curricular', meta?.enfasisCurricular],
                            ['Intencionalidad', meta?.intencionalidad],
                            ['Tema indispensable', meta?.temaIndispensable],
                        ] as const
                    )
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                            <tr key={k}>
                                <th scope="row" className={ETIQUETA}>{k}</th>
                                <td className={CELDA} colSpan={5}>{v}</td>
                            </tr>
                        ))}
                </tbody>
            </table>
            </div>

            <div className="relative overflow-x-auto print:overflow-visible" data-carril-a-proposito>
<table className="w-full border-collapse" aria-label="Plan del lapso">
                <thead>
                    <tr>
                        <th className={`${ETIQUETA} text-center`} colSpan={columnas.length + 1} style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                            Plan de lapso
                        </th>
                    </tr>
                    <tr>
                        <th scope="col" className={`${ETIQUETA} w-20 text-center`}>Fecha</th>
                        {columnas.map((c) => (
                            <th key={c.key} scope="col" className={`${ETIQUETA} ${c.numeric ? 'w-12 text-center' : 'text-left'}`}>
                                {c.key === 'ponderacion' ? '%' : c.key === 'puntos' ? 'Pts.' : c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {conAlgo.length === 0 && (
                        <tr>
                            <td className={`${CELDA} text-center text-gray-600`} colSpan={columnas.length + 1}>
                                El plan de este lapso todavía no tiene nada escrito.
                            </td>
                        </tr>
                    )}
                    {conAlgo.map((w) => {
                        const fechas = getWeekDates(auto.lapsoStartDate, w.weekNumber);
                        return (
                            <tr key={w.weekNumber} className="break-inside-avoid">
                                <td className={`${CELDA} text-center`}>
                                    <span className="block font-bold">Semana {w.weekNumber}</span>
                                    {fechas && (
                                        <span className="block">
                                            {fechas.start} al {fechas.end}
                                        </span>
                                    )}
                                </td>
                                {columnas.map((c) => {
                                    if (tapadas.get(c.key)!.has(w.weekNumber)) return null;
                                    const v = w.data[c.key];
                                    return (
                                        <td
                                            key={c.key}
                                            rowSpan={abarca.get(c.key)!.get(w.weekNumber) ?? 1}
                                            className={`${CELDA} whitespace-pre-wrap ${c.numeric ? 'text-center font-bold' : ''}`}
                                        >
                                            {c.key === 'ponderacion' && v ? `${v}%` : c.key === 'puntos' && v ? `${v} pts.` : v || ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr>
                        <th scope="row" colSpan={texto.length + 1} className={`${ETIQUETA} text-right`}>Total</th>
                        {numericas.map((c) => (
                            <td key={c.key} className={`${CELDA} text-center font-bold`}>
                                {c.key === 'ponderacion' ? `${totalPorcentaje}%` : c.key === 'puntos' ? `${totalPuntos} pts.` : ''}
                            </td>
                        ))}
                    </tr>
                </tfoot>
            </table>
            </div>

            <div className="relative overflow-x-auto print:overflow-visible" data-carril-a-proposito>
<table className="w-full border-collapse break-inside-avoid" aria-label="Entrega del plan">
                <tbody>
                    <tr>
                        <th scope="row" className={ETIQUETA}>Entregado por</th>
                        <td className={CELDA}>{docente}</td>
                        <th scope="row" className={ETIQUETA}>Fecha de entrega</th>
                        <td className={`${CELDA} w-28`} />
                        <th scope="row" className={ETIQUETA}>Recibido por</th>
                        <td className={`${CELDA} w-40`} />
                    </tr>
                    <tr>
                        <th scope="row" className={ETIQUETA}>Observaciones</th>
                        <td className={`${CELDA} whitespace-pre-wrap`} colSpan={5}>
                            {meta?.observaciones || ''}
                        </td>
                    </tr>
                </tbody>
            </table>
            </div>

            <div className="grid grid-cols-2 gap-16 break-inside-avoid pt-10 text-center text-xs">
                <div className="border-t border-gray-600 pt-1">
                    Firma del docente
                    {docente && <span className="block font-medium">{docente}</span>}
                </div>
                <div className="border-t border-gray-600 pt-1">Firma del coordinador</div>
            </div>
        </div>
    );
}
