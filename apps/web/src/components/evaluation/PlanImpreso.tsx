'use client';

import { useEvaluationPlanMetadata, useEvaluationPlanRows } from '@/hooks/useEvaluationPlan';
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
