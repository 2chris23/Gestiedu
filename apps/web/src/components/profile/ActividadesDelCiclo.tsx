'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardList, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActividadDelAlumno, ESTADO_DE_ACTIVIDAD, useActividadesDelAlumno } from '@/hooks/useActividadesDelAlumno';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { cn } from '@/lib/utils';

/**
 * LAS ACTIVIDADES DE UN CICLO, EN UNA VENTANA
 *
 * Se abre desde el ciclo del alumno: al pulsar el promedio, todas; al pulsar
 * una materia, las de esa materia. Respeta el lapso elegido en el ciclo. Al
 * pulsar una actividad se va a su clase: el personal, a la clase en vivo de
 * ese día; el alumno y su representante, a «Mi clase» (lo suyo y nada más).
 *
 * «Pendientes» junta las que aún no llegan y las que se pasaron de fecha sin
 * nota (esas se marcan en rojo): el sistema no recibe entregas, así que lo que
 * consta es la nota del profesor (`actividades-del-alumno.controller.ts`).
 */

type Filtro = 'TODAS' | 'CON_NOTA' | 'PENDIENTES';

const fechaLegible = (iso: string | null | undefined) => {
    if (!iso) return 'Sin fecha';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
};

export default function ActividadesDelCiclo({
    studentId,
    cicloId,
    cicloNombre,
    lapso,
    materia,
    alCerrar,
}: {
    studentId: string;
    cicloId: string;
    cicloNombre: string;
    lapso: { id: string; name: string } | null;
    materia: { id: string; name: string } | null;
    alCerrar: () => void;
}) {
    const router = useRouter();
    const { yo } = useQuienSoy();
    const { data, isLoading, error } = useActividadesDelAlumno(studentId, cicloId);
    const [filtro, setFiltro] = React.useState<Filtro>('TODAS');

    const delAlcance = (data?.actividades ?? []).filter(
        (a) => (!lapso || a.periodId === lapso.id) && (!materia || a.subject.id === materia.id)
    );
    const conNota = delAlcance.filter((a) => a.estado === 'EVALUADA');
    const pendientes = delAlcance.filter((a) => a.estado !== 'EVALUADA');
    const visibles = filtro === 'CON_NOTA' ? conNota : filtro === 'PENDIENTES' ? pendientes : delAlcance;

    const abrir = (a: ActividadDelAlumno) => {
        const familia = yo?.role === 'STUDENT' || yo?.role === 'TUTOR';
        if (familia) {
            const deQuien = yo?.role === 'TUTOR' ? `?alumno=${encodeURIComponent(studentId)}` : '';
            router.push(`/dashboard/mi-clase/${encodeURIComponent(a.subject.id)}${deQuien}`);
        } else {
            const dia = a.diaDeLaClase ?? a.fecha;
            router.push(
                `/dashboard/clase-en-vivo/${encodeURIComponent(a.classroom.id)}/${encodeURIComponent(a.subject.id)}${dia ? `?date=${dia}` : ''}`
            );
        }
        alCerrar();
    };

    const pestanas: Array<{ clave: Filtro; texto: string; cuantas: number }> = [
        { clave: 'TODAS', texto: 'Todas', cuantas: delAlcance.length },
        { clave: 'CON_NOTA', texto: 'Con nota', cuantas: conNota.length },
        { clave: 'PENDIENTES', texto: 'Pendientes', cuantas: pendientes.length },
    ];

    const titulo = materia ? `Actividades de ${materia.name}` : 'Actividades';
    const alcance = [lapso ? lapso.name : 'Todo el ciclo escolar', `Ciclo ${cicloNombre}`].join(' · ');

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="flex max-w-2xl flex-col gap-3 p-0">
                <DialogHeader className="border-b border-gray-100 px-5 pb-3 pt-5 text-left">
                    <DialogTitle className="flex items-center gap-2 pr-10">
                        <ClipboardList className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden /> {titulo}
                    </DialogTitle>
                    <DialogDescription>{alcance}</DialogDescription>
                    <div role="group" aria-label="Qué actividades" className="flex flex-wrap gap-1.5 pt-2">
                        {pestanas.map((p) => (
                            <button
                                key={p.clave}
                                type="button"
                                onClick={() => setFiltro(p.clave)}
                                aria-pressed={filtro === p.clave}
                                className={cn(
                                    'min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors',
                                    filtro === p.clave
                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                                )}
                            >
                                {p.texto} ({p.cuantas})
                            </button>
                        ))}
                    </div>
                </DialogHeader>

                <div className="max-h-[60dvh] overflow-y-auto px-2 pb-3">
                    {isLoading ? (
                        <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-700">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" aria-hidden /> Cargando actividades…
                        </p>
                    ) : error ? (
                        <p className="py-10 text-center text-sm text-rose-700">No se pudieron cargar las actividades.</p>
                    ) : visibles.length === 0 ? (
                        <p className="py-10 text-center text-sm text-gray-700">Nada en esta lista.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {visibles.map((a) => {
                                const estado = ESTADO_DE_ACTIVIDAD[a.estado];
                                return (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={() => abrir(a)}
                                            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-indigo-50/60"
                                        >
                                            <span
                                                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                                style={{ backgroundColor: a.subject.color || '#6366f1' }}
                                                aria-hidden
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-bold text-gray-900">{a.title}</span>
                                                <span className="mt-0.5 block text-xs text-gray-700">
                                                    {materia ? '' : `${a.subject.name} · `}
                                                    {a.tag ? `${a.tag} · ` : ''}
                                                    {fechaLegible(a.fecha)}
                                                </span>
                                                {a.otraForma && (
                                                    <span className="mt-1 inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                                        Evaluado con: {a.otraForma.metodo}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="flex shrink-0 flex-col items-end gap-1">
                                                <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', estado.clases)}>
                                                    {estado.texto}
                                                </span>
                                                {a.estado === 'EVALUADA' && (
                                                    <span className="text-sm font-bold tabular-nums text-gray-900">
                                                        {a.nota} / {a.maxScore ?? 20}
                                                    </span>
                                                )}
                                            </span>
                                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
