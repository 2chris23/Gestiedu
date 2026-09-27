'use client';

import * as React from 'react';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { HojaImprimible, Firma, fechaCorta } from '@/components/documentos/HojaImprimible';
import { Lista } from '@/components/ui/lista';

/**
 * LA ESTADÍSTICA DE MATRÍCULA (EL MOVIMIENTO), PARA LA ZONA EDUCATIVA
 *
 * De un mes o de un lapso: por sección, la matrícula inicial, los ingresos,
 * los retiros y la final, por sexo; y la final por edad (cumplida en la fecha
 * de corte del liceo). `services/matricula.service.ts`. Solo el admin.
 *
 * De pie en el teléfono, cada sección es una ficha; la tabla entera sale al
 * imprimir y en pantallas anchas (como el resumen final).
 */

interface Cuenta {
    M: number;
    F: number;
    X: number;
    total: number;
}
interface Movimiento {
    inicial: Cuenta;
    ingresos: Cuenta;
    retiros: Cuenta;
    final: Cuenta;
}
interface Matricula {
    firmante: { nombre: string | null; cargo: string };
    ciclo: { id: string; nombre: string; desde: string; hasta: string; lapsos: Array<{ id: string; nombre: string; desde: string; hasta: string }> };
    desde: string;
    hasta: string;
    reglas: { fechaDeCorte: string; diasDeInscripcion: number };
    secciones: Array<Movimiento & { id: string; nombre: string; grado: number }>;
    porGrado: Array<Movimiento & { grado: number }>;
    total: Movimiento;
    porEdad: { edades: string[]; grados: Array<{ grado: number; celdas: Cuenta[] }> };
    emitidaEl: string;
}

const COLUMNAS = [
    ['inicial', 'Inicial'],
    ['ingresos', 'Ingresos'],
    ['retiros', 'Retiros'],
    ['final', 'Final'],
] as const;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CELDA = 'border border-gray-400 px-1.5 py-0.5 text-center tabular-nums';
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

/** Los meses del año escolar y sus lapsos, como períodos elegibles. */
function periodos(ciclo: Matricula['ciclo'] | undefined) {
    if (!ciclo) return [];
    const lista: Array<{ valor: string; texto: string }> = [{ valor: `${ciclo.desde}|`, texto: 'Todo el año, hasta hoy' }];
    let y = Number(ciclo.desde.slice(0, 4));
    let m = Number(ciclo.desde.slice(5, 7)) - 1;
    while (`${y}-${String(m + 1).padStart(2, '0')}` <= ciclo.hasta.slice(0, 7)) {
        const desde = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        lista.push({ valor: `${desde < ciclo.desde ? ciclo.desde : desde}|${ultimoDia(y, m)}`, texto: `${MESES[m]} ${y}` });
        m++;
        if (m === 12) {
            m = 0;
            y++;
        }
    }
    for (const l of ciclo.lapsos) lista.push({ valor: `${l.desde}|${l.hasta}`, texto: l.nombre });
    return lista;
}

function Fila({ nombre, m, fuerte }: { nombre: string; m: Movimiento; fuerte?: boolean }) {
    return (
        <tr className={fuerte ? 'bg-gray-50 font-semibold' : undefined}>
            <th scope="row" className="border border-gray-400 px-2 py-0.5 text-left">
                {nombre}
            </th>
            {COLUMNAS.map(([k]) => (
                <React.Fragment key={k}>
                    <td className={CELDA}>{m[k].M}</td>
                    <td className={CELDA}>{m[k].F}</td>
                    <td className={`${CELDA} font-semibold`}>{m[k].total}</td>
                </React.Fragment>
            ))}
        </tr>
    );
}

