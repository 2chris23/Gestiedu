'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { finDeAno, condicionLegible, type Condicion, type EstadoDelFinDeAno, type Expediente } from '@/lib/fin-de-ano';
import { getApiErrorMessage } from '@/lib/utils';
import { Lista } from '@/components/ui/lista';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * PASO 6 — COLOCAR Y CERRAR, Y CORREGIR DESPUÉS
 *
 * Antes de cerrar: la pantalla de colocar a cada alumno en su sección y
 * cerrar (la de siempre). Después: la lista de expedientes, y «Corregir» la
 * decisión de un alumno con motivo (se rehacen su expediente, su matrícula y
 * sus materias pendientes).
 */
export default function PasoCerrar({ estado }: { estado: EstadoDelFinDeAno }) {
    if (!estado.cerrado) {
        return (
            <div className="space-y-3 text-sm text-gray-800">
                <p>
                    Se coloca a cada alumno en su sección del año siguiente (a mano o con una estrategia) y se cierra: se escriben
                    los expedientes, las matrículas y las materias pendientes, y se marca a los que egresan.
                </p>
                {estado.anoSiguiente ? (
                    <Link
                        href={`/dashboard/academico/${estado.ciclo.nombre}/promocion`}
                        className="inline-flex min-h-[44px] items-center rounded-lg bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700"
                    >
                        Colocar a los alumnos y cerrar
                    </Link>
                ) : (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900">Primero, el año siguiente (paso 5).</p>
                )}
            </div>
        );
    }
    return <Expedientes cicloId={estado.ciclo.id} />;
}

function Expedientes({ cicloId }: { cicloId: string }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['fin-de-ano', cicloId, 'expedientes'],
        queryFn: () => finDeAno.expedientes(cicloId),
    });
    const [buscar, setBuscar] = React.useState('');
    const [corrigiendo, setCorrigiendo] = React.useState<Expediente | null>(null);

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando los expedientes…
            </p>
        );
    }
    if (error || !data) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar.')}</p>;

    const texto = buscar.trim().toLowerCase();
    const lista = data.expedientes.filter((e) => !texto || e.alumno.nombre.toLowerCase().includes(texto) || e.alumno.id.toLowerCase().includes(texto));

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-700">El año está cerrado. Si una decisión quedó mal, se corrige con su motivo.</p>
            <label className="relative block max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
                <input
                    aria-label="Buscar alumno"
                    placeholder="Buscar por nombre o cédula"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm"
                />
            </label>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {lista.slice(0, 60).map((e) => (
                    <li key={e.alumno.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{e.alumno.nombre}</p>
                            <p className="text-xs text-gray-600">
                                {e.seccion} ·{' '}
                                {e.retirado ? 'Retirado' : e.egreso === 'EGRESADO' ? 'Egresó' : e.egreso === 'PENDIENTE' ? 'Egreso pendiente' : condicionLegible(e.condicion)}
                                {e.destino?.nombre ? ` → ${e.destino.nombre}` : ''}
                                {e.sugerida && e.sugerida !== e.condicion ? ` · sugerida: ${condicionLegible(e.sugerida)}` : ''}
                            </p>
                            {e.motivo && <p className="text-xs italic text-gray-700">«{e.motivo}»{e.corregidoEl ? ' (corregido)' : ''}</p>}
                        </div>
                        {!e.retirado && (
                            <button
                                type="button"
                                onClick={() => setCorrigiendo(e)}
                                className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                                Corregir
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {lista.length > 60 && <p className="text-xs text-gray-600">Mostrando 60 de {lista.length}: busca por nombre para ver los demás.</p>}
            {corrigiendo && (
                <VentanaDeCorreccion
                    cicloId={cicloId}
                    expediente={corrigiendo}
                    secciones={data.anoSiguiente?.secciones ?? []}
                    alCerrar={() => setCorrigiendo(null)}
                />
            )}
        </div>
    );
}

function VentanaDeCorreccion({
    cicloId,
    expediente,
    secciones,
    alCerrar,
}: {
    cicloId: string;
    expediente: Expediente;
    secciones: Array<{ id: string; name: string; grade: number }>;
    alCerrar: () => void;
}) {
    const cola = useQueryClient();
    const [condicion, setCondicion] = React.useState<Condicion>(expediente.condicion);
    const [motivo, setMotivo] = React.useState('');
    const grado = expediente.grado ?? 0;
    const destinoGrado = condicion === 'NO_PROMOVIDO' ? grado : grado + 1;
    const posibles = secciones.filter((s) => s.grade === destinoGrado);
    const [destino, setDestino] = React.useState<string>('');
    const guardar = useMutation({
        mutationFn: () => finDeAno.corregir(cicloId, expediente.alumno.id, { condicion, motivo: motivo.trim(), destinoClassroomId: destino || null }),
        onSuccess: () => {
            toast.success('Corregido: expediente, matrícula y pendientes rehechos');
            void cola.invalidateQueries({ queryKey: ['fin-de-ano', cicloId] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo corregir')),
    });

    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Corregir a {expediente.alumno.nombre}</DialogTitle>
                    <DialogDescription>
                        Se rehacen su expediente, su matrícula del año siguiente y sus materias pendientes (las ya evaluadas se quedan).
                        Queda anotado quién, cuándo y por qué.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Lista
                        etiqueta="Condición"
                        valor={condicion}
                        alCambiar={(v) => {
                            setCondicion(v as Condicion);
                            setDestino('');
                        }}
                        opciones={(['PROMOVIDO', 'PROMOVIDO_CON_PENDIENTES', 'NO_PROMOVIDO'] as Condicion[]).map((c) => ({ valor: c, texto: condicionLegible(c) }))}
                    />
                    {posibles.length > 0 && (
                        <Lista
                            etiqueta="Sección de destino"
                            valor={destino || '__auto'}
                            alCambiar={(v) => setDestino(v === '__auto' ? '' : v)}
                            opciones={[{ valor: '__auto', texto: 'La de su misma letra' }, ...posibles.map((s) => ({ valor: s.id, texto: s.name }))]}
                        />
                    )}
                    <textarea
                        aria-label="Motivo de la corrección"
                        placeholder="Motivo (obligatorio)"
                        value={motivo}
                        maxLength={500}
                        onChange={(e) => setMotivo(e.target.value)}
                        className="min-h-[88px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={guardar.isPending || motivo.trim().length < 5}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Corregir
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
