'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight } from 'lucide-react';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

/**
 * LAS CITACIONES, EN EL INICIO DEL REPRESENTANTE
 *
 * Las de sus representados: cuándo, dónde y si ya se atendió. Al tocarla se
 * abre la hoja (la misma que se imprime). Solo mira: no se marcan desde aquí.
 */

interface Citacion {
    id: string;
    cuando: string;
    lugar: string;
    estado: 'PENDIENTE' | 'ASISTIO' | 'NO_ASISTIO';
    alumno: { id: string; nombre: string };
}

const ESTADO = {
    PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
    ASISTIO: { texto: 'Atendida', clase: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    NO_ASISTIO: { texto: 'No asistió', clase: 'bg-rose-50 text-rose-800 ring-rose-200' },
} as const;

export function CitacionesDelRepresentante() {
    const { data } = useQuery<Citacion[]>({
        queryKey: ['citaciones', 'mias'],
        queryFn: async () => (await api.get('/citaciones/mias')).data.data,
    });
    if (!data || data.length === 0) return null;
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs" aria-labelledby="citaciones-titulo">
            <h2 id="citaciones-titulo" className="mb-2 flex items-center gap-2 font-bold text-gray-900">
                <CalendarClock className="h-5 w-5 text-indigo-600" aria-hidden /> Citaciones
            </h2>
            <ul className="divide-y divide-gray-100">
                {data.slice(0, 5).map((c) => (
                    <li key={c.id}>
                        <Link href={`/dashboard/citaciones/${c.id}`} className="flex min-h-[44px] items-center gap-3 py-2">
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-gray-900">
                                    {c.alumno.nombre}: {c.cuando}
                                </span>
                                <span className="block text-xs text-gray-600">En {c.lugar}</span>
                            </span>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold ring-1', ESTADO[c.estado].clase)}>{ESTADO[c.estado].texto}</span>
                            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default CitacionesDelRepresentante;
