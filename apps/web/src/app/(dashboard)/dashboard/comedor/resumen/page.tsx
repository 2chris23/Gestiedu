'use client';

import { useSearchParams } from 'next/navigation';
import { HojaImprimible, Firma, fechaCorta } from '@/components/documentos/HojaImprimible';
import { COMIDAS, useMesDelComedor } from '@/hooks/usePae';

/**
 * EL RESUMEN DEL MES DEL COMEDOR (PAE), PARA IMPRIMIR
 *
 * `?mes=AAAA-MM`. Por comida: días servidos, raciones recibidas y servidas, y
 * la diferencia; y el detalle día a día. Solo el admin.
 */
const CELDA = 'border border-gray-400 px-2 py-1';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export default function ResumenDelComedorPage() {
    const mes = useSearchParams().get('mes') || '';
    const { data, isLoading, error } = useMesDelComedor(mes);
    const [y, m] = mes.split('-').map(Number);
    const nombreDelMes = m ? `${MESES[m - 1]} de ${y}` : mes;

    return (
        <HojaImprimible
            etiqueta="Resumen del comedor"
            titulo="Programa de Alimentación Escolar (PAE)"
            subtitulo={`Resumen de ${nombreDelMes}`}
            nombreDelArchivo={`Comedor PAE — ${nombreDelMes}`}
            cargando={isLoading}
            error={error}
            paginas
            textoDeCarga="Cargando el resumen…"
        >
            {data && (
                <>
                    <table className="mt-4 w-full border-collapse text-sm" aria-label="Resumen por comida">
                        <thead>
                            <tr className="bg-gray-100">
                                <th scope="col" className={`${CELDA} text-left`}>Comida</th>
                                <th scope="col" className={CELDA}>Días servidos</th>
                                <th scope="col" className={CELDA}>Raciones recibidas</th>
                                <th scope="col" className={CELDA}>Raciones servidas</th>
                                <th scope="col" className={CELDA}>Diferencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.resumen.porComida.map((c) => (
                                <tr key={c.comida}>
                                    <th scope="row" className={`${CELDA} text-left font-medium`}>{COMIDAS[c.comida] ?? c.comida}</th>
                                    <td className={`${CELDA} text-center tabular-nums`}>{c.dias}</td>
                                    <td className={`${CELDA} text-center tabular-nums`}>{c.recibidas}</td>
                                    <td className={`${CELDA} text-center tabular-nums`}>{c.servidas}</td>
                                    <td className={`${CELDA} text-center tabular-nums`}>{c.diferencia}</td>
                                </tr>
                            ))}
                            <tr className="bg-gray-50 font-semibold">
                                <th scope="row" className={`${CELDA} text-left`}>Total</th>
                                <td className={`${CELDA} text-center tabular-nums`}>{data.resumen.diasServidos}</td>
                                <td className={`${CELDA} text-center tabular-nums`}>{data.resumen.recibidas}</td>
                                <td className={`${CELDA} text-center tabular-nums`}>{data.resumen.servidas}</td>
                                <td className={`${CELDA} text-center tabular-nums`}>{data.resumen.diferencia}</td>
                            </tr>
                        </tbody>
                    </table>

                    {data.registros.length > 0 && (
                        <table className="mt-6 w-full border-collapse text-xs" aria-label="Día a día">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className={`${CELDA} text-left`}>Fecha</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Comida</th>
                                    <th scope="col" className={CELDA}>Recibidas</th>
                                    <th scope="col" className={CELDA}>Servidas</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Menú</th>
                                    <th scope="col" className={`${CELDA} text-left`}>Observaciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.registros.map((r) => (
                                    <tr key={`${r.fecha}-${r.comida}`} className="break-inside-avoid">
                                        <td className={CELDA}>{fechaCorta(r.fecha)}</td>
                                        <td className={CELDA}>{COMIDAS[r.comida] ?? r.comida}</td>
                                        <td className={`${CELDA} text-center tabular-nums`}>{r.recibidas}</td>
                                        <td className={`${CELDA} text-center tabular-nums`}>{r.servidas}</td>
                                        <td className={CELDA}>{r.menu ?? ''}</td>
                                        <td className={CELDA}>{r.observaciones ?? ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div className="grid grid-cols-2 gap-8">
                        <Firma detalle="Responsable del comedor" />
                        <Firma detalle="Director(a)" />
                    </div>
                </>
            )}
        </HojaImprimible>
    );
}
