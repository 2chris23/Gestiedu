'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { finDeAno, type FilaDeRevision, type ReglasDelFinDeAno } from '@/lib/fin-de-ano';
import { getApiErrorMessage } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * PASO 3 — LA REVISIÓN
 *
 * La pone el profesor de cada materia desde su materia (pestaña «Revisión»);
 * aquí control de estudios ve cómo va, corrige, y el liceo dice cómo se
 * divide la nota (p. ej. 30 % actividades + 70 % prueba) y hasta cuántas
 * materias reprobadas se pueden llevar a revisión.
 */
export default function PasoRevision({ cicloId, reglas, cerrado }: { cicloId: string; reglas: ReglasDelFinDeAno; cerrado: boolean }) {
    const cola = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['fin-de-ano', cicloId, 'revision'],
        queryFn: () => finDeAno.revision(cicloId),
    });
    const [editando, setEditando] = React.useState<FilaDeRevision | null>(null);

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las materias reprobadas…
            </p>
        );
    }
    if (error || !data) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudo cargar la revisión.')}</p>;

    const hechas = data.filas.filter((f) => f.revision != null).length;

    return (
        <div className="space-y-4">
            <ReglasDeRevision reglas={reglas.revision} deshabilitado={cerrado} alGuardar={() => void cola.invalidateQueries({ queryKey: ['fin-de-ano', cicloId] })} />

            <p className="text-sm text-gray-700">
                {data.filas.length === 0
                    ? 'Nadie reprobó ninguna materia: no hay revisión.'
                    : `${hechas} de ${data.filas.length} materias reprobadas ya tienen revisión. La pone el profesor de cada materia desde su materia; aquí se corrige.`}
            </p>
            {data.filas.length > 0 && (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {data.filas.map((f) => (
                        <li key={`${f.alumno.id}|${f.materia.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-gray-900">
                                    {f.alumno.nombre} · {f.materia.nombre}
                                </p>
                                <p className="text-xs text-gray-600">
                                    {f.seccion?.nombre ?? '—'} · {f.profesor ?? 'sin profesor'} · en el año: {f.definitiva}
                                    {f.fueraDeRevision && (
                                        <span className="ml-1 font-semibold text-rose-700">
                                            · reprobó {f.reprobadasDelAlumno}: no va a revisión
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold tabular-nums ${f.revision == null ? 'text-gray-500' : f.revision >= data.minima ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {f.revision == null ? 'Sin revisión' : `Revisión: ${f.revision}`}
                                </span>
                                {!cerrado && !f.fueraDeRevision && (
                                    <button
                                        type="button"
                                        onClick={() => setEditando(f)}
                                        className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                        {f.revision == null ? 'Poner' : 'Corregir'}
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {editando && (
                <VentanaDeRevision
                    cicloId={cicloId}
                    fila={editando}
                    componentes={data.reglas.componentes}
                    alCerrar={() => setEditando(null)}
                />
            )}
        </div>
    );
}

function ReglasDeRevision({
    reglas,
    deshabilitado,
    alGuardar,
}: {
    reglas: ReglasDelFinDeAno['revision'];
    deshabilitado: boolean;
    alGuardar: () => void;
}) {
    const [partes, setPartes] = React.useState(reglas.componentes.map((c) => ({ ...c, peso: String(c.peso) })));
    const [tope, setTope] = React.useState(reglas.maxMaterias == null ? '' : String(reglas.maxMaterias));
    const suma = partes.reduce((s, p) => s + (Number(p.peso) || 0), 0);
    const guardar = useMutation({
        mutationFn: () =>
            finDeAno.guardarReglas({
                revision: {
                    componentes: partes.map((p) => ({ nombre: p.nombre.trim(), peso: Number(p.peso) })),
                    maxMaterias: tope.trim() === '' ? null : Number(tope),
                },
            }),
        onSuccess: () => {
            toast.success('Forma de la revisión guardada');
            alGuardar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar')),
    });

    return (
        <fieldset className="rounded-xl border border-gray-200 p-4" disabled={deshabilitado}>
            <legend className="px-1 text-sm font-semibold text-gray-800">Cómo se divide la nota de la revisión</legend>
            <ul className="space-y-2">
                {partes.map((p, i) => (
                    <li key={i} className="flex items-center gap-2">
                        <input
                            aria-label={`Parte ${i + 1}`}
                            value={p.nombre}
                            maxLength={40}
                            onChange={(e) => setPartes(partes.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)))}
                            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
                        />
                        <input
                            aria-label={`Peso de ${p.nombre || `la parte ${i + 1}`} (%)`}
                            inputMode="numeric"
                            value={p.peso}
                            onChange={(e) => setPartes(partes.map((x, k) => (k === i ? { ...x, peso: e.target.value.replace(/\D/g, '') } : x)))}
                            className="min-h-[44px] w-20 rounded-lg border border-gray-300 px-3 text-right text-sm tabular-nums"
                        />
                        <span className="text-sm text-gray-600">%</span>
                        <button
                            type="button"
                            aria-label={`Quitar ${p.nombre || 'esta parte'}`}
                            onClick={() => setPartes(partes.filter((_, k) => k !== i))}
                            disabled={partes.length <= 1}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                        >
                            <X className="h-4 w-4" aria-hidden />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => setPartes([...partes, { nombre: '', peso: '0' }])}
                    disabled={partes.length >= 6}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                >
                    <Plus className="h-4 w-4" aria-hidden /> Añadir parte
                </button>
                <span className={`text-sm font-semibold ${suma === 100 ? 'text-emerald-700' : 'text-rose-700'}`}>Suman {suma} %</span>
            </div>
            <label className="mt-3 block text-sm text-gray-800">
                Van a revisión los que reprobaron hasta
                <input
                    aria-label="Tope de materias en revisión"
                    inputMode="numeric"
                    value={tope}
                    placeholder="todas"
                    onChange={(e) => setTope(e.target.value.replace(/\D/g, ''))}
                    className="mx-2 min-h-[44px] w-20 rounded-lg border border-gray-300 px-3 text-right text-sm"
                />
                materias (vacío: todas).
            </label>
            <button
                type="button"
                onClick={() => guardar.mutate()}
                disabled={guardar.isPending || suma !== 100 || partes.some((p) => !p.nombre.trim())}
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
            </button>
        </fieldset>
    );
}

function VentanaDeRevision({
    cicloId,
    fila,
    componentes,
    alCerrar,
}: {
    cicloId: string;
    fila: FilaDeRevision;
    componentes: Array<{ nombre: string; peso: number }>;
    alCerrar: () => void;
}) {
    const cola = useQueryClient();
    const [notas, setNotas] = React.useState<Record<string, string>>({});
    const guardar = useMutation({
        mutationFn: () => {
            const partes = componentes.map((c) => ({ nombre: c.nombre, nota: Number((notas[c.nombre] ?? '').replace(',', '.')) }));
            return finDeAno.ponerRevision(cicloId, {
                studentId: fila.alumno.id,
                subjectId: fila.materia.id,
                ...(componentes.length === 1 ? { score: partes[0].nota } : { componentes: partes }),
            });
        },
        onSuccess: () => {
            toast.success('Revisión guardada');
            void cola.invalidateQueries({ queryKey: ['fin-de-ano', cicloId] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la revisión')),
    });
    const completas = componentes.every((c) => {
        const n = Number((notas[c.nombre] ?? '').replace(',', '.'));
        return (notas[c.nombre] ?? '').trim() !== '' && n >= 0 && n <= 20;
    });

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Revisión de {fila.materia.nombre}</DialogTitle>
                    <DialogDescription>
                        {fila.alumno.nombre}. En el año sacó {fila.definitiva}; la de la revisión pasa a ser su definitiva.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {componentes.map((c) => (
                        <label key={c.nombre} className="flex items-center justify-between gap-3 text-sm font-medium text-gray-800">
                            {c.nombre} ({c.peso} %)
                            <input
                                inputMode="decimal"
                                value={notas[c.nombre] ?? ''}
                                onChange={(e) => setNotas({ ...notas, [c.nombre]: e.target.value })}
                                className="min-h-[44px] w-24 rounded-lg border border-gray-300 px-3 text-right tabular-nums"
                                placeholder="0 a 20"
                            />
                        </label>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={!completas || guardar.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
