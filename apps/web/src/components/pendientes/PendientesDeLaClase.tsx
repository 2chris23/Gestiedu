'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, FileText, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Lista } from '@/components/ui/lista';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import {
    materiasPendientes,
    ESTADO_DE_PENDIENTE,
    fechaCorta,
    textoDeLaOpcion,
    type MateriaPendiente,
    type OpcionDePendiente,
    type PendientesDeLaClase as Datos,
    estadoDeLaCasilla,
} from '@/lib/materias-pendientes';
import { getApiErrorMessage, cn } from '@/lib/utils';
import { esPendiente } from '@/lib/por-enviar';
import { diferido } from '@/components/common/Diferido';

// El plan y los encuentros bajan al abrir su parte (carga diferida).
const PlanDeLaClaseDePendientes = diferido(() => import('./PlanDeLaClaseDePendientes'), { alto: 300 });
const EncuentrosDeLaClaseDePendientes = diferido(() => import('./EncuentrosDeLaClaseDePendientes'), { alto: 300 });

type Vista = 'notas' | 'plan' | 'encuentros' | 'actas';
const VISTAS: Array<{ id: Vista; texto: string }> = [
    { id: 'notas', texto: 'Notas' },
    { id: 'plan', texto: 'Plan de evaluación' },
    { id: 'encuentros', texto: 'Encuentros y asistencia' },
    { id: 'actas', texto: 'Actas' },
];

/**
 * LAS MATERIAS PENDIENTES DE UNA CLASE (la pestaña «Pendientes» de la materia)
 *
 * Cada pendiente se trabaja en una clase: la materia de una sección del grado
 * donde se reprobó, este año; la evalúa su profesor (el admin también). Los
 * alumnos vienen de varias secciones (están un año más arriba): cada uno dice
 * la suya. Cada momento tiene su 1ª y su 2ª opción —el «112» de los liceos—,
 * con las fechas del cronograma del liceo (Configuración → Académica).
 *
 * Si se abre la 2ª opción, si faltar pierde el momento y cómo se aprueba lo
 * dice el liceo; el servidor lo hace cumplir (`materias-pendientes.service`).
 *
 * Como una clase (lo pidió Cristian: «igual que las clases normales, pero
 * distintas»): las notas de cada opción, el plan de cada momento con sus
 * instrumentos, los encuentros (tutorías y evaluaciones) con su asistencia, y
 * las actas de presentación y de calificaciones.
 */