export default function MatriculaPage({ params }: { params: Promise<{ cycleId: string }> }) {
    const { cycleId } = use(params);
    const ciclo = decodeURIComponent(cycleId);
    const [periodo, setPeriodo] = React.useState<string>('');
    const [desde, hasta] = periodo ? periodo.split('|') : ['', ''];
    const { data: r, isLoading, error } = useQuery<Matricula>({
        queryKey: ['matricula', ciclo, periodo],
        queryFn: async () =>
            (await api.get(`/academic-years/${encodeURIComponent(ciclo)}/matricula`, { params: { desde: desde || undefined, hasta: hasta || undefined } })).data.data,
        placeholderData: (antes) => antes,
    });
    const opciones = React.useMemo(() => periodos(r?.ciclo), [r?.ciclo]);
    const sinDato = r ? r.total.final.X : 0;

    return (
        <HojaImprimible
            etiqueta="Estadística de matrícula"
            titulo="Estadística de matrícula"
            subtitulo={r ? `Año escolar ${r.ciclo.nombre} · del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}` : undefined}
            cargando={isLoading && !r}
            error={error}
            papel="oficio-apaisado"
            textoDeCarga="Contando la matrícula…"
            controles={
                opciones.length > 0 ? (
                    <div className="w-56">
                        <Lista etiqueta="Período" valor={periodo || opciones[0].valor} alCambiar={setPeriodo} opciones={opciones} />
                    </div>
                ) : undefined
            }
        >
            {r && (
                <>
                    {/* De pie en el teléfono: una ficha por sección. */}
                    <ul className="mt-4 space-y-2 min-[700px]:hidden print:hidden" aria-label="Matrícula por sección">
                        {r.secciones.map((s) => (
                            <li key={s.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                                <p className="font-semibold text-gray-900">{s.nombre}</p>
                                <dl className="mt-1 grid grid-cols-4 gap-1 text-center">
                                    {COLUMNAS.map(([k, t]) => (
                                        <div key={k} className="rounded bg-gray-50 px-1 py-1">
                                            <dt className="text-xs text-gray-600">{t}</dt>
                                            <dd className="font-semibold tabular-nums">{s[k].total}</dd>
                                            <dd className="text-xs text-gray-600">
                                                {s[k].M} M · {s[k].F} F
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </li>
                        ))}
                        <li className="rounded-lg bg-indigo-50 p-3 text-sm font-semibold text-indigo-900">
                            Total: {r.total.inicial.total} al empezar · +{r.total.ingresos.total} · −{r.total.retiros.total} · {r.total.final.total} al final
                        </li>
                    </ul>

                    <div className="mt-4 hidden min-[700px]:block print:block">
                        <table className="w-full border-collapse text-xs print:text-[10px]" aria-label="Movimiento de la matrícula">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" rowSpan={2} className="border border-gray-400 px-2 text-left">
                                        Año y sección
                                    </th>
                                    {COLUMNAS.map(([k, t]) => (
                                        <th key={k} scope="colgroup" colSpan={3} className="border border-gray-400 px-2">
                                            {t}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-gray-100">
                                    {COLUMNAS.map(([k]) => (
                                        <React.Fragment key={k}>
                                            <th scope="col" className={CELDA}>
                                                M
                                            </th>
                                            <th scope="col" className={CELDA}>
                                                F
                                            </th>
                                            <th scope="col" className={CELDA}>
                                                T
                                            </th>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {r.porGrado.map((g) => (
                                    <React.Fragment key={g.grado}>
                                        {r.secciones
                                            .filter((s) => s.grado === g.grado)
                                            .map((s) => (
                                                <Fila key={s.id} nombre={s.nombre} m={s} />
                                            ))}
                                        <Fila nombre={`Total ${g.grado}° año`} m={g} fuerte />
                                    </React.Fragment>
                                ))}
                                <Fila nombre="Total del plantel" m={r.total} fuerte />
                            </tbody>
                        </table>

                        <h2 className="mt-6 text-sm font-bold uppercase text-gray-800">Matrícula final por edad (al {fechaCorta(r.reglas.fechaDeCorte)})</h2>
                        <table className="mt-2 w-full border-collapse text-xs print:text-[10px]" aria-label="Matrícula por edad">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className="border border-gray-400 px-2 text-left">
                                        Año
                                    </th>
                                    {r.porEdad.edades.map((e) => (
                                        <th key={e} scope="col" className={CELDA}>
                                            {e === 'sin dato' ? 'Sin dato' : `${e} años`}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {r.porEdad.grados.map((g) => (
                                    <tr key={g.grado}>
                                        <th scope="row" className="border border-gray-400 px-2 text-left">
                                            {g.grado}° año
                                        </th>
                                        {g.celdas.map((c, i) => (
                                            <td key={i} className={CELDA}>
                                                {c.total > 0 ? `${c.total} (${c.M} M, ${c.F} F)` : '—'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="mt-3 text-xs text-gray-700">
                        M: masculino · F: femenino · T: total. Lo inscrito en los primeros {r.reglas.diasDeInscripcion} días del año cuenta como matrícula inicial.
                        {sinDato > 0 ? ` ${sinDato} ${sinDato === 1 ? 'alumno no tiene' : 'alumnos no tienen'} el sexo puesto en su ficha: cuenta${sinDato === 1 ? '' : 'n'} en el total.` : ''}
                    </p>
                    <Firma nombre={r.firmante.nombre} detalle={r.firmante.cargo} />
                </>
            )}
        </HojaImprimible>
    );
}
