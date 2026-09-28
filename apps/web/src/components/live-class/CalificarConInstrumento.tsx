'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Check, ClipboardList, Loader2 } from 'lucide-react';
import { useCalificarConInstrumento } from '@/hooks/useInstrumentos';
import { NIVELES_POR_DEFECTO, maximoDelInstrumento, notaDelInstrumento, type Instrumento, type Marcas } from '@/lib/instrumentos';
import { NOMBRE_DEL_TIPO } from '@/components/evaluation/nombres-de-instrumentos';
import { getApiErrorMessage, cn } from '@/lib/utils';

/**
 * CALIFICAR MARCANDO EL INSTRUMENTO
 *
 * Una tarjeta por alumno con los criterios del instrumento de la evaluación
 * del plan: en la lista de cotejo, sí/no; en la escala y la rúbrica, el nivel;
 * por puntos, cuántos. La nota sale sola y se guarda sola, en tandas (lo que
 * se marca seguido va en UNA petición), como la asistencia.
 */

type Alumno = { id: string; firstName: string; lastName: string };
type Detalle = Record<string, { marcas: Marcas; total: number | null }>;

const ESPERA_MS = 700;

export default function CalificarConInstrumento({
    activityId,
    instrumento,
    detalle,
    alumnos,
    puedeEditar,
}: {
    activityId: string;
    instrumento: Instrumento;
    detalle: Detalle | null | undefined;
    alumnos: Alumno[];
    puedeEditar: boolean;
}) {
    const calificar = useCalificarConInstrumento();
    const [marcas, setMarcas] = React.useState<Record<string, Marcas>>(() =>
        Object.fromEntries(Object.entries(detalle ?? {}).map(([id, d]) => [id, d.marcas ?? {}]))
    );
    const [guardadoA, setGuardadoA] = React.useState<string | null>(null);
    const pendientes = React.useRef<Record<string, Marcas | null>>({});
    const reloj = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const maximo = maximoDelInstrumento(instrumento);
    const niveles = instrumento.niveles ?? NIVELES_POR_DEFECTO;

    // `mutate` cambia en cada pintada: por referencia, para que la limpieza de
    // abajo no mande la tanda antes de tiempo.
    const mutar = React.useRef(calificar.mutate);
    React.useEffect(() => {
        mutar.current = calificar.mutate;
    });
    const enviar = React.useCallback(() => {
        const tanda = pendientes.current;
        pendientes.current = {};
        if (Object.keys(tanda).length === 0) return;
        mutar.current(
            { activityId, marcas: tanda },
            {
                onSuccess: () => setGuardadoA(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })),
                onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudieron guardar las marcas')),
            }
        );
    }, [activityId]);

    // Lo que quedara por mandar al salir, se manda.
    React.useEffect(
        () => () => {
            if (reloj.current) clearTimeout(reloj.current);
            enviar();
        },
        [enviar]
    );

    const marcar = (alumno: string, nuevas: Marcas | null) => {
        setMarcas((m) => {
            const copia = { ...m };
            if (nuevas === null) delete copia[alumno];
            else copia[alumno] = nuevas;
            return copia;
        });
        pendientes.current[alumno] = nuevas;
        if (reloj.current) clearTimeout(reloj.current);
        reloj.current = setTimeout(enviar, ESPERA_MS);
    };

    const notaDe = (m: Marcas | undefined) => {
        if (!m) return null;
        try {
            return notaDelInstrumento(instrumento, m);
        } catch {
            return null;
        }
    };

    return (
        <section className="space-y-3" aria-label="Calificar con el instrumento">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" aria-hidden />
                    {NOMBRE_DEL_TIPO[instrumento.tipo]} · vale {maximo}
                </span>
                <span className="text-xs" role="status">
                    {calificar.isPending ? (
                        <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Guardando…
                        </span>
                    ) : guardadoA ? (
                        `Guardado ${guardadoA}`
                    ) : (
                        'Se guarda solo'
                    )}
                </span>
            </div>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {alumnos.map((a) => {
                    const suyas = marcas[a.id];
                    const nota = notaDe(suyas);
                    const nombre = `${a.lastName}, ${a.firstName}`;
                    return (
                        <li key={a.id} className="space-y-2 rounded-xl border border-gray-200 bg-white p-3" aria-label={nombre}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{nombre}</p>
                                <span className={cn('shrink-0 rounded-lg px-2 py-1 text-sm font-bold tabular-nums', nota === null ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-800')}>
                                    {nota === null ? (suyas ? 'Incompleto' : 'Sin nota') : `${nota} / ${maximo}`}
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {instrumento.criterios.map((c) => {
                                    const valor = suyas?.[c.id];
                                    const cambiar = (v: boolean | string | number | null) => marcar(a.id, { ...(suyas ?? {}), [c.id]: v });
                                    if (instrumento.tipo === 'COTEJO') {
                                        const si = valor === true;
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                disabled={!puedeEditar}
                                                aria-pressed={si}
                                                onClick={() => cambiar(!si)}
                                                className={cn(
                                                    'flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-3 text-left text-sm',
                                                    si ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-800'
                                                )}
                                            >
                                                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', si ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-400')}>
                                                    {si && <Check className="h-3.5 w-3.5" aria-hidden />}
                                                </span>
                                                <span className="flex-1">{c.texto}</span>
                                                <span className="text-xs text-gray-600">{c.puntos} pts</span>
                                            </button>
                                        );
                                    }
                                    if (instrumento.tipo === 'PUNTOS') {
                                        return (
                                            <label key={c.id} className="flex items-center justify-between gap-2 text-sm text-gray-800">
                                                <span>
                                                    {c.texto} <span className="text-xs text-gray-600">(de 0 a {c.puntos})</span>
                                                </span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    max={c.puntos}
                                                    step={0.5}
                                                    disabled={!puedeEditar}
                                                    value={typeof valor === 'number' ? valor : ''}
                                                    onChange={(e) => {
                                                        const n = e.target.value === '' ? null : Number(e.target.value);
                                                        if (n !== null && (n < 0 || n > (c.puntos ?? 0))) return;
                                                        cambiar(n);
                                                    }}
                                                    className="min-h-[44px] w-20 rounded-lg border border-gray-300 px-2 text-right tabular-nums"
                                                    aria-label={`${nombre}: ${c.texto}`}
                                                />
                                            </label>
                                        );
                                    }
                                    return (
                                        <div key={c.id} className="space-y-1">
                                            <p className="text-sm text-gray-800">{c.texto}</p>
                                            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`${nombre}: ${c.texto}`}>
                                                {niveles.map((n) => (
                                                    <button
                                                        key={n.id}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={valor === n.id}
                                                        disabled={!puedeEditar}
                                                        title={[n.nombre, instrumento.descriptores?.[c.id]?.[n.id]].filter(Boolean).join(': ')}
                                                        onClick={() => cambiar(valor === n.id ? null : n.id)}
                                                        className={cn(
                                                            'min-h-[44px] min-w-[44px] rounded-lg border px-2 text-sm font-bold',
                                                            valor === n.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800'
                                                        )}
                                                    >
                                                        {n.id}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {suyas && puedeEditar && (
                                <button type="button" onClick={() => marcar(a.id, null)} className="min-h-[44px] text-xs font-semibold text-gray-600 hover:text-red-700">
                                    Quitar su nota
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
