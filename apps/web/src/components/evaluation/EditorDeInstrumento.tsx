'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/hooks/useConfirm';
import { useGuardarInstrumento, useInstrumentoDeLaFila, useQuitarInstrumento } from '@/hooks/useInstrumentos';
import {
    InstrumentoInvalido,
    NIVELES_POR_DEFECTO,
    maximoDelInstrumento,
    plantillaDe,
    validarInstrumento,
    type Instrumento,
    type TipoDeInstrumento,
} from '@/lib/instrumentos';
import { getApiErrorMessage, cn } from '@/lib/utils';
import { NOMBRE_DEL_TIPO } from './nombres-de-instrumentos';

/**
 * ARMAR EL INSTRUMENTO DE UNA EVALUACIÓN DEL PLAN
 *
 * Se elige el tipo (arranca con una plantilla que se cambia a gusto), los
 * criterios con sus puntos (o su peso), los niveles de la escala y, en la
 * rúbrica, qué describe cada casilla. Abajo, lo que vale en total: la nota de
 * la actividad se lleva a 20 igual que cualquier nota.
 */

const AYUDA: Record<TipoDeInstrumento, string> = {
    COTEJO: 'Cada indicador es sí o no; lo marcado suma sus puntos.',
    ESCALA: 'Cada criterio se ubica en un nivel (logro destacado, esperado, en proceso, en inicio).',
    RUBRICA: 'Como la escala, y cada casilla dice qué se espera en ese nivel.',
    PUNTOS: 'Cada criterio recibe de 0 a sus puntos.',
};

const campo = 'w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
let siguiente = 0;
const nuevoId = () => `k${Date.now().toString(36)}${(siguiente++).toString(36)}`;

