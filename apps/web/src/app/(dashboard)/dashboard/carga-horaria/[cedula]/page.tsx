'use client';

import * as React from 'react';
import { use } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/axios';
import { HojaImprimible, Firma, fechaCorta } from '@/components/documentos/HojaImprimible';
import { Input } from '@/components/ui/input';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LA HOJA DE CARGA HORARIA DE UN PROFESOR
 *
 * Por sección y materia, sus horas a la semana en el año en curso, y el total
 * contra el rango que recomienda el liceo (que el admin cambia aquí mismo).
 * Las horas no se inventan: sin horas ni bloques, «sin horas»
 * (`services/personal.service.ts`).
 */

interface Carga {
    profesor: { id: string; nombre: string; ingreso: string | null };
    ciclo: string | null;
    filas: Array<{ seccion: string; materia: string; bloques: number | null; horas: number | null }>;
    total: number;
    sinHoras: number;
    reglas: { minimo: number; maximo: number };
    estado: 'SOBRECARGA' | 'EN_RANGO' | 'POR_DEBAJO';
    firmante: { nombre: string | null; cargo: string };
    emitidaEl: string;
}

const ESTADO = { SOBRECARGA: 'Por encima del rango', EN_RANGO: 'En el rango', POR_DEBAJO: 'Por debajo del rango' } as const;
const CELDA = 'border border-gray-300 px-2 py-1';
const horas = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export default function CargaHorariaPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const id = decodeURIComponent(cedula);
    const { yo } = useQuienSoy();
    const { data: c, isLoading, error } = useQuery<Carga>({
        queryKey: ['carga-horaria', id],
        queryFn: async () => (await api.get(`/teachers/${encodeURIComponent(id)}/carga-horaria`)).data.data,
    });

    return (
        <HojaImprimible
            etiqueta="Carga horaria"
            titulo="Carga horaria"
            subtitulo={c ? `${c.profesor.nombre}${c.ciclo ? ` · año escolar ${c.ciclo}` : ''}` : undefined}
            cargando={isLoading}
            error={error}
            textoDeCarga="Cargando la carga horaria…"
        >
            {c && (
                <>
                    {c.filas.length === 0 ? (
                        <p className="mt-6 text-center text-sm text-gray-600">No da clases este año.</p>
                    ) : (
                        <table className="mt-4 w-full border-collapse text-sm" aria-label="Carga horaria">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Sección
                                    </th>
                                    <th scope="col" className={`${CELDA} text-left`}>
                                        Materia
                                    </th>
                                    <th scope="col" className={CELDA}>
                                        Horas a la semana
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {c.filas.map((f, i) => (
                                    <tr key={i}>
                                        <td className={CELDA}>{f.seccion}</td>
                                        <td className={CELDA}>{f.materia}</td>
                                        <td className={`${CELDA} text-center tabular-nums`}>{f.horas === null ? 'sin horas' : horas(f.horas)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50 font-semibold">
                                    <th scope="row" colSpan={2} className={`${CELDA} text-right`}>
                                        Total
                                    </th>
                                    <td className={`${CELDA} text-center tabular-nums`}>{horas(c.total)}</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                    <p className="mt-3 text-sm text-gray-700">
                        {ESTADO[c.estado]} que recomienda el liceo ({c.reglas.minimo} a {c.reglas.maximo} horas).
                        {c.sinHoras > 0 ? ` ${c.sinHoras} ${c.sinHoras === 1 ? 'materia no tiene' : 'materias no tienen'} horas puestas: no cuentan.` : ''}
                        {c.profesor.ingreso ? ` En el liceo desde el ${fechaCorta(c.profesor.ingreso)}.` : ''}
                    </p>
                    {yo?.role === 'ADMIN' && <RangoDelLiceo reglas={c.reglas} />}
                    <Firma nombre={c.firmante.nombre} detalle={c.firmante.cargo} />
                </>
            )}
        </HojaImprimible>
    );
}

function RangoDelLiceo({ reglas }: { reglas: { minimo: number; maximo: number } }) {
    const cola = useQueryClient();
    const [minimo, setMinimo] = React.useState(String(reglas.minimo));
    const [maximo, setMaximo] = React.useState(String(reglas.maximo));
    const guardar = useMutation({
        mutationFn: async () => (await api.put('/institutes/current/carga-horaria', { minimo: Number(minimo), maximo: Number(maximo) })).data,
        onSuccess: () => {
            toast.success('Rango guardado');
            void cola.invalidateQueries({ queryKey: ['carga-horaria'] });
            void cola.invalidateQueries({ queryKey: ['reglas-carga-horaria'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el rango')),
    });
    return (
        <form
            className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-gray-50 p-3 print:hidden"
            onSubmit={(e) => {
                e.preventDefault();
                guardar.mutate();
            }}
            aria-label="Rango recomendado del liceo"
        >
            <div className="w-28 space-y-1">
                <label htmlFor="rango-minimo" className="text-xs font-semibold text-gray-700">
                    Mínimo (h)
                </label>
                <Input id="rango-minimo" type="number" min={0} max={80} value={minimo} onChange={(e) => setMinimo(e.target.value)} className="min-h-[44px]" />
            </div>
            <div className="w-28 space-y-1">
                <label htmlFor="rango-maximo" className="text-xs font-semibold text-gray-700">
                    Máximo (h)
                </label>
                <Input id="rango-maximo" type="number" min={0} max={80} value={maximo} onChange={(e) => setMaximo(e.target.value)} className="min-h-[44px]" />
            </div>
            <button type="submit" disabled={guardar.isPending} className="min-h-[44px] rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                Cambiar el rango del liceo
            </button>
        </form>
    );
}
