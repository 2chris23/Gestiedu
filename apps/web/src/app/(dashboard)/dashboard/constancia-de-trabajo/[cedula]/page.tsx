'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { HojaImprimible, Firma, Parrafos, fechaCorta } from '@/components/documentos/HojaImprimible';

/**
 * LA CONSTANCIA DE TRABAJO, PARA IMPRIMIR
 *
 * Del personal del liceo: cargo, desde cuándo y, si da clases, su carga
 * horaria. El texto es del liceo (plantilla `TRABAJO`). Solo el admin
 * (`services/personal.service.ts`).
 */
interface Constancia {
    titulo: string;
    parrafos: string[];
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    emitidaEl: string;
}

export default function ConstanciaDeTrabajoPage({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
    const id = decodeURIComponent(cedula);
    const { data: c, isLoading, error } = useQuery<Constancia>({
        queryKey: ['constancia-de-trabajo', id],
        queryFn: async () => (await api.get(`/users/${encodeURIComponent(id)}/constancia-de-trabajo`)).data.data,
    });
    return (
        <HojaImprimible etiqueta="Constancia de trabajo" titulo={c?.titulo} cargando={isLoading} error={error} textoDeCarga="Cargando la constancia…">
            {c && (
                <>
                    <div className="mt-6">
                        <Parrafos parrafos={c.parrafos} />
                    </div>
                    <Firma nombre={c.firmante.nombre} detalle={[c.firmante.cargo, c.firmante.cedula ? `C.I. ${c.firmante.cedula}` : null].filter(Boolean).join(' · ')} />
                    <p className="mt-6 text-center text-xs text-gray-600">Emitida el {fechaCorta(c.emitidaEl)}</p>
                </>
            )}
        </HojaImprimible>
    );
}
