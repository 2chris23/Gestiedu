'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { diferido } from '@/components/common/Diferido';
import { useConfirm } from '@/hooks/useConfirm';
import { materiasPendientes, estadoDeLaCasilla, type EvaluacionDelPlan, type MateriaPendiente, type PendientesDeLaClase } from '@/lib/materias-pendientes';
import { NIVELES_POR_DEFECTO, maximoDelInstrumento, notaDelInstrumento, type Instrumento, type Marcas } from '@/lib/instrumentos';
import { NOMBRE_DEL_TIPO } from '@/components/evaluation/nombres-de-instrumentos';
import { getApiErrorMessage, cn } from '@/lib/utils';
import { esPendiente } from '@/lib/por-enviar';

const EditorDeInstrumento = diferido(() => import('@/components/evaluation/EditorDeInstrumento'), { sinEsqueleto: true });

/**
 * EL PLAN DE LA CLASE DE PENDIENTES, MOMENTO A MOMENTO
 *
 * Qué se evalúa en cada momento, cuánto pesa (suman 100 %), qué contenidos
 * entran y con qué instrumento (los mismos de la clase: lista de cotejo,
 * escala, rúbrica, por puntos). Debajo, las notas de cada alumno: con todas
 * las del momento, la nota de su opción sale sola (`plan-de-pendientes.service`).
 * Sin plan, la nota de cada opción se pone a mano en «Notas»: cada profesor
 * trabaja a su manera.
 */

interface Borrador {
    id?: string;
    clave: string;
    nombre: string;
    peso: string;
    contenidos: string;
    instrumento: Instrumento | null;
}

let siguiente = 0;
const nuevaClave = () => `b${Date.now().toString(36)}${(siguiente++).toString(36)}`;
const comoBorrador = (e: EvaluacionDelPlan): Borrador => ({
    id: e.id,
    clave: e.id,
    nombre: e.nombre,
    peso: String(e.peso),
    contenidos: e.contenidos ?? '',
    instrumento: e.instrumento ?? null,
});

