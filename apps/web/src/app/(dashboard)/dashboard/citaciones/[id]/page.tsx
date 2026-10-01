'use client';

import * as React from 'react';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { HojaImprimible, Firma, Parrafos, fechaCorta } from '@/components/documentos/HojaImprimible';
import { MarcarAsistencia } from '@/components/observations/MarcarAsistencia';

/**
 * LA CITACIÓN AL REPRESENTANTE, PARA IMPRIMIR
 *
 * La ven quien puede citar (admin, guía del alumno, quien escribió la
 * observación) y los representantes del alumno —la hoja va a nombre del que
 * la mira—. Aquí llega el aviso al tocarlo en el teléfono. El personal marca
 * desde aquí si vino (`services/citaciones.service.ts`).
 */

interface Hoja {
    titulo: string;
    parrafos: string[];
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    alumno: { id: string; nombre: string };
    representante: { nombre: string; parentesco: string } | null;
    citacion: { id: string; cuando: string; estado: 'PENDIENTE' | 'ASISTIO' | 'NO_ASISTIO'; loQueSeHablo: string | null };
    puedeMarcar: boolean;
    emitidaEl: string;
}

const ESTADO = { PENDIENTE: 'Pendiente', ASISTIO: 'El representante vino', NO_ASISTIO: 'El representante no vino' } as const;

export default function CitacionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [marcando, setMarcando] = React.useState(false);
    const { data: h, isLoading, error } = useQuery<Hoja>({
        queryKey: ['citacion', id],
        queryFn: async () => (await api.get(`/citaciones/${encodeURIComponent(id)}`)).data.data,
    });

    return (
        <HojaImprimible
            etiqueta="Citación al representante"
            titulo={h?.titulo}
            cargando={isLoading}
            error={error ?? (!isLoading && !h ? new Error('Sin datos') : null)}
            textoDeCarga="Cargando la citación…"
            controles={
                h?.puedeMarcar ? (
                    <button
                        type="button"
                        onClick={() => setMarcando(true)}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        ¿Vino?
                    </button>
                ) : undefined
            }
        >
            {h && (
                <>
                    <p className="mt-4 text-center text-sm font-semibold text-gray-800 print:hidden">
                        {ESTADO[h.citacion.estado]}
                        {h.citacion.loQueSeHablo ? ` · Se habló: ${h.citacion.loQueSeHablo}` : ''}
                    </p>
                    <Parrafos parrafos={h.parrafos} />
                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
                        <Firma nombre={h.firmante.nombre} detalle={h.firmante.cargo} />
                        <Firma nombre={h.representante?.nombre ?? null} detalle="Recibido por el representante" />
                    </div>
                    <p className="mt-6 text-center text-xs text-gray-600">Emitida el {fechaCorta(h.emitidaEl)}</p>
                    {marcando && (
                        <MarcarAsistencia
                            citacion={{ id: h.citacion.id, cuando: h.citacion.cuando, estado: h.citacion.estado, loQueSeHablo: h.citacion.loQueSeHablo }}
                            alCerrar={() => setMarcando(false)}
                        />
                    )}
                </>
            )}
        </HojaImprimible>
    );
}
