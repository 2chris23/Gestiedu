'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { BarChart3, Grid3x3, Hash, ListChecks, Plus, Trash2, type LucideIcon } from 'lucide-react';
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
 * rúbrica, qué describe cada casilla. Arriba, lo que vale en total: la nota de
 * la actividad se lleva a 20 igual que cualquier nota.
 *
 * Diseño como Finanzas y la configuración (Cristian, 17-oct-2026): fondo gris
 * claro, cajas blancas redondeadas, el total arriba en grande, el tipo en
 * cuatro cuadros, cada criterio una caja con su número y, abajo y fijo,
 * «Guardar instrumento».
 *
 * Con `local` no hay fila del plan detrás (el plan de una clase de materia
 * pendiente): parte de lo que se le da y entrega lo armado, sin guardar nada.
 */

const ICONO_DEL_TIPO: Record<TipoDeInstrumento, LucideIcon> = { COTEJO: ListChecks, ESCALA: BarChart3, RUBRICA: Grid3x3, PUNTOS: Hash };

// Campos suaves, sin raya dura: fondo gris claro y, al escribir, el filo del
// color de la app. Con `!`: la red de seguridad de globals.css les pone borde
// y fondo a los campos.
const campo =
    'min-w-0 w-full !min-h-[44px] !rounded-xl !border-transparent !bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:!border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const areaDeTexto =
    'w-full !rounded-xl !border-transparent !bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:!border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const rotuloDeGrupo = 'px-1 text-xs font-semibold uppercase tracking-wide text-gray-600';

let siguiente = 0;
const nuevoId = () => `k${Date.now().toString(36)}${(siguiente++).toString(36)}`;

