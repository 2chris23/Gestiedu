'use client';

import { useQuery } from '@tanstack/react-query';
import { HeartHandshake } from 'lucide-react';
import { laborSocial, avanceLegible } from '@/lib/labor-social';
import { cn } from '@/lib/utils';

/**
 * LA LABOR SOCIAL DE UN ALUMNO, PARA MIRAR
 *
 * Lo que ven el alumno y su representante (y el personal en la ficha): cuánto
 * lleva y qué hizo. Solo sale si le toca (un grado que la hace, o ya tiene
 * actividades). La anotan el admin y el guía desde «Labor social».
 */
export function LaborSocialDelAlumno({ studentId, compacto = false }: { studentId: string; compacto?: boolean }) {
    const { data } = useQuery({
        queryKey: ['labor-social', 'alumno', studentId],
        queryFn: () => laborSocial.delAlumno(studentId),
        enabled: !!studentId,
    });
    if (!data || !data.aplica) return null;
    const { avance } = data;
    const pct = avance.porProyecto ? (avance.proyectoCulminado ? 100 : 50) : Math.min(100, avance.requeridas > 0 ? (avance.horas / avance.requeridas) * 100 : 0);

    return (
        <section className={cn('rounded-2xl border border-gray-200 bg-white', compacto ? 'p-3' : 'p-4 shadow-xs')} aria-label="Labor social">
            <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <HeartHandshake className="h-4 w-4 text-rose-600" aria-hidden /> Labor social
                </h3>
                <span className={cn('text-sm font-semibold', avance.cumplida ? 'text-emerald-700' : 'text-gray-800')}>
                    {avance.cumplida ? 'Cumplida · ' : ''}
                    {avanceLegible(avance)}
                </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className={cn('h-full rounded-full', avance.cumplida ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
            </div>
            {!compacto && data.actividades.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                    {data.actividades.slice(0, 5).map((a) => (
                        <li key={a.id} className="flex justify-between gap-3 text-gray-700">
                            <span className="min-w-0 truncate">
                                {a.fecha.split('-').reverse().join('/')} · {a.que}
                                {a.donde ? ` (${a.donde})` : ''}
                            </span>
                            <span className="shrink-0 tabular-nums text-gray-900">{String(a.horas).replace('.', ',')} h</span>
                        </li>
                    ))}
                    {data.actividades.length > 5 && <li className="text-xs text-gray-600">…y {data.actividades.length - 5} más</li>}
                </ul>
            )}
        </section>
    );
}

export default LaborSocialDelAlumno;
