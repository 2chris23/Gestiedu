'use client';

import { useSearchParams } from 'next/navigation';
import { HojaImprimible, Firma, fechaCorta } from '@/components/documentos/HojaImprimible';
import { useReporteDelMes } from '@/hooks/useFinanzas';
import { dinero } from '@/hooks/usePagos';
import { nombreDelMes } from '@/lib/calendario-del-ciclo';

/**
 * EL REPORTE DEL MES, PARA IMPRIMIR (2026-10-01)
 *
 * `?mes=AAAA-MM&ciclo=`. Lo que eligió Cristian para la junta o la dirección:
 * con qué empezó el mes, lo que entró y lo que salió, con qué acabó y lo que
 * deben los estudiantes. Solo el admin (el servidor lo exige).
 */
const CELDA = 'border border-gray-400 px-2 py-1';
const CONCEPTO: Record<string, string> = { SALDO_INICIAL: 'Saldo inicial', DONACION: 'Donación', OTRO: 'Otro ingreso' };

export default function ReporteDelMesPage() {
    const busqueda = useSearchParams();
    const mes = busqueda.get('mes') || '';
    const ciclo = busqueda.get('ciclo');
    const { data, isLoading, error } = useReporteDelMes(ciclo, /^\d{4}-\d{2}$/.test(mes) ? mes : null);
    const titulo = mes ? nombreDelMes(mes) : '';
    const $ = (v: string) => (data ? dinero(v, data.currency) : v);

    return (
        <HojaImprimible
            etiqueta="Reporte del mes"
            titulo="Reporte financiero del mes"
            subtitulo={`${titulo}${data ? ` · Ciclo ${data.academicYear.name}` : ''}`}
            nombreDelArchivo={`Reporte financiero — ${titulo}`}
            cargando={isLoading}
            error={error}
            paginas
            textoDeCarga="Preparando el reporte…"
        >
            {data && (
                <div className="mt-6 space-y-6 text-sm">
                    <table className="w-full border-collapse" aria-label="Resumen del mes">
                        <tbody>
                            <tr>
                                <th scope="row" className={`${CELDA} text-left font-medium`}>Saldo al empezar el mes</th>
                                <td className={`${CELDA} text-right tabular-nums`}>{$(data.saldoInicial)}</td>
                            </tr>
                            <tr>
                                <th scope="row" className={`${CELDA} text-left font-medium`}>+ Entró</th>
                                <td className={`${CELDA} text-right tabular-nums`}>{$(data.entradas.total)}</td>
                            </tr>
                            <tr>
                                <th scope="row" className={`${CELDA} text-left font-medium`}>− Salió</th>
                                <td className={`${CELDA} text-right tabular-nums`}>{$(data.salidas.total)}</td>
                            </tr>
                            <tr className="bg-gray-100 font-bold">
                                <th scope="row" className={`${CELDA} text-left`}>Saldo al terminar el mes</th>
                                <td className={`${CELDA} text-right tabular-nums`}>{$(data.saldoFinal)}</td>
                            </tr>
                            <tr>
                                <th scope="row" className={`${CELDA} text-left font-medium`}>
                                    Deben los estudiantes (al {fechaCorta(data.corte)})
                                </th>
                                <td className={`${CELDA} text-right tabular-nums`}>
                                    {$(data.alumnos.deben)} · {data.alumnos.deudores} {data.alumnos.deudores === 1 ? 'estudiante' : 'estudiantes'}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <section className="break-inside-avoid">
                        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Lo que entró</h2>
                        <table className="w-full border-collapse" aria-label="Lo que entró">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className={`${CELDA} text-left`}>Concepto</th>
                                    <th scope="col" className={`${CELDA} text-right`}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.entradas.cobrosPorMetodo.map((c) => (
                                    <tr key={c.metodo}>
                                        <td className={CELDA}>
                                            Cuotas cobradas · {c.metodo} ({c.cuantos} {c.cuantos === 1 ? 'pago' : 'pagos'})
                                        </td>
                                        <td className={`${CELDA} text-right tabular-nums`}>{$(c.monto)}</td>
                                    </tr>
                                ))}
                                {data.entradas.fondos.map((f, i) => (
                                    <tr key={`f${i}`}>
                                        <td className={CELDA}>
                                            {fechaCorta(f.fecha)} · {CONCEPTO[f.concepto] ?? f.concepto}
                                            {f.descripcion ? ` · ${f.descripcion}` : ''}
                                        </td>
                                        <td className={`${CELDA} text-right tabular-nums`}>{$(f.monto)}</td>
                                    </tr>
                                ))}
                                {data.entradas.cobrosPorMetodo.length === 0 && data.entradas.fondos.length === 0 && (
                                    <tr>
                                        <td className={CELDA} colSpan={2}>
                                            No entró dinero este mes.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </section>

                    <section className="break-inside-avoid">
                        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Lo que salió</h2>
                        <table className="w-full border-collapse" aria-label="Lo que salió">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className={`${CELDA} text-left`}>Concepto</th>
                                    <th scope="col" className={`${CELDA} text-right`}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className={CELDA}>Pagos al personal ({data.salidas.pagosAlPersonal.length})</td>
                                    <td className={`${CELDA} text-right tabular-nums`}>{$(data.salidas.personal)}</td>
                                </tr>
                                {data.salidas.gastosPorCategoria.map((g) => (
                                    <tr key={g.categoria}>
                                        <td className={CELDA}>Gastos · {g.categoria}</td>
                                        <td className={`${CELDA} text-right tabular-nums`}>{$(g.monto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    {data.salidas.pagosAlPersonal.length > 0 && (
                        <section>
                            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Pagos al personal</h2>
                            <table className="w-full border-collapse text-xs" aria-label="Pagos al personal">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th scope="col" className={`${CELDA} text-left`}>Fecha</th>
                                        <th scope="col" className={`${CELDA} text-left`}>Recibo</th>
                                        <th scope="col" className={`${CELDA} text-left`}>Persona</th>
                                        <th scope="col" className={`${CELDA} text-right`}>Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.salidas.pagosAlPersonal.map((p) => (
                                        <tr key={p.numero} className="break-inside-avoid">
                                            <td className={CELDA}>{fechaCorta(p.fecha)}</td>
                                            <td className={CELDA}>Nº {String(p.numero).padStart(6, '0')}</td>
                                            <td className={CELDA}>{p.persona}</td>
                                            <td className={`${CELDA} text-right tabular-nums`}>{$(p.monto)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}

                    {data.salidas.listaDeGastos.length > 0 && (
                        <section>
                            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Gastos</h2>
                            <table className="w-full border-collapse text-xs" aria-label="Gastos del mes">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th scope="col" className={`${CELDA} text-left`}>Fecha</th>
                                        <th scope="col" className={`${CELDA} text-left`}>Concepto</th>
                                        <th scope="col" className={`${CELDA} text-left`}>Categoría</th>
                                        <th scope="col" className={`${CELDA} text-right`}>Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.salidas.listaDeGastos.map((g, i) => (
                                        <tr key={i} className="break-inside-avoid">
                                            <td className={CELDA}>{fechaCorta(g.fecha)}</td>
                                            <td className={CELDA}>
                                                {g.concepto}
                                                {g.proveedor ? ` · ${g.proveedor}` : ''}
                                            </td>
                                            <td className={CELDA}>{g.categoria}</td>
                                            <td className={`${CELDA} text-right tabular-nums`}>{$(g.monto)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}

                    <p className="text-xs text-gray-600">Montos en {data.currency === 'USD' ? 'dólares' : 'bolívares'}. No incluye lo anulado.</p>
                    <div className="grid grid-cols-2 gap-8">
                        <Firma detalle="Administración" />
                        <Firma detalle="Dirección" />
                    </div>
                </div>
            )}
        </HojaImprimible>
    );
}