export function PendientesDeLaClase({ claseId }: { claseId: string }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['materias-pendientes', 'clase', claseId],
        queryFn: () => materiasPendientes.deLaClase(claseId),
    });
    const [editando, setEditando] = React.useState<{ p: MateriaPendiente; momento: number; opcion: 1 | 2 } | null>(null);
    const [moviendo, setMoviendo] = React.useState<MateriaPendiente | null>(null);
    const [vista, setVista] = React.useState<Vista>('notas');

    if (isLoading) {
        return (
            <p className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando las materias pendientes…
            </p>
        );
    }
    if (error || !data) return <p className="text-sm text-rose-700">{getApiErrorMessage(error, 'No se pudieron cargar las materias pendientes.')}</p>;

    const { reglas, cronograma } = data;
    const aprobadas = data.pendientes.filter((p) => p.estado === 'APROBADA').length;
    const forma =
        reglas.formaDeCalificar === 'PROMEDIO'
            ? 'por el promedio de los momentos'
            : reglas.formaDeCalificar === 'PONDERADO'
              ? `por el peso de cada momento (${(reglas.pesos ?? []).join(' · ')} %)`
              : `en el momento en que llegan a ${data.minima}`;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">
                            {data.pendientes.length} {data.pendientes.length === 1 ? 'alumno debe' : 'alumnos deben'} {data.clase.materia} de {data.clase.grado}º
                        </span>
                        {data.pendientes.length > 0 && ` · ${aprobadas} ${aprobadas === 1 ? 'aprobada' : 'aprobadas'}`} · se aprueban {forma}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                        {reglas.segundaOpcion === 'NO'
                            ? 'Sin 2ª opción: la 1ª decide cada momento.'
                            : reglas.segundaOpcion === 'SI_REPRUEBA_30'
                              ? '2ª opción si el 30 % o más del grupo reprueba la 1ª (art. 112).'
                              : 'Quien reprueba la 1ª opción tiene la 2ª, una semana después.'}
                        {reglas.faltarPierdeElMomento ? ' Faltar sin justificar cuenta como presentada («IN»).' : ' Faltar no hace perder el momento.'}
                    </p>
                </div>
            </div>

            {/* El cronograma: cuándo es cada momento, con su 1ª y su 2ª opción. */}
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cronograma de los momentos">
                {cronograma.momentos.slice(0, reglas.momentos).map((m) => (
                    <li key={m.numero} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                        <p className="font-semibold text-gray-900">{m.numero}º momento</p>
                        <p className="text-gray-700">
                            1ª: {fechaCorta(m.desde1)} – {fechaCorta(m.hasta1)}
                        </p>
                        {reglas.segundaOpcion !== 'NO' && m.desde2 && m.hasta2 && (
                            <p className="text-gray-700">
                                2ª: {fechaCorta(m.desde2)} – {fechaCorta(m.hasta2)}
                                {reglas.segundaOpcion === 'SI_REPRUEBA_30' && !data.segundaAbierta[m.numero - 1] && <span className="text-gray-600"> (cerrada)</span>}
                            </p>
                        )}
                    </li>
                ))}
            </ol>
            {cronograma.propuesto && (
                <p className="text-xs text-gray-600">Fechas propuestas con el calendario del MPPE; el admin las cambia en Configuración → Académica.</p>
            )}

            {/* Las partes de la clase de pendientes. */}
            <div role="tablist" aria-label="Partes de la clase de pendientes" className="flex flex-wrap gap-1.5 rounded-xl bg-gray-100 p-1">
                {VISTAS.map((v) => (
                    <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={vista === v.id}
                        onClick={() => setVista(v.id)}
                        className={cn(
                            'min-h-[44px] flex-1 rounded-lg px-3 text-sm font-semibold transition-colors',
                            vista === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                        )}
                    >
                        {v.texto}
                    </button>
                ))}
            </div>

            {vista === 'plan' && <PlanDeLaClaseDePendientes datos={data} />}
            {vista === 'encuentros' && <EncuentrosDeLaClaseDePendientes datos={data} />}
            {vista === 'actas' && (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Actas para imprimir">
                    {Array.from({ length: reglas.momentos }, (_, i) => i + 1).map((n) => (
                        <li key={n} className="rounded-xl border border-gray-200 bg-white p-3">
                            <p className="mb-2 text-sm font-semibold text-gray-900">{n}º momento</p>
                            <div className="flex flex-wrap gap-2">
                                <Link
                                    href={`/dashboard/pendientes/presentacion/${encodeURIComponent(claseId)}?momento=${n}`}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                >
                                    <FileText className="h-4 w-4" aria-hidden /> Acta de presentación
                                </Link>
                                <Link
                                    href={`/dashboard/pendientes/acta/${encodeURIComponent(claseId)}?momento=${n}`}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                >
                                    <FileText className="h-4 w-4" aria-hidden /> Acta de calificaciones
                                </Link>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {vista !== 'notas' ? null : data.pendientes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
                    Nadie debe esta materia en esta clase. Las pendientes nacen al cerrar el año anterior.
                </p>
            ) : (
                <ul className="space-y-2.5">
                    {data.pendientes.map((p) => (
                        <FilaDelAlumno
                            key={p.id}
                            p={p}
                            datos={data}
                            alEditar={(momento, opcion) => setEditando({ p, momento, opcion })}
                            alMover={data.otrasClases.length > 0 && !data.ciclo.cerrado ? () => setMoviendo(p) : undefined}
                        />
                    ))}
                </ul>
            )}

            {editando && <VentanaDeLaOpcion {...editando} datos={data} alCerrar={() => setEditando(null)} />}
            {moviendo && <VentanaDeMover p={moviendo} datos={data} alCerrar={() => setMoviendo(null)} />}
        </div>
    );
}

function FilaDelAlumno({
    p,
    datos,
    alEditar,
    alMover,
}: {
    p: MateriaPendiente;
    datos: Datos;
    alEditar: (momento: number, opcion: 1 | 2) => void;
    alMover?: () => void;
}) {
    const estado = ESTADO_DE_PENDIENTE[p.estado];
    const opciones: Array<1 | 2> = datos.reglas.segundaOpcion === 'NO' ? [1] : [1, 2];
    return (
        <li className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{p.alumno.nombre}</p>
                    <p className="text-xs text-gray-600">
                        {p.seccionActual ? `Hoy en ${p.seccionActual}` : 'Sin sección este año'}
                        {p.notaDeOrigen != null ? ` · la reprobó con ${p.notaDeOrigen}` : ''}
                        {p.cicloDeOrigen ? ` (${p.cicloDeOrigen})` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', estado.clase)}>
                        {estado.texto}
                        {p.notaFinal != null ? ` · ${p.notaFinal}` : ''}
                    </span>
                    {alMover && (
                        <button
                            type="button"
                            onClick={alMover}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                        >
                            <ArrowRightLeft className="h-4 w-4" aria-hidden /> Otra clase
                        </button>
                    )}
                </div>
            </div>
            <ol className="mt-2.5 flex flex-wrap gap-2" aria-label={`Momentos de ${p.alumno.nombre}`}>
                {Array.from({ length: datos.reglas.momentos }, (_, i) => i + 1).map((n) => (
                    <li key={n} className="flex items-center gap-1 rounded-xl bg-gray-50 py-1 pl-2.5 pr-1">
                        <span className="text-xs font-bold text-gray-700">{n}º</span>
                        {opciones.map((o) => {
                            const cual = estadoDeLaCasilla(p, datos, n, o);
                            const puesta = p.opciones.find((x) => x.momento === n && x.opcion === o);
                            const texto = puesta ? textoDeLaOpcion(puesta) : '—';
                            const etiqueta = `${p.alumno.nombre}, momento ${n}, ${o}ª opción: ${puesta ? texto : 'sin poner'}`;
                            const color = !puesta
                                ? 'text-gray-500'
                                : puesta.nota != null
                                  ? puesta.nota >= datos.minima
                                      ? 'text-emerald-800'
                                      : 'text-rose-800'
                                  : 'text-amber-900';
                            const editable = datos.puedeEvaluar && !datos.ciclo.cerrado && (cual === 'libre' || cual === 'puesta');
                            return editable ? (
                                <button
                                    key={o}
                                    type="button"
                                    onClick={() => alEditar(n, o)}
                                    aria-label={etiqueta}
                                    className={cn(
                                        'flex min-h-[44px] min-w-[52px] flex-col items-center justify-center rounded-lg border bg-white px-2 text-sm font-bold tabular-nums transition-colors hover:border-indigo-300 hover:bg-indigo-50',
                                        puesta ? 'border-gray-200' : 'border-dashed border-gray-300',
                                        color
                                    )}
                                >
                                    <span className="text-[12px] font-semibold leading-none text-gray-600">{o}ª</span>
                                    {texto}
                                </button>
                            ) : (
                                <span
                                    key={o}
                                    aria-label={etiqueta}
                                    className={cn('flex min-h-[44px] min-w-[52px] flex-col items-center justify-center px-2 text-sm font-bold tabular-nums', color)}
                                >
                                    <span className="text-[12px] font-semibold leading-none text-gray-600">{o}ª</span>
                                    {texto}
                                </span>
                            );
                        })}
                    </li>
                ))}
            </ol>
        </li>
    );
}

function VentanaDeLaOpcion({
    p,
    momento,
    opcion,
    datos,
    alCerrar,
}: {
    p: MateriaPendiente;
    momento: number;
    opcion: 1 | 2;
    datos: Datos;
    alCerrar: () => void;
}) {
    const cola = useQueryClient();
    const hoy = useSchoolToday();
    const puesta: OpcionDePendiente | undefined = p.opciones.find((o) => o.momento === momento && o.opcion === opcion);
    const [nota, setNota] = React.useState(puesta?.nota != null ? String(puesta.nota) : '');
    const [falto, setFalto] = React.useState(puesta ? !puesta.asistio : false);
    const [justificada, setJustificada] = React.useState(puesta?.justificada ?? false);
    const [fecha, setFecha] = React.useState(puesta?.fecha ?? hoy ?? '');
    const [observaciones, setObservaciones] = React.useState(puesta?.observaciones ?? '');
    const recargar = () => void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });

    // Solo se quita la última puesta (como en la clase: van en orden).
    const ultima = [...p.opciones].sort((a, b) => b.momento - a.momento || b.opcion - a.opcion)[0];
    const esLaUltima = !!puesta && ultima?.momento === momento && ultima?.opcion === opcion;

    const n = Number(nota.replace(',', '.'));
    const notaValida = nota.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 20;
    const valido = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (falto || notaValida);

    const guardar = useMutation({
        mutationFn: () =>
            materiasPendientes.ponerOpcion(
                p.id,
                momento,
                opcion,
                {
                    nota: falto ? null : n,
                    asistio: !falto,
                    justificada: falto && justificada,
                    fecha,
                    observaciones: observaciones.trim() || undefined,
                },
                p.alumno.nombre
            ),
        onSuccess: (r) => {
            if (esPendiente(r)) {
                toast('Sin conexión: quedó pendiente ⏱ y se envía sola al volver.', { id: 'pendiente' });
                alCerrar();
                return;
            }
            toast.success(r.estado === 'APROBADA' ? `¡Aprobada con ${r.notaFinal}!` : r.estado === 'NO_APROBADA' ? 'No aprobada' : 'Guardado');
            recargar();
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar')),
    });
    const quitar = useMutation({
        mutationFn: () => materiasPendientes.quitarOpcion(p.id, momento, opcion),
        onSuccess: () => {
            toast.success('Quitada');
            recargar();
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
    });
    const ocupado = guardar.isPending || quitar.isPending;
    const ventana = datos.cronograma.momentos.find((m) => m.numero === momento);

    return (
        <Dialog open onOpenChange={(v) => !v && !ocupado && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {momento}º momento · {opcion}ª opción
                    </DialogTitle>
                    <DialogDescription>
                        {p.alumno.nombre} · {p.materia.nombre} de {p.gradoDeOrigen}º
                        {ventana && (opcion === 1 ? ` · ${fechaCorta(ventana.desde1)}–${fechaCorta(ventana.hasta1)}` : ventana.desde2 && ventana.hasta2 ? ` · ${fechaCorta(ventana.desde2)}–${fechaCorta(ventana.hasta2)}` : '')}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 sm:col-span-2">
                        <Checkbox checked={falto} onCheckedChange={(v) => setFalto(v === true)} aria-label="No se presentó" />
                        No se presentó («IN» en el acta)
                    </label>
                    {falto ? (
                        <label className="flex min-h-[44px] items-center gap-3 text-sm text-gray-800 sm:col-span-2">
                            <Checkbox checked={justificada} onCheckedChange={(v) => setJustificada(v === true)} aria-label="Falta justificada" />
                            La falta está justificada (no cuenta: se le pone otra fecha)
                        </label>
                    ) : (
                        <label className="block text-sm font-medium text-gray-800">
                            Nota (0 a 20)
                            <input
                                autoFocus
                                inputMode="decimal"
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                className={cn(
                                    'mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm tabular-nums',
                                    notaValida && (n >= datos.minima ? 'text-emerald-800' : 'text-rose-800')
                                )}
                            />
                        </label>
                    )}
                    <label className="block text-sm font-medium text-gray-800">
                        Fecha
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm" />
                    </label>
                    <label className="block text-sm font-medium text-gray-800 sm:col-span-2">
                        Observaciones
                        <input
                            value={observaciones}
                            maxLength={300}
                            onChange={(e) => setObservaciones(e.target.value)}
                            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                    {esLaUltima ? (
                        <button
                            type="button"
                            onClick={() => quitar.mutate()}
                            disabled={ocupado}
                            className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                            Quitar
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <button type="button" onClick={alCerrar} disabled={ocupado} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => guardar.mutate()}
                            disabled={!valido || ocupado}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** El admin la pasa a otra clase de la misma materia y grado: la evalúa ese profesor. */
function VentanaDeMover({ p, datos, alCerrar }: { p: MateriaPendiente; datos: Datos; alCerrar: () => void }) {
    const cola = useQueryClient();
    const [claseId, setClaseId] = React.useState(datos.otrasClases[0]?.id ?? '');
    const mover = useMutation({
        mutationFn: () => materiasPendientes.moverDeClase(p.id, claseId),
        onSuccess: () => {
            toast.success('Pasada a la otra clase');
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo pasar')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && !mover.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Pasar a otra clase</DialogTitle>
                    <DialogDescription>
                        {p.alumno.nombre}: {p.materia.nombre} de {p.gradoDeOrigen}º. La evaluará el profesor de la clase que elijas; sus notas se quedan.
                    </DialogDescription>
                </DialogHeader>
                <Lista
                    etiqueta="Clase"
                    valor={claseId}
                    alCambiar={setClaseId}
                    opciones={datos.otrasClases.map((c) => ({ valor: c.id, texto: `${c.seccion}${c.profesor ? ` · ${c.profesor}` : ' · sin profesor'}` }))}
                />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => mover.mutate()}
                        disabled={!claseId || mover.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {mover.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Pasar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default PendientesDeLaClase;