export default function EditorDeInstrumento({
    rowId,
    titulo,
    abierto,
    alCerrar,
    local,
}: {
    rowId: string;
    titulo: string;
    abierto: boolean;
    alCerrar: () => void;
    local?: { inicial: Instrumento | null; alGuardar: (definicion: Instrumento | null) => void };
}) {
    const { data, isLoading } = useInstrumentoDeLaFila(abierto && !local ? rowId : null);
    const guardar = useGuardarInstrumento();
    const quitar = useQuitarInstrumento();
    const confirmar = useConfirm();
    const [def, setDef] = React.useState<Instrumento | null>(null);

    React.useEffect(() => {
        if (local && abierto) setDef(local.inicial ?? plantillaDe('COTEJO'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto]);

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
    const tienePuesto = Boolean(local ? local.inicial : data?.instrumento);

    const alQuitar = async () => {
        if (!(await confirmar({ title: '¿Quitar el instrumento?', description: 'Lo ya calificado con él se queda como está.' }))) return;
        if (local) {
            local.alGuardar(null);
            alCerrar();
            return;
        }
        quitar.mutate(rowId, {
            onSuccess: () => {
                toast.success('Instrumento quitado');
                alCerrar();
            },
            onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo quitar')),
        });
    };

    const alGuardar = () => {
        if (!def) return;
        if (local) {
            local.alGuardar(validarInstrumento(def));
            alCerrar();
            return;
        }
        guardar.mutate(
            { rowId, definicion: def, version: data?.instrumento?.version },
            {
                onSuccess: () => {
                    toast.success('Instrumento guardado');
                    alCerrar();
                },
                onError: (e) => toast.error(getApiErrorMessage(e, 'No se pudo guardar el instrumento')),
            }
        );
    };

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] bg-gray-50 p-0 sm:rounded-[28px]">
                <DialogHeader className="shrink-0 px-5 pb-3 pr-14 pt-5 text-left">
                    <DialogTitle className="text-lg font-bold text-gray-900">Instrumento de evaluación</DialogTitle>
                    <DialogDescription className="truncate text-sm text-gray-600">{titulo}</DialogDescription>
                </DialogHeader>
                {isLoading || !def ? (
                    <p className="px-5 pb-6 text-sm text-gray-600">Cargando…</p>
                ) : (
                    <>
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
                            {/* Lo que vale, arriba y en grande (como el saldo de Finanzas). */}
                            <div role="status" className={cn('rounded-[24px] p-4 ring-1', problema ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-white ring-gray-200')}>
                                {problema ? (
                                    <p className="text-sm font-medium">{problema}</p>
                                ) : (
                                    // Dos cifras y nada que leer (Cristian, 18-oct-2026): lo que
                                    // lleva el instrumento y lo que aporta al lapso.
                                    <div className="grid grid-cols-2 divide-x divide-gray-100">
                                        <div className="pr-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Lleva</p>
                                            <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
                                                {maximo} <span className="text-base font-semibold text-gray-500">pts</span>
                                            </p>
                                        </div>
                                        <div className="pl-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Aporta al lapso</p>
                                            <p className="mt-0.5 text-2xl font-bold tabular-nums text-indigo-700">
                                                {data?.fila.puntos ? Math.round(Number(data.fila.puntos) * 100) / 100 : '—'}{' '}
                                                <span className="text-base font-semibold text-gray-500">pts</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <fieldset>
                                <legend className={rotuloDeGrupo}>Tipo</legend>
                                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de instrumento">
                                    {(Object.keys(NOMBRE_DEL_TIPO) as TipoDeInstrumento[]).map((t) => {
                                        const Icono = ICONO_DEL_TIPO[t];
                                        const esta = def.tipo === t;
                                        return (
                                            <button
                                                key={t}
                                                type="button"
                                                role="radio"
                                                aria-checked={esta}
                                                onClick={() => !esta && cambiarTipo(t)}
                                                className={cn(
                                                    'flex min-h-[56px] items-center gap-2.5 rounded-[20px] px-3 py-2 text-left text-sm font-medium leading-tight transition-colors',
                                                    esta ? 'bg-indigo-600 text-white' : 'bg-white text-gray-900 ring-1 ring-gray-200 hover:bg-indigo-50'
                                                )}
                                            >
                                                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', esta ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700')}>
                                                    <Icono className="h-4 w-4" aria-hidden />
                                                </span>
                                                {t === 'PUNTOS' ? 'Por puntos' : NOMBRE_DEL_TIPO[t]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            {!porPuntos && (
                                <fieldset>
                                    <legend className={rotuloDeGrupo}>Niveles</legend>
                                    <ul className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-[22px] bg-white ring-1 ring-gray-200">
                                        {(def.niveles ?? NIVELES_POR_DEFECTO).map((n, i) => (
                                            <li key={n.id} className="flex items-center gap-2 px-3 py-2">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{n.id}</span>
                                                <input aria-label={`Nombre del nivel ${n.id}`} value={n.nombre} onChange={(e) => nivel(i, { nombre: e.target.value })} className={campo} />
                                                <input
                                                    aria-label={`Valor del nivel ${n.id}`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    value={n.valor}
                                                    onChange={(e) => nivel(i, { valor: Number(e.target.value) })}
                                                    className={`${campo} !w-20 shrink-0 text-center tabular-nums`}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                </fieldset>
                            )}

                            <fieldset>
                                <legend className={rotuloDeGrupo}>
                                    {def.tipo === 'COTEJO' ? 'Indicadores' : 'Criterios'} · {def.criterios.length}
                                </legend>
                                <ol className="mt-2 space-y-2">
                                    {def.criterios.map((c, i) => (
                                        <li key={c.id} className="space-y-2 rounded-[22px] bg-white p-3 ring-1 ring-gray-200">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
                                                <input
                                                    aria-label={`Criterio ${i + 1}`}
                                                    placeholder={def.tipo === 'COTEJO' ? 'Qué indicador' : 'Qué criterio'}
                                                    value={c.texto}
                                                    onChange={(e) => criterio(i, { texto: e.target.value })}
                                                    className={campo}
                                                />
                                                <span className="flex shrink-0 flex-col items-center">
                                                    <input
                                                        aria-label={porPuntos ? `Puntos del criterio ${i + 1}` : `Peso del criterio ${i + 1}`}
                                                        type="number"
                                                        inputMode="decimal"
                                                        min={0}
                                                        step={0.5}
                                                        value={porPuntos ? c.puntos ?? '' : c.peso ?? 1}
                                                        onChange={(e) => criterio(i, porPuntos ? { puntos: Number(e.target.value) } : { peso: Number(e.target.value) })}
                                                        className={`${campo} !w-16 text-center font-semibold tabular-nums`}
                                                    />
                                                    <span className="mt-0.5 text-xs text-gray-600" aria-hidden>
                                                        {porPuntos ? 'pts' : 'peso'}
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label={`Quitar el criterio ${i + 1}`}
                                                    onClick={() => poner({ criterios: def.criterios.filter((_, j) => j !== i) })}
                                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                            {/* Qué se mira en este indicador: sale en la hoja impresa y al calificar. */}
                                            <textarea
                                                aria-label={`Descripción de ${c.texto || `el criterio ${i + 1}`}`}
                                                placeholder="Descripción (opcional)"
                                                rows={2}
                                                maxLength={1000}
                                                value={c.descripcion ?? ''}
                                                onChange={(e) => criterio(i, { descripcion: e.target.value })}
                                                className={areaDeTexto}
                                            />
                                            {def.tipo === 'RUBRICA' && (
                                                <div className="grid gap-2 sm:grid-cols-2">
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
                                                            className={areaDeTexto}
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
                                    className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-1.5 rounded-[22px] border border-dashed border-indigo-300 bg-white text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
                                >
                                    <Plus className="h-4 w-4" aria-hidden /> Añadir {def.tipo === 'COTEJO' ? 'indicador' : 'criterio'}
                                </button>
                            </fieldset>

                            {tienePuesto && (
                                <button
                                    type="button"
                                    onClick={alQuitar}
                                    className="flex min-h-[44px] w-full items-center justify-center rounded-full text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                                >
                                    Quitar instrumento
                                </button>
                            )}
                        </div>

                        <div className="zona-segura-abajo flex shrink-0 gap-2 border-t border-gray-200 bg-white px-4 py-3">
                            <button
                                type="button"
                                onClick={alCerrar}
                                className="min-h-[48px] flex-1 rounded-full bg-gray-100 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(problema) || guardar.isPending}
                                onClick={alGuardar}
                                className="min-h-[48px] flex-[2] rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Guardar instrumento
                            </button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
