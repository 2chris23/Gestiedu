'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { classroomService } from '@/services/classroom.service';
import type { EstadoDelFinDeAno } from '@/lib/fin-de-ano';

/**
 * PASO 2 — EL RESULTADO FINAL
 *
 * Cuántos pasan, cuántos con pendientes y cuántos repiten con las reglas del
 * liceo (y lo que el admin haya decidido), y el Resumen Final de cada sección.
 */
export default function PasoResultado({ cicloId, estado }: { cicloId: string; estado: EstadoDelFinDeAno }) {
    const { data } = useQuery({
        queryKey: ['fin-de-ano', cicloId, 'secciones'],
        queryFn: async () => {
            const r = await classroomService.getClassrooms(cicloId, { limit: 100 });
            const lista = Array.isArray(r) ? r : r.classrooms;
            return [...lista].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section));
        },
    });
    const r = estado.resultado;
    const cifras = [
        { texto: 'Alumnos', valor: r.alumnos, clase: 'text-gray-900' },
        { texto: 'Promovidos', valor: r.promovidos, clase: 'text-emerald-700' },
        { texto: 'Con pendientes', valor: r.conPendientes, clase: 'text-amber-700' },
        { texto: 'Repiten', valor: r.noPromovidos, clase: 'text-rose-700' },
        { texto: 'Egresan', valor: r.egresados, clase: 'text-violet-700' },
    ];

    return (
        <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {cifras.map((c) => (
                    <div key={c.texto} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <dt className="text-xs text-gray-600">{c.texto}</dt>
                        <dd className={`text-xl font-bold tabular-nums ${c.clase}`}>{c.valor}</dd>
                    </div>
                ))}
            </dl>
            <div>
                <p className="mb-2 text-sm text-gray-700">El Resumen Final de cada sección, para revisar e imprimir:</p>
                <div className="flex flex-wrap gap-2">
                    {(data ?? []).map((s) => (
                        <Link
                            key={s.id}
                            href={`/dashboard/resumen-final/${s.id}`}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                            <FileText className="h-4 w-4" aria-hidden /> {s.name}
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
