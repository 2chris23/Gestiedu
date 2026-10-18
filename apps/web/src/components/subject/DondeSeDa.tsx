'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Loader2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { NOMBRE_DEL_TURNO } from '@/lib/grupos-estables';
import api from '@/lib/axios';
import { cn, getApiErrorMessage } from '@/lib/utils';

const NOMBRE_DEL_ANO: Record<number, string> = { 1: 'Primer año', 2: 'Segundo año', 3: 'Tercer año', 4: 'Cuarto año', 5: 'Quinto año' };

interface SeccionDondeSeDa {
    id: string;
    nombre: string;
    turno: string;
    laTiene: boolean;
    bloques: number | null;
    profesor: string | null;
}
interface DondeSeDaDatos {
    materia: { id: string; name: string; porGrupos: boolean };
    anos: Array<{ grado: number; secciones: SeccionDondeSeDa[] }>;
}

/**
 * DÓNDE SE DA LA MATERIA (Cristian, 18-oct-2026)
 *
 * Por año, con todas sus secciones marcadas de un toque y cada una
 * desmarcable. Los bloques de cada año van a las secciones que se ponen; las
 * horas las saca el servidor de la hora de clase de su turno. Quitar una
 * sección con notas, actividades o plan no se puede (409 `CLASE_CON_TRABAJO`):
 * se dice cuál y no se quita nada. Las clases nuevas nacen sin profesor y
 * salen en Profesores, «clases sin profesor».
 */
