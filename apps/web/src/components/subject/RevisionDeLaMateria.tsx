'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';

/**
 * LA REVISIÓN, DESDE LA MATERIA DEL PROFESOR
 *
 * Al terminar el año, los alumnos que reprobaron esta materia la presentan
 * en revisión, y la nota la pone el profesor que la da (o control de
 * estudios, que corrige). Si el liceo divide la revisión (p. ej. 30 %
 * actividades + 70 % prueba), se pone la nota de cada parte y el sistema
 * hace la cuenta. El servidor decide quién puede (`/api/revision`).
 */

interface Datos {
    seccion: { id: string; nombre: string };
    materia: { id: string; nombre: string };
    cerrado: boolean;
    minima: number;
    componentes: Array<{ nombre: string; peso: number }>;
    alumnos: Array<{
        id: string;
        nombre: string;
        definitiva: number;
        revision: { nota: number; componentes: Array<{ nombre: string; nota: number }> | null } | null;
    }>;
}

export default function RevisionDeLaMateria({ classroomId, subjectId, puedePoner }: { classroomId: string; subjectId: string; puedePoner: boolean }) {
    const clave = ['revision', classroomId, subjectId];
    const { data, isLoading, error } = useQuery({
        queryKey: clave,
        queryFn: async () => (await api.get(`/revision/${classroomId}/${subjectId}`)).data.data as Datos,
        enabled: !!classroomId && !!subjectId,
    });

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando quién reprobó…
            </p>
        );
    }
    if (error || !data) {
        return <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-600">{getApiErrorMessage(error, 'No se pudo cargar la revisión.')}</p>;
    }
    const editable = puedePoner && !data.cerrado;

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4">
                <h3 className="font-bold text-gray-900">Revisión</h3>
                <p className="text-sm text-gray-600">
                    Los alumnos que reprobaron {data.materia.nombre} en el año (menos de {data.minima}). La nota de la revisión pasa a ser su
                    definitiva.
                    {data.componentes.length > 1 && ` Se divide en ${data.componentes.map((c) => `${c.nombre} ${c.peso} %`).join(' + ')}.`}
                </p>
            </div>
            {!editable && (
                <p className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm text-gray-700">
                    <Lock className="h-4 w-4" aria-hidden />
                    {data.cerrado ? 'El año escolar ya se cerró.' : 'La pone el profesor de la materia.'}
                </p>
            )}
            {data.alumnos.length === 0 ? (
                <p className="p-6 text-sm text-gray-600">Nadie reprobó esta materia: no hay revisión.</p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {data.alumnos.map((a) => (
                        <FilaDeRevision key={a.id} alumno={a} datos={data} editable={editable} clave={clave} classroomId={classroomId} subjectId={subjectId} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function FilaDeRevision({
    alumno,
    datos,
    editable,
    clave,
    classroomId,
    subjectId,
}: {
    alumno: Datos['alumnos'][number];
    datos: Datos;
    editable: boolean;
    clave: unknown[];
    classroomId: string;
    subjectId: string;
}) {
    const cola = useQueryClient();
    const inicial = (nombre: string) => {
        if (!alumno.revision) return '';
        if (datos.componentes.length === 1) return String(alumno.revision.nota);
        return String(alumno.revision.componentes?.find((c) => c.nombre === nombre)?.nota ?? '');
    };
    const [notas, setNotas] = React.useState<Record<string, string>>(() =>
        Object.fromEntries(datos.componentes.map((c) => [c.nombre, inicial(c.nombre)]))
    );
    const numero = (t: string) => Number(t.replace(',', '.'));
    const validas = datos.componentes.every((c) => (notas[c.nombre] ?? '').trim() !== '' && numero(notas[c.nombre]) >= 0 && numero(notas[c.nombre]) <= 20);
    const guardar = useMutation({
        mutationFn: () =>
            api.put(`/revision/${classroomId}/${subjectId}`, {
                studentId: alumno.id,
                ...(datos.componentes.length === 1
                    ? { score: numero(notas[datos.componentes[0].nombre]) }
                    : { componentes: datos.componentes.map((c) => ({ nombre: c.nombre, nota: numero(notas[c.nombre]) })) }),
            }),
        onSuccess: () => {
            toast.success(`Revisión de ${alumno.nombre} guardada`);
            void cola.invalidateQueries({ queryKey: clave });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la revisión')),
    });

    return (
        <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{alumno.nombre}</p>
                <p className="text-xs text-gray-600">
                    En el año: {alumno.definitiva}
                    {alumno.revision && (
                        <span className={alumno.revision.nota >= datos.minima ? 'text-emerald-700' : 'text-rose-700'}> · revisión: {alumno.revision.nota}</span>
                    )}
                </p>
            </div>
            {editable && (
                <div className="flex flex-wrap items-center gap-2">
                    {datos.componentes.map((c) => (
                        <label key={c.nombre} className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            {datos.componentes.length > 1 ? `${c.nombre} (${c.peso} %)` : 'Nota'}
                            <input
                                aria-label={`${c.nombre} de ${alumno.nombre}`}
                                inputMode="decimal"
                                value={notas[c.nombre] ?? ''}
                                onChange={(e) => setNotas({ ...notas, [c.nombre]: e.target.value })}
                                className="min-h-[44px] w-20 rounded-lg border border-gray-300 px-2 text-right text-sm tabular-nums"
                            />
                        </label>
                    ))}
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={!validas || guardar.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                    </button>
                </div>
            )}
        </li>
    );
}
