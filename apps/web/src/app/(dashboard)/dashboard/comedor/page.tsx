'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Printer, Trash2, UtensilsCrossed } from 'lucide-react';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { useConfirm } from '@/hooks/useConfirm';
import { COMIDAS, useAnotarElComedor, useBorrarDelComedor, useMesDelComedor, type RegistroDelComedor } from '@/hooks/usePae';
import { fechaCorta } from '@/components/documentos/HojaImprimible';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * EL COMEDOR (PAE), DÍA A DÍA
 *
 * Arriba se anota lo de un día y una comida (volver a anotarlo lo corrige);
 * abajo, lo del mes con su resumen, y el resumen para imprimir. Solo el admin,
 * y solo si el liceo activó el comedor (`services/pae.service.ts`).
 */

const campo =
    'mt-1 w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const rotulo = 'block text-sm font-medium text-gray-800';
const CELDA = 'border-b border-gray-200 px-2 py-2';

export default function ComedorPage() {
    const hoy = useSchoolToday();
    const [mes, setMes] = React.useState('');
    const elMes = mes || (hoy ? hoy.slice(0, 7) : '');
    const { data, isLoading, error } = useMesDelComedor(elMes);
    const anotar = useAnotarElComedor();
    const borrar = useBorrarDelComedor();
    const confirmar = useConfirm();

    const [fecha, setFecha] = React.useState('');
    const [comida, setComida] = React.useState('');
    const [recibidas, setRecibidas] = React.useState('');
    const [servidas, setServidas] = React.useState('');
    const [menu, setMenu] = React.useState('');
    const [observaciones, setObservaciones] = React.useState('');
    const laFecha = fecha || hoy;
    const laComida = comida || data?.comidas[0] || '';

    const cargar = (r: RegistroDelComedor) => {
        setFecha(r.fecha);
        setComida(r.comida);
        setRecibidas(String(r.recibidas));
        setServidas(String(r.servidas));
        setMenu(r.menu ?? '');
        setObservaciones(r.observaciones ?? '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const guardar = (e: React.FormEvent) => {
        e.preventDefault();
        anotar.mutate(
            { fecha: laFecha, comida: laComida, recibidas: Number(recibidas), servidas: Number(servidas), menu, observaciones },
            {
                onSuccess: (r) => {
                    toast.success(`Anotado: ${COMIDAS[laComida] ?? laComida} del ${fechaCorta(laFecha)}`);
                    if (r.aviso) toast.warning(r.aviso, { duration: 10000 });
                    setRecibidas('');
                    setServidas('');
                    setMenu('');
                    setObservaciones('');
                },
                onError: (err) => toast.error(getApiErrorMessage(err, 'No se pudo anotar')),
            }
        );
    };

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla titulo="Comedor (PAE)" descripcion="Las raciones que llegan y las que se sirven, día a día" />

            <form onSubmit={guardar} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6" aria-label="Anotar el comedor">
                <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-indigo-600" aria-hidden />
                    <h2 className="text-base font-semibold text-gray-900">Anotar un día</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                        <label htmlFor="pae-fecha" className={rotulo}>Fecha</label>
                        <input id="pae-fecha" type="date" max={hoy} value={laFecha} onChange={(e) => setFecha(e.target.value)} className={campo} required />
                    </div>
                    <div>
                        <label htmlFor="pae-comida" className={rotulo}>Comida</label>
                        <select id="pae-comida" value={laComida} onChange={(e) => setComida(e.target.value)} className={campo}>
                            {(data?.comidas ?? []).map((c) => (
                                <option key={c} value={c}>
                                    {COMIDAS[c] ?? c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="pae-recibidas" className={rotulo}>Raciones recibidas</label>
                        <input id="pae-recibidas" type="number" inputMode="numeric" min={0} value={recibidas} onChange={(e) => setRecibidas(e.target.value)} className={campo} required />
                    </div>
                    <div>
                        <label htmlFor="pae-servidas" className={rotulo}>Raciones servidas</label>
                        <input id="pae-servidas" type="number" inputMode="numeric" min={0} value={servidas} onChange={(e) => setServidas(e.target.value)} className={campo} required />
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="pae-menu" className={rotulo}>Menú</label>
                        <input id="pae-menu" value={menu} maxLength={300} onChange={(e) => setMenu(e.target.value)} className={campo} placeholder="Arroz, caraotas y pollo" />
                    </div>
                    <div>
                        <label htmlFor="pae-obs" className={rotulo}>Observaciones</label>
                        <input id="pae-obs" value={observaciones} maxLength={1000} onChange={(e) => setObservaciones(e.target.value)} className={campo} />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={anotar.isPending || !laComida}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    Guardar
                </button>
            </form>

            <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6" aria-label="El mes del comedor">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <label htmlFor="pae-mes" className={rotulo}>Mes</label>
                        <input id="pae-mes" type="month" value={elMes} onChange={(e) => setMes(e.target.value)} className={campo} />
                    </div>
                    <Link
                        href={`/dashboard/comedor/resumen?mes=${elMes}`}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    >
                        <Printer className="h-4 w-4" aria-hidden /> Resumen del mes
                    </Link>
                </div>

                {isLoading && <p className="text-sm text-gray-600">Cargando el mes…</p>}
                {error && <p className="text-sm text-red-700">{getApiErrorMessage(error, 'No se pudo cargar el comedor')}</p>}
                {data && (
                    <>
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {(
                                [
                                    ['Días servidos', data.resumen.diasServidos],
                                    ['Recibidas', data.resumen.recibidas],
                                    ['Servidas', data.resumen.servidas],
                                    ['Diferencia', data.resumen.diferencia],
                                ] as const
                            ).map(([k, v]) => (
                                <div key={k} className="rounded-xl bg-gray-50 p-3">
                                    <dt className="text-xs text-gray-600">{k}</dt>
                                    <dd className={`text-lg font-bold tabular-nums ${k === 'Diferencia' && v < 0 ? 'text-red-700' : 'text-gray-900'}`}>{v}</dd>
                                </div>
                            ))}
                        </dl>
                        {data.registros.length === 0 ? (
                            <p className="text-sm text-gray-600">Nada anotado este mes.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[560px] text-sm" aria-label="Lo anotado este mes">
                                    <thead>
                                        <tr className="text-left text-xs uppercase text-gray-600">
                                            <th className={CELDA}>Fecha</th>
                                            <th className={CELDA}>Comida</th>
                                            <th className={`${CELDA} text-right`}>Recibidas</th>
                                            <th className={`${CELDA} text-right`}>Servidas</th>
                                            <th className={CELDA}>Menú</th>
                                            <th className={CELDA}>
                                                <span className="sr-only">Acciones</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.registros.map((r) => (
                                            <tr key={`${r.fecha}-${r.comida}`}>
                                                <td className={CELDA}>
                                                    <button type="button" onClick={() => cargar(r)} className="min-h-[44px] font-medium text-indigo-700 hover:underline" title="Corregir">
                                                        {fechaCorta(r.fecha)}
                                                    </button>
                                                </td>
                                                <td className={CELDA}>{COMIDAS[r.comida] ?? r.comida}</td>
                                                <td className={`${CELDA} text-right tabular-nums`}>{r.recibidas}</td>
                                                <td className={`${CELDA} text-right tabular-nums ${r.servidas > r.recibidas ? 'font-bold text-red-700' : ''}`}>{r.servidas}</td>
                                                <td className={CELDA}>{r.menu ?? ''}</td>
                                                <td className={`${CELDA} text-right`}>
                                                    <button
                                                        type="button"
                                                        aria-label={`Quitar ${COMIDAS[r.comida] ?? r.comida} del ${fechaCorta(r.fecha)}`}
                                                        onClick={async () => {
                                                            if (!(await confirmar({ title: `¿Quitar ${(COMIDAS[r.comida] ?? r.comida).toLowerCase()} del ${fechaCorta(r.fecha)}?` }))) return;
                                                            borrar.mutate(r, {
                                                                onSuccess: () => toast.success('Quitado'),
                                                                onError: (err) => toast.error(getApiErrorMessage(err, 'No se pudo quitar')),
                                                            });
                                                        }}
                                                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700"
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}
