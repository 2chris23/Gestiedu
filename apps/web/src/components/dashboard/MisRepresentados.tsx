'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronDown, FileText } from 'lucide-react';
import api from '@/lib/axios';
import UserAvatar from '@/components/ui/UserAvatar';
import ActividadesDelAlumno from '@/components/profile/ActividadesDelAlumno';
import { cn } from '@/lib/utils';

/**
 * LO QUE VE UN REPRESENTANTE
 *
 * Sus representados y, de cada uno, qué le falta. Nada más: un representante ve
 * a los alumnos que representa y a ninguno más (lo comprueba el servidor en
 * cada petición, no esta pantalla).
 */

interface Representado {
    id: string;
    fullName: string;
    avatar: string | null;
    classroom: string | null;
    average: number;
    attendancePercentage: number;
    relationship: string;
}

export function MisRepresentados() {
    const { data } = useQuery({
        queryKey: ['panelDelRepresentante'],
        queryFn: async () => (await api.get('/dashboard/tutor')).data.data as { children: Representado[] },
        retry: false,
    });

    const hijos = React.useMemo(() => data?.children ?? [], [data]);
    const [abierto, setAbierto] = React.useState<string | null>(null);

    // Con un solo representado no hay nada que elegir: se abre solo. Se calcula
    // al pintar, sin efectos que cambien el estado y vuelvan a pintar.
    const desplegadoAhora = abierto ?? (hijos.length === 1 ? hijos[0].id : null);

    if (hijos.length === 0) return null;

    return (
        <section className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Mis representados</h2>
            {hijos.map((hijo) => {
                const desplegado = desplegadoAhora === hijo.id;
                return (
                    <div key={hijo.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <button
                            type="button"
                            onClick={() => setAbierto(desplegado ? null : hijo.id)}
                            aria-expanded={desplegado}
                            className="flex w-full items-center gap-3 px-5 py-4 text-left"
                        >
                            <UserAvatar name={hijo.fullName} src={hijo.avatar} className="h-11 w-11" initialsClassName="text-sm" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-bold text-gray-900">{hijo.fullName}</span>
                                <span className="block truncate text-xs text-gray-700">
                                    {[hijo.classroom, hijo.relationship].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                            <ChevronDown size={20} className={cn('shrink-0 text-gray-600 transition-transform', desplegado && 'rotate-180')} />
                        </button>
                        {desplegado && (
                            <div className="space-y-3 px-4 pb-4">
                                <Link
                                    href={`/dashboard/boleta/${encodeURIComponent(hijo.id)}`}
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                >
                                    <FileText size={16} /> Ver la boleta
                                </Link>{' '}
                                <Link
                                    href={`/dashboard/constancia/${encodeURIComponent(hijo.id)}`}
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                >
                                    <FileText size={16} /> Constancia de estudio
                                </Link>
                                <ActividadesDelAlumno studentId={hijo.id} titulo={`Actividades de ${hijo.fullName.split(' ')[0]}`} />
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
}

export default MisRepresentados;
