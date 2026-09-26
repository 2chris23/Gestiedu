'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';
import { Lista } from '@/components/ui/lista';

/**
 * LAS APRECIACIONES DE UNA MATERIA SIN NOTA
 *
 * Orientación, Grupos de Creación… se evalúan con una palabra del liceo
 * («Consolidado», «En proceso»…), por lapso y la final del año. La pone el
 * profesor que da la materia en esta sección (o el admin): cada cambio se
 * guarda al elegirlo. El guía de la sección la ve sin poder cambiarla; el
 * servidor decide (`/api/apreciaciones`).
 */

interface Datos {
    materia: { id: string; nombre: string };
    valores: string[];
    momentos: Array<{ id: string; nombre: string }>;
    alumnos: Array<{ id: string; nombre: string; apreciaciones: Record<string, { valor: string; observacion: string | null }> }>;
    cerrado: boolean;
}

const SIN_PONER = '__sin';

export default function ApreciacionesDeLaMateria({
    classroomId,
    subjectId,
    puedePoner,
}: {
    classroomId: string;
    subjectId: string;
    puedePoner: boolean;
}) {
    const cola = useQueryClient();
    const clave = ['apreciaciones', classroomId, subjectId];
    const { data, isLoading, error } = useQuery({
        queryKey: clave,
        queryFn: async () => (await api.get(`/apreciaciones/${classroomId}/${subjectId}`)).data.data as Datos,
        enabled: !!classroomId && !!subjectId,
    });
    const [momento, setMomento] = React.useState<string>('');
    const momentoElegido = momento || data?.momentos[0]?.id || '';

    const poner = useMutation({
        mutationFn: async (v: { studentId: string; valor: string }) =>
            api.put(`/apreciaciones/${classroomId}/${subjectId}`, { momento: momentoElegido, items: [v] }),
        onMutate: async (v) => {
            await cola.cancelQueries({ queryKey: clave });
            const antes = cola.getQueryData<Datos>(clave);
            cola.setQueryData<Datos>(clave, (d) =>
                d
                    ? {
                          ...d,
                          alumnos: d.alumnos.map((a) => {
                              if (a.id !== v.studentId) return a;
                              const suyas = { ...a.apreciaciones };
                              if (v.valor) suyas[momentoElegido] = { valor: v.valor, observacion: null };
                              else delete suyas[momentoElegido];
                              return { ...a, apreciaciones: suyas };
                          }),
                      }
                    : d
            );
            return { antes };
        },
        onError: (e, _v, ctx) => {
            if (ctx?.antes) cola.setQueryData(clave, ctx.antes);
            toast.error(getApiErrorMessage(e, 'No se pudo guardar la apreciación'));
        },
        onSettled: () => void cola.invalidateQueries({ queryKey: clave }),
    });

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando apreciaciones…
            </p>
        );
    }
    if (error || !data) {
        return (
            <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
                {getApiErrorMessage(error, 'No se pudieron cargar las apreciaciones.')}
            </p>
        );
    }

    const editable = puedePoner && !data.cerrado;
    const opciones = [{ valor: SIN_PONER, texto: 'Sin poner' }, ...data.valores.map((v) => ({ valor: v, texto: v }))];
    const puestas = data.alumnos.filter((a) => a.apreciaciones[momentoElegido]).length;

    return (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="font-bold text-gray-900">Apreciaciones</h3>
                    <p className="text-sm text-gray-600">
                        Esta materia no lleva nota ni entra en los promedios. {puestas} de {data.alumnos.length} puestas en este momento.
                    </p>
                </div>
                <div className="w-full sm:w-56">
                    <Lista
                        etiqueta="Momento"
                        valor={momentoElegido}
                        alCambiar={setMomento}
                        opciones={data.momentos.map((m) => ({ valor: m.id, texto: m.nombre }))}
                    />
                </div>
            </div>
            {!editable && (
                <p className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm text-gray-700">
                    <Lock className="h-4 w-4" aria-hidden />
                    {data.cerrado ? 'El año escolar ya se cerró.' : 'Las pone el profesor de la materia.'}
                </p>
            )}
            {data.alumnos.length === 0 ? (
                <p className="p-6 text-sm text-gray-600">La sección no tiene alumnos inscritos.</p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {data.alumnos.map((a) => {
                        const actual = a.apreciaciones[momentoElegido]?.valor;
                        return (
                            <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <span className="min-w-0 truncate text-sm font-medium text-gray-900">{a.nombre}</span>
                                {editable ? (
                                    <div className="w-full sm:w-56">
                                        <Lista
                                            etiqueta={`Apreciación de ${a.nombre}`}
                                            valor={actual ?? SIN_PONER}
                                            alCambiar={(v) => poner.mutate({ studentId: a.id, valor: v === SIN_PONER ? '' : v })}
                                            opciones={opciones}
                                        />
                                    </div>
                                ) : (
                                    <span className="text-sm font-semibold text-gray-800">{actual ?? '—'}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
