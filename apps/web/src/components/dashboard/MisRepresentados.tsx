'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
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

/** «MADRE» → «Madre». El parentesco llega en mayúsculas, como se guarda. */
function comoSeDiceElParentesco(p: string | null | undefined) {
    if (!p) return null;
    const t = p.replace(/_/g, ' ').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
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
                            <UserAvatar name={hijo.fullName} src={hijo.avatar} className="h-11 w-11 shrink-0" initialsClassName="text-sm" />
                            <span className="min-w-0 flex-1">
                                {/* El nombre entero, en dos líneas si hace falta: dos
                                    hermanos «Luis Fernando Contreras …» no se
                                    distinguían. */}
                                <span className="line-clamp-2 font-bold text-gray-900" title={hijo.fullName}>
                                    {hijo.fullName}
                                </span>
                                <span className="block truncate text-xs text-gray-700">
                                    {[hijo.classroom, comoSeDiceElParentesco(hijo.relationship)].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                            <ChevronDown size={20} className={cn('shrink-0 text-gray-600 transition-transform', desplegado && 'rotate-180')} />
                        </button>
                        {/* CÓMO VA, SIN TOCAR NADA
                            El promedio y la asistencia ya venían del servidor y no
                            se enseñaban: para saber cómo iba su hijo, el
                            representante tenía que abrir la tarjeta y aun así solo
                            veía actividades. Es lo primero que viene a mirar. */}
                        <dl className="grid grid-cols-2 gap-2 px-4 pb-4">
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <dt className="text-xs text-gray-600">Promedio</dt>
                                {/* Sin verde ni rojo: la nota que aprueba la decide cada liceo
                                    (`notaMinimaAprobatoria`) y esta tarjeta no la
                                    tiene; pintarla con el 10 fijo mentiría en los
                                    liceos que aprueban con otra. */}
                                <dd className="text-lg font-bold text-gray-900">
                                    {hijo.average > 0 ? hijo.average.toFixed(1) : '—'}
                                    {hijo.average <= 0 && <span className="ml-1 text-xs font-normal text-gray-600">sin notas aún</span>}
                                </dd>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <dt className="text-xs text-gray-600">Asistencia</dt>
                                <dd className="text-lg font-bold text-gray-900">{Math.round(hijo.attendancePercentage)}%</dd>
                            </div>
                        </dl>
                        {desplegado && (
                            <div className="px-4 pb-4">
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