export default function PlanDeLaClaseDePendientes({ datos }: { datos: PendientesDeLaClase }) {
    const cola = useQueryClient();
    const confirmar = useConfirm();
    const [momento, setMomento] = React.useState(1);
    const delMomento = React.useMemo(() => datos.plan.filter((e) => e.momento === momento), [datos.plan, momento]);
    const [borrador, setBorrador] = React.useState<Borrador[]>(() => delMomento.map(comoBorrador));
    const [instrumentoDe, setInstrumentoDe] = React.useState<string | null>(null);
    const [calificando, setCalificando] = React.useState<{ p: MateriaPendiente; ev: EvaluacionDelPlan; opcion: 1 | 2 } | null>(null);
    const editable = datos.puedeEvaluar && !datos.ciclo.cerrado;

    // Al cambiar de momento (o al volver del servidor), el borrador es lo guardado.
    React.useEffect(() => setBorrador(delMomento.map(comoBorrador)), [delMomento]);

    const suma = borrador.reduce((s, b) => s + (Number(b.peso) || 0), 0);
    const valido = borrador.length === 0 || (suma === 100 && borrador.every((b) => b.nombre.trim() && Number(b.peso) >= 1));
    const cambio = (clave: string, c: Partial<Borrador>) => setBorrador((bs) => bs.map((b) => (b.clave === clave ? { ...b, ...c } : b)));

    const guardar = useMutation({
        mutationFn: (confirmado: boolean) =>
            materiasPendientes.guardarPlan(
                datos.clase.id,
                momento,
                borrador.map((b) => ({ id: b.id, nombre: b.nombre.trim(), peso: Number(b.peso), contenidos: b.contenidos.trim() || null, instrumento: b.instrumento })),
                confirmado
            ),
        onSuccess: (r) => {
            if (esPendiente(r)) {
                toast('Sin conexión: quedó pendiente ⏱ y se envía sola al volver.', { id: 'pendiente' });
                return;
            }
            toast.success(`Plan del ${momento}º momento guardado`);
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
        },
        onError: async (e: any) => {
            if (e?.response?.data?.code === 'EVALUACION_CON_NOTAS') {
                const si = await confirmar({ title: '¿Quitar la evaluación con sus notas?', description: `${getApiErrorMessage(e, '')} Las notas van a la papelera.` });
                if (si) guardar.mutate(true);
                return;
            }
            toast.error(getApiErrorMessage(e, 'No se pudo guardar el plan'));
        },
    });

    const conPlan = delMomento.length > 0;
    const alumnos = datos.pendientes;

    return (
        <div className="space-y-5">
            <div role="radiogroup" aria-label="Momento" className="flex flex-wrap gap-2">
                {Array.from({ length: datos.reglas.momentos }, (_, i) => i + 1).map((n) => (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={momento === n}
                        onClick={() => setMomento(n)}
                        className={cn(
                            'min-h-[44px] rounded-lg border px-4 text-sm font-semibold',
                            momento === n ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        )}
                    >
                        {n}º momento
                    </button>
                ))}
            </div>

            <section aria-labelledby="plan-del-momento" className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 id="plan-del-momento" className="flex items-center gap-2 font-semibold text-gray-900">
                        <ClipboardList className="h-5 w-5 text-indigo-600" aria-hidden /> Plan del {momento}º momento
                    </h3>
                    <span className={cn('text-sm font-semibold tabular-nums', borrador.length === 0 ? 'text-gray-600' : suma === 100 ? 'text-emerald-700' : 'text-amber-800')}>
                        {borrador.length === 0 ? 'Sin plan: la nota va a mano' : `Suman ${suma} %`}
                    </span>
                </div>
                {borrador.length === 0 && (
                    <p className="mb-3 text-sm text-gray-600">
                        Sin evaluaciones, la nota de cada opción se pone a mano en «Notas». Con plan, sale sola de sus evaluaciones.
                    </p>
                )}
                <ul className="space-y-3">
                    {borrador.map((b, i) => (
                        <li key={b.clave} className="rounded-xl border border-gray-200 p-3">
                            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
                                <label className="text-xs font-medium text-gray-700">
                                    Evaluación
                                    <input
                                        value={b.nombre}
                                        maxLength={120}
                                        disabled={!editable}
                                        placeholder={i === 0 ? 'Prueba escrita' : 'Guía de ejercicios'}
                                        onChange={(e) => cambio(b.clave, { nombre: e.target.value })}
                                        className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm"
                                    />
                                </label>
                                <label className="text-xs font-medium text-gray-700">
                                    Peso (%)
                                    <input
                                        inputMode="numeric"
                                        value={b.peso}
                                        disabled={!editable}
                                        onChange={(e) => cambio(b.clave, { peso: e.target.value.replace(/[^\d]/g, '') })}
                                        className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-right text-sm tabular-nums"
                                    />
                                </label>
                                <div className="flex items-end gap-1">
                                    <button
                                        type="button"
                                        disabled={!editable}
                                        onClick={() => setInstrumentoDe(b.clave)}
                                        className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                                    >
                                        {b.instrumento ? `${NOMBRE_DEL_TIPO[b.instrumento.tipo as keyof typeof NOMBRE_DEL_TIPO]} (${maximoDelInstrumento(b.instrumento)} pts)` : 'Instrumento'}
                                    </button>
                                    {editable && (
                                        <button
                                            type="button"
                                            aria-label={`Quitar ${b.nombre || 'la evaluación'}`}
                                            onClick={() => setBorrador((bs) => bs.filter((x) => x.clave !== b.clave))}
                                            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-700"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <label className="mt-2 block text-xs font-medium text-gray-700">
                                Contenidos
                                <textarea
                                    value={b.contenidos}
                                    maxLength={2000}
                                    rows={2}
                                    disabled={!editable}
                                    onChange={(e) => cambio(b.clave, { contenidos: e.target.value })}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                            </label>
                        </li>
                    ))}
                </ul>
                {editable && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                            type="button"
                            disabled={borrador.length >= 10}
                            onClick={() =>
                                setBorrador((bs) => [...bs, { clave: nuevaClave(), nombre: '', peso: String(Math.max(0, 100 - suma)), contenidos: '', instrumento: null }])
                            }
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" aria-hidden /> Añadir evaluación
                        </button>
                        <button
                            type="button"
                            onClick={() => guardar.mutate(false)}
                            disabled={!valido || guardar.isPending}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar el plan
                        </button>
                    </div>
                )}
            </section>

            {conPlan && alumnos.length > 0 && (
                <section aria-labelledby="notas-del-plan" className="space-y-2.5">
                    <h3 id="notas-del-plan" className="font-semibold text-gray-900">
                        Notas del {momento}º momento
                    </h3>
                    <ul className="space-y-2.5">
                        {alumnos.map((p) => (
                            <FilaDeNotas key={p.id} p={p} datos={datos} momento={momento} evaluaciones={delMomento} alCalificar={(ev, opcion) => setCalificando({ p, ev, opcion })} />
                        ))}
                    </ul>
                </section>
            )}

            {instrumentoDe && (
                <EditorDeInstrumento
                    rowId=""
                    titulo={borrador.find((b) => b.clave === instrumentoDe)?.nombre || 'Evaluación'}
                    abierto
                    alCerrar={() => setInstrumentoDe(null)}
                    local={{
                        inicial: borrador.find((b) => b.clave === instrumentoDe)?.instrumento ?? null,
                        alGuardar: (definicion) => cambio(instrumentoDe, { instrumento: definicion }),
                    }}
                />
            )}
            {calificando && <VentanaDeLaNota {...calificando} datos={datos} alCerrar={() => setCalificando(null)} />}
        </div>
    );
}

function FilaDeNotas({
    p,
    datos,
    momento,
    evaluaciones,
    alCalificar,
}: {
    p: MateriaPendiente;
    datos: PendientesDeLaClase;
    momento: number;
    evaluaciones: EvaluacionDelPlan[];
    alCalificar: (ev: EvaluacionDelPlan, opcion: 1 | 2) => void;
}) {
    const opciones: Array<1 | 2> = datos.reglas.segundaOpcion === 'NO' ? [1] : [1, 2];
    // Si no hay nada que calificar en este momento, se dice por qué (y no queda una tarjeta vacía).
    const algo = opciones.some(
        (o) =>
            (datos.puedeEvaluar && !datos.ciclo.cerrado && estadoDeLaCasilla(p, datos, momento, o) !== 'cerrada') ||
            datos.notasDelPlan.some((n) => n.materiaPendienteId === p.id && n.opcion === o && evaluaciones.some((e) => e.id === n.evaluacionId))
    );
    if (!algo) {
        const porque =
            p.estado === 'APROBADA'
                ? `Ya la aprobó${p.notaFinal != null ? ` con ${p.notaFinal}` : ''}.`
                : p.estado === 'NO_APROBADA'
                  ? 'No la aprobó en ningún momento.'
                  : p.momentos.some((m) => m.momento === momento)
                    ? 'Este momento ya está decidido.'
                    : 'Este momento se abre cuando se cierre el anterior.';
        return (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5">
                <p className="font-semibold text-gray-900">{p.alumno.nombre}</p>
                <p className="text-sm text-gray-600">{porque}</p>
            </li>
        );
    }
    return (
        <li className="rounded-2xl border border-gray-200 bg-white p-3.5">
            <p className="font-semibold text-gray-900">{p.alumno.nombre}</p>
            {opciones.map((opcion) => {
                const cual = estadoDeLaCasilla(p, datos, momento, opcion);
                // Se califica con la opción abierta (o ya puesta); la 2ª, solo si se abrió.
                const puedeCalificar = datos.puedeEvaluar && !datos.ciclo.cerrado && cual !== 'cerrada';
                const tieneNotas = datos.notasDelPlan.some((n) => n.materiaPendienteId === p.id && n.opcion === opcion);
                if (!puedeCalificar && !tieneNotas) return null;
                const resultado = p.opciones.find((o) => o.momento === momento && o.opcion === opcion);
                return (
                    <div key={opcion} className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="w-16 text-xs font-bold text-gray-700">{opcion}ª opción</span>
                        {evaluaciones.map((ev) => {
                            const n = datos.notasDelPlan.find((x) => x.evaluacionId === ev.id && x.materiaPendienteId === p.id && x.opcion === opcion);
                            const texto = n ? String(n.nota).replace('.', ',') : '—';
                            return puedeCalificar ? (
                                <button
                                    key={ev.id}
                                    type="button"
                                    onClick={() => alCalificar(ev, opcion)}
                                    aria-label={`${p.alumno.nombre}: ${ev.nombre}, ${opcion}ª opción: ${n ? texto : 'sin nota'}`}
                                    className={cn(
                                        'flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-white px-2.5 text-sm hover:border-indigo-300 hover:bg-indigo-50',
                                        n ? 'border-gray-200' : 'border-dashed border-gray-300'
                                    )}
                                >
                                    <span className="text-xs text-gray-600">
                                        {ev.nombre} ({ev.peso} %)
                                    </span>
                                    <span className={cn('font-bold tabular-nums', n ? (n.nota >= datos.minima ? 'text-emerald-800' : 'text-rose-800') : 'text-gray-500')}>{texto}</span>
                                </button>
                            ) : (
                                <span key={ev.id} className="flex min-h-[44px] items-center gap-1.5 px-2.5 text-sm">
                                    <span className="text-xs text-gray-600">{ev.nombre}</span>
                                    <span className="font-bold tabular-nums text-gray-800">{texto}</span>
                                </span>
                            );
                        })}
                        <span className="ml-auto text-sm text-gray-700">
                            Nota de la opción:{' '}
                            <strong className="tabular-nums">{resultado ? (resultado.nota != null ? String(resultado.nota).replace('.', ',') : 'IN') : '—'}</strong>
                        </span>
                    </div>
                );
            })}
        </li>
    );
}

function VentanaDeLaNota({
    p,
    ev,
    opcion,
    datos,
    alCerrar,
}: {
    p: MateriaPendiente;
    ev: EvaluacionDelPlan;
    opcion: 1 | 2;
    datos: PendientesDeLaClase;
    alCerrar: () => void;
}) {
    const cola = useQueryClient();
    const puesta = datos.notasDelPlan.find((x) => x.evaluacionId === ev.id && x.materiaPendienteId === p.id && x.opcion === opcion);
    const instrumento = ev.instrumento as Instrumento | null;
    const [nota, setNota] = React.useState(puesta ? String(puesta.nota) : '');
    const [marcas, setMarcas] = React.useState<Marcas>((puesta?.desglose as Marcas) ?? {});

    let calculada: number | null = null;
    let problema: string | null = null;
    if (instrumento) {
        try {
            const cruda = notaDelInstrumento(instrumento, marcas);
            const maximo = maximoDelInstrumento(instrumento);
            calculada = cruda == null ? null : Math.round((maximo > 0 ? (cruda / maximo) * 20 : 0) * 100) / 100;
        } catch (e: any) {
            problema = e?.message ?? 'Revisa lo marcado';
        }
    }
    const n = Number(nota.replace(',', '.'));
    const valido = instrumento ? calculada != null && !problema : nota.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 20;

    const guardar = useMutation({
        mutationFn: (quitar: boolean) =>
            materiasPendientes.ponerNotaDelPlan(p.id, ev.id, opcion, quitar ? { nota: null } : instrumento ? { marcas } : { nota: n }, p.alumno.nombre),
        onSuccess: (r) => {
            if (esPendiente(r)) {
                toast('Sin conexión: quedó pendiente ⏱ y se envía sola al volver.', { id: 'pendiente' });
                alCerrar();
                return;
            }
            toast.success(r.estado === 'APROBADA' ? `¡Aprobada con ${r.notaFinal}!` : 'Nota guardada');
            void cola.invalidateQueries({ queryKey: ['materias-pendientes'] });
            alCerrar();
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar la nota')),
    });

    return (
        <Dialog open onOpenChange={(v) => !v && !guardar.isPending && alCerrar()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {ev.nombre} · {opcion}ª opción
                    </DialogTitle>
                    <DialogDescription>
                        {p.alumno.nombre} · {ev.momento}º momento · pesa {ev.peso} %
                    </DialogDescription>
                </DialogHeader>
                {instrumento ? (
                    <div className="space-y-2">
                        {instrumento.criterios.map((c) => {
                            const porPuntos = instrumento.tipo === 'COTEJO' || instrumento.tipo === 'PUNTOS';
                            const valor = marcas[c.id];
                            return (
                                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                                    <div className="min-w-0 text-sm">
                                        <p className="font-medium text-gray-900">{c.texto}</p>
                                        {c.descripcion && <p className="text-xs text-gray-600">{c.descripcion}</p>}
                                    </div>
                                    {porPuntos ? (
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                inputMode="decimal"
                                                aria-label={`${c.texto}, de 0 a ${c.puntos}`}
                                                value={valor == null || typeof valor === 'boolean' ? (valor === true ? String(c.puntos) : '') : String(valor)}
                                                onChange={(e) => {
                                                    const t = e.target.value.replace(',', '.');
                                                    setMarcas((m) => ({ ...m, [c.id]: t === '' ? null : Number(t) }));
                                                }}
                                                className="min-h-[44px] w-20 rounded-lg border border-gray-300 px-2 text-right tabular-nums"
                                            />
                                            de {c.puntos}
                                        </label>
                                    ) : (
                                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={c.texto}>
                                            {(instrumento.niveles ?? NIVELES_POR_DEFECTO).map((nv) => (
                                                <button
                                                    key={nv.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={valor === nv.id}
                                                    title={nv.nombre}
                                                    onClick={() => setMarcas((m) => ({ ...m, [c.id]: nv.id }))}
                                                    className={cn(
                                                        'min-h-[44px] min-w-[44px] rounded-lg border px-2 text-sm font-semibold',
                                                        valor === nv.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800'
                                                    )}
                                                >
                                                    {nv.id}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <p className={cn('rounded-lg px-3 py-2 text-sm', problema ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-800')} role="status">
                            {problema ?? (calculada == null ? 'Falta marcar criterios.' : `Nota: ${String(calculada).replace('.', ',')} de 20`)}
                        </p>
                    </div>
                ) : (
                    <label className="block text-sm font-medium text-gray-800">
                        Nota (0 a 20)
                        <input
                            autoFocus
                            inputMode="decimal"
                            value={nota}
                            onChange={(e) => setNota(e.target.value)}
                            className="mt-1 min-h-[44px] w-full rounded-lg border border-gray-300 px-3 text-sm tabular-nums"
                        />
                    </label>
                )}
                <div className="flex flex-wrap justify-between gap-2">
                    {puesta ? (
                        <button
                            type="button"
                            onClick={() => guardar.mutate(true)}
                            disabled={guardar.isPending}
                            className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                            Quitar la nota
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => guardar.mutate(false)}
                            disabled={!valido || guardar.isPending}
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
