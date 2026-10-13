'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, Loader2, Pencil, Trash2, UserCheck } from 'lucide-react';
import { Lista } from '@/components/ui/lista';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/useConfirm';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import {
    materiasPendientes,
    fechaCorta,
    type DatosDelEncuentro,
    type EncuentroDePendiente,
    type EstadoDeAsistencia,
    type PendientesDeLaClase,
} from '@/lib/materias-pendientes';
import { getApiErrorMessage, cn } from '@/lib/utils';
import { esPendiente } from '@/lib/por-enviar';

/**
 * LOS ENCUENTROS DE LA CLASE DE PENDIENTES Y SU ASISTENCIA
 *
 * Las tutorías (la «superación pedagógica») y las evaluaciones de cada
 * opción, con fecha, hora y aula. Se pasa lista con los mismos tres botones de
 * siempre; de ahí sale el acta de presentación (la firma de cada uno y «IN» al
 * que faltó). Faltar a la evaluación de una opción la deja como no presentada
 * —justificada, no cuenta—; lo hace el servidor (`plan-de-pendientes.service`).
 */

const ESTADOS: Array<{ id: EstadoDeAsistencia; texto: string; activo: string }> = [
    { id: 'PRESENTE', texto: 'Vino', activo: 'border-emerald-700 bg-emerald-700 text-white' },
    { id: 'AUSENTE', texto: 'Faltó', activo: 'border-rose-700 bg-rose-700 text-white' },
    { id: 'JUSTIFICADO', texto: 'Justificó', activo: 'border-amber-700 bg-amber-700 text-white' },
];

const tipoLegible = (e: Pick<EncuentroDePendiente, 'tipo' | 'opcion'>) => (e.tipo === 'TUTORIA' ? 'Tutoría' : `Evaluación · ${e.opcion}ª opción`);