export function DondeSeDa({ subjectId, academicYearId, alCerrar }: { subjectId: string; academicYearId: string; alCerrar: () => void }) {
    const qc = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['donde-se-da', subjectId, academicYearId],
        queryFn: async () => (await api.get(`/subjects/${encodeURIComponent(subjectId)}/secciones`, { params: { academicYearId } })).data.data as DondeSeDaDatos,
    });
    const [marcadas, setMarcadas] = React.useState<Set<string> | null>(null);
    const [bloques, setBloques] = React.useState<Record<number, number>>({});
    const [abierto, setAbierto] = React.useState<number | null>(null);

    // Lo de hoy, como punto de partida.
    React.useEffect(() => {
        if (!data || marcadas) return;
        setMarcadas(new Set(data.anos.flatMap((a) => a.secciones.filter((s) => s.laTiene).map((s) => s.id))));
        setBloques(Object.fromEntries(data.anos.map((a) => [a.grado, a.secciones.find((s) => s.bloques)?.bloques ?? 4])));
    }, [data, marcadas]);

    const guardar = useMutation({
        mutationFn: async () => {
            const todas = data!.anos.flatMap((a) => a.secciones.map((s) => ({ ...s, grado: a.grado })));
            const poner = todas.filter((s) => marcadas!.has(s.id) && !s.laTiene).map((s) => ({ classroomId: s.id, weeklyBlocks: bloques[s.grado] ?? 4 }));
            const quitar = todas.filter((s) => !marcadas!.has(s.id) && s.laTiene).map((s) => s.id);
            return (await api.put(`/subjects/${encodeURIComponent(subjectId)}/secciones`, { academicYearId, poner, quitar })).data.data as { puestas: number; quitadas: number };
        },
        onSuccess: (r) => {
            for (const k of ['donde-se-da', 'subject', 'subjects', 'profesores', 'classroomSubjects']) qc.invalidateQueries({ queryKey: [k] });
            toast.success(r.puestas || r.quitadas ? [r.puestas && `En ${r.puestas} más`, r.quitadas && `quitada de ${r.quitadas}`].filter(Boolean).join(' · ') : 'Sin cambios');
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar')),
    });

    const cambios = React.useMemo(() => {
        if (!data || !marcadas) return 0;
        return data.anos.flatMap((a) => a.secciones).filter((s) => marcadas.has(s.id) !== s.laTiene).length;
    }, [data, marcadas]);

    const alternar = (ids: string[], poner: boolean) =>
        setMarcadas((m) => {
            const n = new Set(m);
            for (const id of ids) (poner ? n.add(id) : n.delete(id));
            return n;
        });

    return (
        <Sheet open onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="zona-segura-abajo flex max-h-[90dvh] flex-col rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6 sm:mx-auto sm:max-w-lg"
            >
                <SheetTitle className="pr-12 text-lg font-bold text-gray-900">Dónde se da</SheetTitle>
                <SheetDescription className="text-sm text-gray-600">{data?.materia.name ?? 'La materia'}, por año y sección</SheetDescription>

                <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
                    {isLoading || !data || !marcadas ? (
                        <p className="flex items-center justify-center gap-2 py-8 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando
                        </p>
                    ) : data.anos.length === 0 ? (
                        <p className="rounded-[22px] bg-white px-4 py-8 text-center text-sm text-gray-600 ring-1 ring-gray-200">Este año escolar no tiene secciones.</p>
                    ) : (
                        data.anos.map(({ grado, secciones }) => {
                            const ids = secciones.map((s) => s.id);
                            const cuantas = ids.filter((id) => marcadas.has(id)).length;
                            const todas = cuantas === ids.length;
                            const esta = abierto === grado;
                            const nombre = NOMBRE_DEL_ANO[grado] ?? `${grado}.º año`;
                            return (
                                <section key={grado} aria-label={nombre} className="overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                                    <div className="flex items-center gap-1 pr-2">
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={todas ? true : cuantas ? 'mixed' : false}
                                            aria-label={`Todo ${nombre}`}
                                            onClick={() => alternar(ids, !todas)}
                                            className="flex h-14 w-14 shrink-0 items-center justify-center"
                                        >
                                            <Marca estado={todas ? 'si' : cuantas ? 'algunas' : 'no'} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-expanded={esta}
                                            onClick={() => setAbierto(esta ? null : grado)}
                                            className="flex min-h-[56px] min-w-0 flex-1 items-center gap-2 py-2 text-left"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15px] font-medium text-gray-900">{nombre}</span>
                                                <span className="block text-sm text-gray-600">
                                                    {cuantas === 0 ? 'En ninguna' : todas ? `En sus ${ids.length} secciones` : `En ${cuantas} de ${ids.length}`}
                                                </span>
                                            </span>
                                            <ChevronRight className={cn('h-5 w-5 shrink-0 text-gray-500 transition-transform', esta && 'rotate-90')} aria-hidden />
                                        </button>
                                    </div>
                                    {esta && (
                                        <div className="border-t border-gray-100">
                                            {/* Los bloques de las que se pongan. */}
                                            <div className="flex items-center gap-2 bg-gray-50/70 px-4 py-2">
                                                <span className="min-w-0 flex-1 text-sm text-gray-700">Bloques a la semana</span>
                                                <button
                                                    type="button"
                                                    aria-label={`Un bloque menos en ${nombre}`}
                                                    onClick={() => setBloques((b) => ({ ...b, [grado]: Math.max(1, (b[grado] ?? 4) - 1) }))}
                                                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                                                >
                                                    <Minus className="h-4 w-4" aria-hidden />
                                                </button>
                                                <span className="w-7 text-center text-lg font-bold tabular-nums text-gray-900" aria-live="polite">
                                                    {bloques[grado] ?? 4}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label={`Un bloque más en ${nombre}`}
                                                    onClick={() => setBloques((b) => ({ ...b, [grado]: Math.min(20, (b[grado] ?? 4) + 1) }))}
                                                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                                                >
                                                    <Plus className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                            <ul className="divide-y divide-gray-100">
                                                {secciones.map((s) => {
                                                    const si = marcadas.has(s.id);
                                                    return (
                                                        <li key={s.id}>
                                                            <button
                                                                type="button"
                                                                role="checkbox"
                                                                aria-checked={si}
                                                                onClick={() => alternar([s.id], !si)}
                                                                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-50"
                                                            >
                                                                <Marca estado={si ? 'si' : 'no'} />
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate text-[15px] text-gray-900">{s.nombre}</span>
                                                                    <span className="block truncate text-sm text-gray-600">
                                                                        {NOMBRE_DEL_TURNO[s.turno] ?? s.turno}
                                                                        {s.laTiene && (s.profesor ? ` · ${s.profesor}` : ' · sin profesor')}
                                                                        {s.laTiene && !si && ' · se quita'}
                                                                        {!s.laTiene && si && ' · se pone'}
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                </section>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 flex shrink-0 gap-3">
                    <button
                        type="button"
                        onClick={alCerrar}
                        className="min-h-[48px] flex-1 rounded-full bg-white px-4 text-sm font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={!cambios || guardar.isPending}
                        className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {cambios ? `Guardar (${cambios})` : 'Guardar'}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function Marca({ estado }: { estado: 'si' | 'no' | 'algunas' }) {
    return (
        <span
            aria-hidden
            className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] ring-1',
                estado === 'no' ? 'bg-white ring-gray-300' : 'bg-indigo-600 text-white ring-indigo-600'
            )}
        >
            {estado === 'si' && <Check className="h-4 w-4" />}
            {estado === 'algunas' && <span className="h-0.5 w-3 rounded-full bg-white" />}
        </span>
    );
}