export default function EditorDeInstrumento({
    rowId,
    titulo,
    abierto,
    alCerrar,
}: {
    rowId: string;
    titulo: string;
    abierto: boolean;
    alCerrar: () => void;
}) {
    const { data, isLoading } = useInstrumentoDeLaFila(abierto ? rowId : null);
    const guardar = useGuardarInstrumento();
    const quitar = useQuitarInstrumento();
    const confirmar = useConfirm();
    const [def, setDef] = React.useState<Instrumento | null>(null);

    React.useEffect(() => {
        if (!data) return;
        // Sin instrumento todavía: se sugiere el tipo por lo que diga el plan.
        const texto = (data.fila.instrumentos || '').toLowerCase();
        const sugerido: TipoDeInstrumento = texto.includes('cotejo') ? 'COTEJO' : texto.includes('rúbrica') || texto.includes('rubrica') ? 'RUBRICA' : texto.includes('escala') ? 'ESCALA' : 'COTEJO';
        setDef(data.instrumento?.definicion ?? plantillaDe(sugerido));
    }, [data]);

    const poner = (cambio: Partial<Instrumento>) => setDef((d) => (d ? { ...d, ...cambio } : d));
    const cambiarTipo = (tipo: TipoDeInstrumento) => setDef(plantillaDe(tipo));
    const criterio = (i: number, cambio: Record<string, unknown>) => def && poner({ criterios: def.criterios.map((c, j) => (j === i ? { ...c, ...cambio } : c)) });
    const nivel = (i: number, cambio: Record<string, unknown>) => def && poner({ niveles: (def.niveles ?? NIVELES_POR_DEFECTO).map((n, j) => (j === i ? { ...n, ...cambio } : n)) });

    let problema: string | null = null;
    let maximo = 0;
    if (def) {
        try {
            maximo = maximoDelInstrumento(validarInstrumento(def));
        } catch (e) {
            problema = e instanceof InstrumentoInvalido ? e.message : 'Revisa el instrumento';
        }
    }
    const porPuntos = def?.tipo === 'COTEJO' || def?.tipo === 'PUNTOS';

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Instrumento de evaluación</DialogTitle>
                    <DialogDescription>{titulo}</DialogDescription>
                </DialogHeader>
                {isLoading || !def ? (
                    <p className="text-sm text-gray-600">Cargando…</p>
                ) : (
                    <div className="space-y-5">
                        <fieldset>
                            <legend className="text-sm font-medium text-gray-800">Tipo</legend>
                            <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de instrumento">
                                {(Object.keys(NOMBRE_DEL_TIPO) as TipoDeInstrumento[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        role="radio"
                                        aria-checked={def.tipo === t}
                                        onClick={() => def.tipo !== t && cambiarTipo(t)}
                                        className={cn(
                                            'min-h-[44px] rounded-lg border px-3 text-sm font-medium',
                                            def.tipo === t ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800'
                                        )}
                                    >
                                        {NOMBRE_DEL_TIPO[t]}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-xs text-gray-600">{AYUDA[def.tipo]}</p>
                        </fieldset>

                        {!porPuntos && (
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-medium text-gray-800">Niveles</legend>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {(def.niveles ?? NIVELES_POR_DEFECTO).map((n, i) => (
                                        <div key={n.id} className="flex items-center gap-2">
                                            <span className="w-8 shrink-0 text-center text-xs font-bold text-gray-700">{n.id}</span>
                                            <input aria-label={`Nombre del nivel ${n.id}`} value={n.nombre} onChange={(e) => nivel(i, { nombre: e.target.value })} className={campo} />
                                            <input
                                                aria-label={`Valor del nivel ${n.id}`}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                value={n.valor}
                                                onChange={(e) => nivel(i, { valor: Number(e.target.value) })}
                                                className={`${campo} w-20`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </fieldset>
                        )}

                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium text-gray-800">{def.tipo === 'COTEJO' ? 'Indicadores' : 'Criterios'}</legend>
                            <ol className="space-y-3">
                                {def.criterios.map((c, i) => (
                                    <li key={c.id} className="space-y-2 rounded-xl border border-gray-200 p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 shrink-0 text-right text-xs text-gray-600">{i + 1}.</span>
                                            <input aria-label={`Criterio ${i + 1}`} value={c.texto} onChange={(e) => criterio(i, { texto: e.target.value })} className={campo} />
                                            <input
                                                aria-label={porPuntos ? `Puntos del criterio ${i + 1}` : `Peso del criterio ${i + 1}`}
                                                title={porPuntos ? 'Puntos' : 'Peso'}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step={0.5}
                                                value={porPuntos ? c.puntos ?? '' : c.peso ?? 1}
                                                onChange={(e) => criterio(i, porPuntos ? { puntos: Number(e.target.value) } : { peso: Number(e.target.value) })}
                                                className={`${campo} w-20`}
                                            />
                                            <button
                                                type="button"
                                                aria-label={`Quitar el criterio ${i + 1}`}
                                                onClick={() => poner({ criterios: def.criterios.filter((_, j) => j !== i) })}
                                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                        {def.tipo === 'RUBRICA' && (
                                            <div className="grid gap-2 pl-8 sm:grid-cols-2">
                                                {(def.niveles ?? NIVELES_POR_DEFECTO).map((n) => (
                                                    <textarea
                                                        key={n.id}
                                                        aria-label={`${c.texto || `Criterio ${i + 1}`}: qué se espera en ${n.nombre}`}
                                                        placeholder={`${n.nombre}: qué se espera`}
                                                        rows={2}
                                                        value={def.descriptores?.[c.id]?.[n.id] ?? ''}
                                                        onChange={(e) =>
                                                            poner({ descriptores: { ...(def.descriptores ?? {}), [c.id]: { ...(def.descriptores?.[c.id] ?? {}), [n.id]: e.target.value } } })
                                                        }
                                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                            <button
                                type="button"
                                onClick={() => poner({ criterios: [...def.criterios, porPuntos ? { id: nuevoId(), texto: '', puntos: 1 } : { id: nuevoId(), texto: '', peso: 1 }] })}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                                <Plus className="h-4 w-4" aria-hidden /> Añadir {def.tipo === 'COTEJO' ? 'indicador' : 'criterio'}
                            </button>
                        </fieldset>

                        <p className={cn('rounded-lg px-3 py-2 text-sm', problema ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-800')} role="status">
                            {problema ?? (
                                <>
                                    Vale <strong>{maximo}</strong> puntos en total; la nota se lleva a 20 como cualquier otra
                                    {data?.fila.puntos ? ` y aporta hasta ${data.fila.puntos} pts. al lapso` : ''}.
                                </>
                            )}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            {data?.instrumento ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!(await confirmar({ title: '¿Quitar el instrumento?', description: 'Lo ya calificado con él se queda como está.' }))) return;
                                        quitar.mutate(rowId, {
                                            onSuccess: () => {
                                                toast.success('Instrumento quitado');
                                                alCerrar();
                                            },
                                            onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
                                        });
                                    }}
                                    className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                                >
                                    Quitar instrumento
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-2">
                                <button type="button" onClick={alCerrar} className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={Boolean(problema) || guardar.isPending}
                                    onClick={() =>
                                        guardar.mutate(
                                            { rowId, definicion: def, version: data?.instrumento?.version },
                                            {
                                                onSuccess: () => {
                                                    toast.success('Instrumento guardado');
                                                    alCerrar();
                                                },
                                                onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el instrumento')),
                                            }
                                        )
                                    }
                                    className="min-h-[44px] rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                                >
                                    Guardar instrumento
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