export default function EncuentrosDeLaClaseDePendientes({ datos }: { datos: PendientesDeLaClase }) {
    const cola = useQueryClient();
    const confirmar = useConfirm();
    const [nuevo, setNuevo] = React.useState(false);
    const [editando, setEditando] = React.useState<EncuentroDePendiente | null>(null);
    const [pasando, setPasando] = React.useState<EncuentroDePendiente | null>(null);
    const editable = datos.puedeEvaluar && !datos.ciclo.cerrado;

    const borrar = useMutation({
        mutationFn: (id: string) => materiasPendientes.borrarEncuentro(id),
        onSuccess: () => {
            toast.success('Encuentro quitado');
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
    });

    const porMomento = Array.from({ length: datos.reglas.momentos }, (_, i) => ({
        momento: i + 1,
        encuentros: datos.encuentros.filter((e) => e.momento === i + 1),
    }));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                    {datos.reglas.asistencia === 'NO'
                        ? 'El liceo no lleva asistencia de las pendientes; los encuentros sirven de agenda.'
                        : datos.reglas.asistencia === 'OBLIGATORIA'
                          ? 'Se pasa lista en las tutorías y en las evaluaciones.'
                          : 'No están obligados a ir a clases: se pasa lista en las evaluaciones (y en las tutorías, si quieres).'}
                </p>
                {editable && (
                    <button
                        type="button"
                        onClick={() => setNuevo(true)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <CalendarPlus className="h-4 w-4" aria-hidden /> Nuevo encuentro
                    </button>
                )}
            </div>

            {porMomento.map(({ momento, encuentros }) => (
                <section key={momento} aria-labelledby={`encuentros-${momento}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                    <h3 id={`encuentros-${momento}`} className="mb-2 font-semibold text-gray-900">
                        {momento}º momento
                    </h3>
                    {encuentros.length === 0 ? (
                        <p className="text-sm text-gray-600">Sin encuentros todavía.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {encuentros.map((e) => {
                                const marcados = Object.values(e.asistencias);
                                const vinieron = marcados.filter((x) => x === 'PRESENTE').length;
                                return (
                                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                        <div className="min-w-0 text-sm">
                                            <p className="font-medium text-gray-900">
                                                {fechaCorta(e.fecha)}
                                                {e.hora ? ` · ${e.hora}` : ''}
                                                {e.aula ? ` · ${e.aula}` : ''}
                                                <span
                                                    className={cn(
                                                        'ml-2 rounded-full px-2 py-0.5 text-xs font-semibold',
                                                        e.tipo === 'TUTORIA' ? 'bg-sky-50 text-sky-900' : 'bg-indigo-50 text-indigo-800'
                                                    )}
                                                >
                                                    {tipoLegible(e)}
                                                </span>
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                {e.tema ? `${e.tema} · ` : ''}
                                                {marcados.length ? `${vinieron} de ${marcados.length} vinieron` : 'Sin lista todavía'}
                                            </p>
                                        </div>
                                        {editable && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setPasando(e)}
                                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    <UserCheck className="h-4 w-4" aria-hidden /> Pasar lista
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Cambiar el encuentro del ${fechaCorta(e.fecha)}`}
                                                    onClick={() => setEditando(e)}
                                                    className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                                                >
                                                    <Pencil className="h-4 w-4" aria-hidden />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Quitar el encuentro del ${fechaCorta(e.fecha)}`}
                                                    disabled={borrar.isPending}
                                                    onClick={async () => {
                                                        if (await confirmar({ title: '¿Quitar el encuentro?', description: 'Se va a la papelera con su lista.' })) borrar.mutate(e.id);
                                                    }}
                                                    className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-rose-50 hover:text-rose-700"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            ))}

            {(nuevo || editando) && (
                <VentanaDelEncuentro
                    datos={datos}
                    encuentro={editando}
                    alCerrar={() => {
                        setNuevo(false);
                        setEditando(null);
                    }}
                />
            )}
            {pasando && <VentanaDeLaLista datos={datos} encuentro={pasando} alCerrar={() => setPasando(null)} />}
        </div>
    );
}

function VentanaDelEncuentro({ datos, encuentro, alCerrar }: { datos: PendientesDeLaClase; encuentro: EncuentroDePendiente | null; alCerrar: () => void }) {
    const cola = useQueryClient();
    const hoy = useSchoolToday();
    const [d, setD] = React.useState({
        momento: String(encuentro?.momento ?? 1),
        tipo: encuentro?.tipo ?? 'TUTORIA',
        opcion: String(encuentro?.opcion ?? 1),
        fecha: encuentro?.fecha ?? hoy ?? '',
        hora: encuentro?.hora ?? '',
        aula: encuentro?.aula ?? '',
        tema: encuentro?.tema ?? '',
    });
    const valido = /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) && (!d.hora || /^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora));
    const guardar = useMutation({
        mutationFn: () => {
            const datosDelEncuentro: DatosDelEncuentro = {
                momento: Number(d.momento),
                tipo: d.tipo as DatosDelEncuentro['tipo'],
                opcion: d.tipo === 'EVALUACION' ? (Number(d.opcion) as 1 | 2) : null,
                fecha: d.fecha,
                hora: d.hora || null,
                aula: d.aula.trim() || null,
                tema: d.tema.trim() || null,
            };
            return encuentro ? materiasPendientes.editarEncuentro(encuentro.id, datosDelEncuentro) : materiasPendientes.crearEncuentro(datos.clase.id, datosDelEncuentro);
        },
        onSuccess: () => {
            toast.success(encuentro ? 'Encuentro cambiado' : 'Encuentro creado');
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar')),
    });
    const campo = 'mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm';
    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{encuentro ? 'Cambiar el encuentro' : 'Nuevo encuentro'}</DialogTitle>
                    <DialogDescription>Una tutoría o la evaluación de una opción, con su fecha, hora y aula.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="text-sm font-medium text-gray-800">
                        <span className="mb-1 block">Momento</span>
                        <Lista
                            etiqueta="Momento"
                            valor={d.momento}
                            alCambiar={(v) => setD({ ...d, momento: v })}
                            opciones={Array.from({ length: datos.reglas.momentos }, (_, i) => ({ valor: String(i + 1), texto: `${i + 1}º momento` }))}
                        />
                    </div>
                    <div className="text-sm font-medium text-gray-800">
                        <span className="mb-1 block">Qué es</span>
                        <Lista
                            etiqueta="Qué es"
                            valor={d.tipo === 'TUTORIA' ? 'TUTORIA' : `EVALUACION-${d.opcion}`}
                            alCambiar={(v) => setD(v === 'TUTORIA' ? { ...d, tipo: 'TUTORIA' } : { ...d, tipo: 'EVALUACION', opcion: v.slice(-1) })}
                            opciones={[
                                { valor: 'TUTORIA', texto: 'Tutoría' },
                                { valor: 'EVALUACION-1', texto: 'Evaluación de la 1ª opción' },
                                ...(datos.reglas.segundaOpcion !== 'NO' ? [{ valor: 'EVALUACION-2', texto: 'Evaluación de la 2ª opción' }] : []),
                            ]}
                        />
                    </div>
                    <label className="text-sm font-medium text-gray-800">
                        Fecha
                        <input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} className={campo} />
                    </label>
                    <label className="text-sm font-medium text-gray-800">
                        Hora
                        <input type="time" value={d.hora} onChange={(e) => setD({ ...d, hora: e.target.value })} className={campo} />
                    </label>
                    <label className="text-sm font-medium text-gray-800">
                        Aula
                        <input value={d.aula} maxLength={60} onChange={(e) => setD({ ...d, aula: e.target.value })} className={campo} />
                    </label>
                    <label className="text-sm font-medium text-gray-800">
                        Tema
                        <input value={d.tema} maxLength={200} onChange={(e) => setD({ ...d, tema: e.target.value })} className={campo} />
                    </label>
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={!valido || guardar.isPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** La lista de un encuentro: todos los alumnos de la clase, de un toque cada uno. */
function VentanaDeLaLista({ datos, encuentro, alCerrar }: { datos: PendientesDeLaClase; encuentro: EncuentroDePendiente; alCerrar: () => void }) {
    const cola = useQueryClient();
    // Quien no tiene marca sale «vino», como en la clase en vivo.
    const [lista, setLista] = React.useState<Record<string, EstadoDeAsistencia>>(() =>
        Object.fromEntries(datos.pendientes.map((p) => [p.id, encuentro.asistencias[p.id] ?? 'PRESENTE']))
    );
    const guardar = useMutation({
        mutationFn: () =>
            materiasPendientes.pasarAsistencia(
                encuentro.id,
                Object.entries(lista).map(([materiaPendienteId, estado]) => ({ materiaPendienteId, estado })),
                `Lista de pendientes · ${tipoLegible(encuentro)} del ${fechaCorta(encuentro.fecha)}`
            ),
        onSuccess: (r) => {
            if (esPendiente(r)) {
                toast('Sin conexión: quedó pendiente ⏱ y se envía sola al volver.', { id: 'pendiente' });
                alCerrar();
                return;
            }
            toast.success('Lista guardada');
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la lista')),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Pasar lista</DialogTitle>
                    <DialogDescription>
                        {tipoLegible(encuentro)} · {fechaCorta(encuentro.fecha)}
                        {encuentro.hora ? ` · ${encuentro.hora}` : ''}
                        {encuentro.tipo === 'EVALUACION' ? ' · quien falta queda «IN» en esa opción' : ''}
                    </DialogDescription>
                </DialogHeader>
                <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
                    {datos.pendientes.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0 text-sm">
                                <p className="truncate font-medium text-gray-900">{p.alumno.nombre}</p>
                                <p className="text-xs text-gray-600">{p.seccionActual ?? ''}</p>
                            </div>
                            <div className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${p.alumno.nombre}`}>
                                {ESTADOS.map((e) => (
                                    <button
                                        key={e.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={lista[p.id] === e.id}
                                        onClick={() => setLista((l) => ({ ...l, [p.id]: e.id }))}
                                        className={cn(
                                            'min-h-[44px] rounded-lg border px-3 text-sm font-semibold',
                                            lista[p.id] === e.id ? e.activo : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                                        )}
                                    >
                                        {e.texto}
                                    </button>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => guardar.mutate()}
                        disabled={guardar.isPending || datos.pendientes.length === 0}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar la lista
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
