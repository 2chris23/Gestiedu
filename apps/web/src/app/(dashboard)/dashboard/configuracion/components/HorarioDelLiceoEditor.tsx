'use client';

import { AlertTriangle, CheckCircle2, Coffee, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import {
    aHora,
    aMinutos,
    calcularTurno,
    turnosDeLaConfig,
    type HorarioDelLiceo,
    type Turno,
    type TurnoDelHorario,
} from '@/lib/franjas-del-horario';
import { cn } from '@/lib/utils';

/**
 * EL HORARIO DEL LICEO, A PRUEBA DE ERRORES
 *
 * Por turno, lo que el admin sabe de memoria: a qué hora empieza, a qué hora
 * acaba, cuánto dura una hora de clase y sus recreos. Cuántas horas caben lo
 * cuenta el sistema, y lo enseña hora por hora mientras se escribe. Si no
 * cuadra —sobran o faltan minutos— se dice en rojo cuánto y a qué hora tendría
 * que acabar, y no se puede guardar (el servidor tampoco lo acepta).
 *
 * Antes solo se podía poner la hora de inicio y el número de horas: el fin de
 * la mañana salía de la cuenta, y la tarde empezaba a las 13:00 fijas.
 */

const CAMPO =
    'w-full min-h-[44px] rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500';

const TURNOS: Array<{ clave: Turno; titulo: string; icono: React.ReactNode }> = [
    { clave: 'MANANA', titulo: 'Mañana', icono: <Sun className="h-4 w-4 text-amber-500" aria-hidden /> },
    { clave: 'TARDE', titulo: 'Tarde', icono: <Moon className="h-4 w-4 text-indigo-500" aria-hidden /> },
];

function Numero({
    id,
    valor,
    alCambiar,
    min,
    max,
}: {
    id: string;
    valor: number;
    alCambiar: (n: number) => void;
    min: number;
    max: number;
}) {
    return (
        <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={Number.isFinite(valor) ? valor : ''}
            onChange={(e) => alCambiar(parseInt(e.target.value, 10))}
            className={CAMPO}
        />
    );
}

function EditorDeTurno({
    clave,
    titulo,
    icono,
    turno,
    alCambiar,
}: {
    clave: Turno;
    titulo: string;
    icono: React.ReactNode;
    turno: TurnoDelHorario;
    alCambiar: (t: TurnoDelHorario) => void;
}) {
    const cuenta = calcularTurno(turno, clave);
    const id = (campo: string) => `horario-${clave}-${campo}`;
    const cambiar = (parte: Partial<TurnoDelHorario>) => alCambiar({ ...turno, ...parte });
    const cambiarRecreo = (i: number, parte: Partial<TurnoDelHorario['recreos'][number]>) =>
        cambiar({ recreos: turno.recreos.map((r, j) => (j === i ? { ...r, ...parte } : r)) });

    return (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby={id('titulo')}>
            <h4 id={id('titulo')} className="flex items-center gap-2 text-base font-bold text-gray-900">
                {icono} Turno de la {titulo.toLowerCase()}
            </h4>

            <div className="grid grid-cols-2 gap-3">
                <label htmlFor={id('inicio')} className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-700">Empieza a las</span>
                    <input id={id('inicio')} type="time" value={turno.inicio} onChange={(e) => cambiar({ inicio: e.target.value })} className={CAMPO} />
                </label>
                <label htmlFor={id('fin')} className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-700">Acaba a las</span>
                    <input id={id('fin')} type="time" value={turno.fin} onChange={(e) => cambiar({ fin: e.target.value })} className={CAMPO} />
                </label>
                <label htmlFor={id('duracion')} className="col-span-2 block">
                    <span className="mb-1 block text-xs font-semibold text-gray-700">Cada hora de clase dura (min)</span>
                    <Numero id={id('duracion')} valor={turno.duracion} alCambiar={(duracion) => cambiar({ duracion })} min={15} max={180} />
                </label>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">Recreos</p>
                {turno.recreos.length === 0 && <p className="text-sm text-gray-600">Sin recreo.</p>}
                {turno.recreos.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-amber-50/60 p-2">
                        <Coffee className="mb-3 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                        <label htmlFor={id(`recreo-${i}-despues`)} className="block min-w-[7rem] flex-1">
                            <span className="mb-1 block text-xs text-gray-700">Después de la hora nº</span>
                            <Numero id={id(`recreo-${i}-despues`)} valor={r.despuesDe} alCambiar={(despuesDe) => cambiarRecreo(i, { despuesDe })} min={1} max={14} />
                        </label>
                        <label htmlFor={id(`recreo-${i}-minutos`)} className="block min-w-[7rem] flex-1">
                            <span className="mb-1 block text-xs text-gray-700">Dura (min)</span>
                            <Numero id={id(`recreo-${i}-minutos`)} valor={r.minutos} alCambiar={(minutos) => cambiarRecreo(i, { minutos })} min={5} max={120} />
                        </label>
                        <button
                            type="button"
                            onClick={() => cambiar({ recreos: turno.recreos.filter((_, j) => j !== i) })}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-red-600 hover:bg-red-50"
                            aria-label={`Quitar el recreo ${i + 1} de la ${titulo.toLowerCase()}`}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        const ultimo = Math.max(0, ...turno.recreos.map((r) => r.despuesDe));
                        cambiar({ recreos: [...turno.recreos, { despuesDe: ultimo + 2, minutos: 10 }] });
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                    <Plus className="h-4 w-4" aria-hidden /> Añadir recreo
                </button>
            </div>

            {cuenta.errores.length > 0 ? (
                <div role="alert" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    {cuenta.errores.map((e, i) => (
                        <p key={i} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e}
                        </p>
                    ))}
                </div>
            ) : (
                <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Caben {cuenta.bloques} horas de clase
                    </p>
                    <ol className="flex flex-wrap gap-1.5" aria-label={`Horas de la ${titulo.toLowerCase()}`}>
                        {cuenta.franjas.map((f) => (
                            <li
                                key={f.id}
                                className={cn(
                                    'rounded-lg px-2 py-1 text-xs font-semibold',
                                    f.type === 'break' ? 'bg-amber-100 text-amber-900' : 'bg-white text-gray-800 ring-1 ring-emerald-200'
                                )}
                            >
                                {f.type === 'break' ? `${f.label} ` : ''}
                                {f.startTime}–{f.endTime}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}

export function HorarioDelLiceoEditor({
    valor,
    alCambiar,
}: {
    valor: HorarioDelLiceo;
    alCambiar: (nuevo: HorarioDelLiceo) => void;
}) {
    const turnos = turnosDeLaConfig(valor);
    const cruzan =
        calcularTurno(turnos.MANANA, 'MANANA').errores.length === 0 &&
        aMinutos(turnos.TARDE.inicio) < aMinutos(turnos.MANANA.fin);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
                {TURNOS.map((t) => (
                    <EditorDeTurno
                        key={t.clave}
                        clave={t.clave}
                        titulo={t.titulo}
                        icono={t.icono}
                        turno={turnos[t.clave]}
                        alCambiar={(nuevo) => alCambiar({ ...valor, turnos: { ...turnos, [t.clave]: nuevo } })}
                    />
                ))}
            </div>
            {cruzan && (
                <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    La tarde empieza ({turnos.TARDE.inicio}) antes de que acabe la mañana ({turnos.MANANA.fin}). Que
                    empiece a las {aHora(aMinutos(turnos.MANANA.fin))} o más tarde.
                </p>
            )}
        </div>
    );
}

export default HorarioDelLiceoEditor;
