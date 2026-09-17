'use client';

import * as React from 'react';
import { ChevronDown, Wallet } from 'lucide-react';
import { FichaDePagos } from '@/components/pagos/FichaDePagos';
import { dinero, ESTADO_DEL_ALUMNO, usePagosActivos, usePagosDeMisRepresentados } from '@/hooks/usePagos';
import { cn } from '@/lib/utils';

/**
 * LO QUE VE EL REPRESENTANTE
 *
 * El estado de pago de cada alumno que representa, sus cuotas y sus
 * comprobantes. Solo lectura: registrar y anular es del liceo.
 */
export function PagosDelRepresentante() {
    const { data: ajustes } = usePagosActivos();
    const activo = Boolean(ajustes?.enabled);
    const { data: hijos = [], isLoading } = usePagosDeMisRepresentados(activo);
    const [abierto, setAbierto] = React.useState<string | null>(null);

    if (!activo || isLoading || hijos.length === 0) return null;

    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="pagos-representados">
            <h2 id="pagos-representados" className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <Wallet size={20} className="text-indigo-700" /> Pagos
            </h2>
            <ul className="mt-3 space-y-3">
                {hijos.map((h) => {
                    const e = ESTADO_DEL_ALUMNO[h.summary.state];
                    const esta = abierto === h.student.id;
                    return (
                        <li key={h.student.id} className="rounded-xl border border-gray-200">
                            <button
                                type="button"
                                onClick={() => setAbierto(esta ? null : h.student.id)}
                                aria-expanded={esta}
                                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-gray-900">
                                        {h.student.firstName} {h.student.lastName}
                                    </span>
                                    <span className="block text-sm text-gray-700">{h.student.classroom?.name}</span>
                                </span>
                                <span className={cn('rounded-full border px-3 py-1 text-sm font-semibold', e.clases)}>
                                    {e.texto}
                                    {h.summary.state === 'DEBE' && ` · ${dinero(h.summary.owed, h.currency)}`}
                                </span>
                                <ChevronDown size={18} className={cn('text-gray-600 transition-transform', esta && 'rotate-180')} />
                            </button>
                            {esta && (
                                <div className="border-t border-gray-100 p-4">
                                    <FichaDePagos ficha={h} editable={false} />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
