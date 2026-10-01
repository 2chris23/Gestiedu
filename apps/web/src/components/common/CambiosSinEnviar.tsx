'use client';

import * as React from 'react';
import { Clock3, AlertTriangle, Hourglass, XCircle } from 'lucide-react';
import { useConexion } from '@/hooks/useConexion';
import { usePorEnviar } from '@/hooks/usePorEnviar';
import { EVENTO_ENCOLADO, actualizarCambio, quitarCambio, type CambioPendiente } from '@/lib/por-enviar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { nombreDelCampo, sinLosCampos, valorLegible } from '@/lib/lo-que-se-vio';

/**
 * «3 SIN ENVIAR»: LO HECHO SIN CONEXIÓN, A LA VISTA
 *
 * Un relojito con la cuenta, arriba (junto al icono de sin conexión). Al
 * tocarlo, la lista: arriba lo que hay que decidir —otro cambió lo mismo
 * mientras tanto, y Cristian decidió que se pregunte—, luego lo que espera a
 * que otra persona decida, lo que no se pudo y lo que sigue esperando señal.
 */

const nombreDeLaNota = (v: unknown) => (v === null || v === undefined || v === '' ? 'sin nota' : String(v));
const ESTADOS: Record<string, string> = { PRESENT: 'presente', ABSENT: 'ausente', LATE: 'tarde', EXCUSED: 'justificado' };
const nombreDelEstado = (v: unknown) => (v ? ESTADOS[String(v)] ?? String(v) : 'sin marcar');

function hace(iso: string): string {
    const d = new Date(iso);
    const hoy = new Date();
    const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === hoy.toDateString() ? `hoy a las ${hora}` : `el ${d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })} a las ${hora}`;
}

const reintentar = () => document.dispatchEvent(new Event(EVENTO_ENCOLADO));

/** La misma nota (o asistencia) tocada por dos: cuál queda, alumno por alumno. */
function ElegirCualQueda({ c }: { c: CambioPendiente }) {
    const choques: any[] = c.choque?.choques ?? [];
    const esAsistencia = c.choque?.que === 'ASISTENCIA';
    const [suyas, setSuyas] = React.useState<Set<string>>(new Set());
    const nombre = (id: string) => c.nombres?.[id] ?? 'Un alumno';
    const valor = esAsistencia ? nombreDelEstado : nombreDeLaNota;

    const enviar = async () => {
        const datos = { ...c.datos, decision: 'la-mia' };
        if (esAsistencia) {
            datos.attendances = (datos.attendances ?? []).filter((a: any) => !suyas.has(a.studentId));
            if (!datos.attendances.length && !datos.observations && !datos.topic) return quitarCambio(c.id);
        } else {
            const campo = c.tipo === 'marcas' ? 'marcas' : 'scores';
            datos[campo] = Object.fromEntries(Object.entries(datos[campo] ?? {}).filter(([id]) => !suyas.has(id)));
            if (!Object.keys(datos[campo]).length) return quitarCambio(c.id);
        }
        await actualizarCambio(c.id, { datos, estado: 'pendiente', choque: undefined, motivo: undefined, noAntesDe: undefined });
        reintentar();
    };

    return (
        <div className="space-y-2">
            <ul className="space-y-1.5">
                {choques.map((ch) => {
                    const laSuya = suyas.has(ch.studentId);
                    return (
                        <li key={ch.studentId} className="rounded-xl bg-white p-2.5 text-sm ring-1 ring-gray-200">
                            <p className="text-gray-800">
                                <b>{nombre(ch.studentId)}</b>: {ch.quienNombre || 'otra persona'} puso <b>{valor(ch.ahora)}</b> mientras tanto; tú, <b>{valor(ch.tuya)}</b>.
                            </p>
                            <div className="mt-1.5 flex gap-2" role="group" aria-label={`Cuál queda para ${nombre(ch.studentId)}`}>
                                <Button
                                    variant={laSuya ? 'contorno' : 'solido'}
                                    aria-pressed={!laSuya}
                                    onClick={() => setSuyas((s) => { const n = new Set(s); n.delete(ch.studentId); return n; })}
                                >
                                    La mía ({valor(ch.tuya)})
                                </Button>
                                <Button
                                    variant={laSuya ? 'solido' : 'contorno'}
                                    aria-pressed={laSuya}
                                    onClick={() => setSuyas((s) => new Set(s).add(ch.studentId))}
                                >
                                    La otra ({valor(ch.ahora)})
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <Button className="w-full" onClick={() => void enviar()}>
                Listo, enviar
            </Button>
        </div>
    );
}

/** La configuración: campo a campo, lo de quien llegó antes o lo de uno. */
function ElegirCampos({ c }: { c: CambioPendiente }) {
    const campos: { campo: string; ahora: unknown; tuyo: unknown }[] = c.choque?.campos ?? [];
    const [suyos, setSuyos] = React.useState<Set<string>>(new Set());

    const enviar = async () => {
        const datos = { ...sinLosCampos(c.datos ?? {}, [...suyos]), __decision: 'lo-mio' };
        await actualizarCambio(c.id, { datos, estado: 'pendiente', choque: undefined, motivo: undefined, noAntesDe: undefined });
        reintentar();
    };

    return (
        <div className="space-y-2">
            <ul className="space-y-1.5">
                {campos.map((ch) => {
                    const elSuyo = suyos.has(ch.campo);
                    const nombre = nombreDelCampo(ch.campo);
                    return (
                        <li key={ch.campo} className="rounded-xl bg-white p-2.5 text-sm ring-1 ring-gray-200">
                            <p className="text-gray-800">
                                <b>{nombre}</b>: otra persona puso <b>{valorLegible(ch.ahora)}</b> mientras tanto; tú, <b>{valorLegible(ch.tuyo)}</b>.
                            </p>
                            <div className="mt-1.5 flex gap-2" role="group" aria-label={`Qué queda en ${nombre}`}>
                                <Button
                                    variant={elSuyo ? 'contorno' : 'solido'}
                                    aria-pressed={!elSuyo}
                                    onClick={() => setSuyos((s) => { const n = new Set(s); n.delete(ch.campo); return n; })}
                                >
                                    Lo mío
                                </Button>
                                <Button variant={elSuyo ? 'solido' : 'contorno'} aria-pressed={elSuyo} onClick={() => setSuyos((s) => new Set(s).add(ch.campo))}>
                                    Lo del otro
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <Button className="w-full" onClick={() => void enviar()}>
                Listo, enviar
            </Button>
        </div>
    );
}

function Decidir({ c }: { c: CambioPendiente }) {
    const que = c.choque?.que;
    if (que === 'NOTAS' || que === 'ASISTENCIA') return <ElegirCualQueda c={c} />;

    if (que === 'NOTAS_NUEVAS') {
        const quienes: string[] = c.choque?.quienes ?? [];
        return (
            <div className="space-y-2">
                <p className="text-sm text-gray-700">
                    Dejaste pendiente borrar <b>«{c.choque?.actividad?.title ?? 'esta actividad'}»</b>, pero mientras tanto {quienes.length ? quienes.join(' y ') : 'otra persona'} le puso nota a{' '}
                    <b>{c.choque?.notas}</b> alumno(s). ¿Aún quieres borrarla? (Quedaría en la papelera del liceo.)
                </p>
                <div className="flex gap-2">
                    <Button variant="contorno" className="flex-1" onClick={() => void quitarCambio(c.id)}>
                        No borrar
                    </Button>
                    <Button
                        variant="peligro"
                        className="flex-1"
                        onClick={async () => {
                            await actualizarCambio(c.id, { params: { ...(c.params ?? {}), decision: 'borrar' }, estado: 'pendiente', choque: undefined, motivo: undefined });
                            reintentar();
                        }}
                    >
                        Borrar igual
                    </Button>
                </div>
            </div>
        );
    }

    if (que === 'VERSION') {
        return (
            <div className="space-y-2">
                <p className="text-sm text-gray-700">Mientras estabas sin conexión, otra persona guardó esto mismo. ¿Qué queda?</p>
                <div className="flex gap-2">
                    <Button variant="contorno" className="flex-1" onClick={() => void quitarCambio(c.id)}>
                        Lo del otro
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={async () => {
                            await actualizarCambio(c.id, { datos: { ...c.datos, version: undefined }, estado: 'pendiente', choque: undefined, motivo: undefined });
                            reintentar();
                        }}
                    >
                        Lo mío
                    </Button>
                </div>
            </div>
        );
    }

    if (que === 'CAMPOS') return <ElegirCampos c={c} />;

    if (que === 'CONFIRMAR') {
        return (
            <div className="space-y-2">
                <p className="text-sm text-gray-700">
                    Esas clases no se borran, pero ninguna pantalla las enseñará hasta que se muevan a una hora del nuevo horario.
                </p>
                <div className="flex gap-2">
                    <Button variant="contorno" className="flex-1" onClick={() => void quitarCambio(c.id)}>
                        No cambiarlo
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={async () => {
                            const datos = { ...c.datos, configuration: { ...(c.datos?.configuration ?? {}), confirmarClasesFuera: true } };
                            await actualizarCambio(c.id, { datos, estado: 'pendiente', choque: undefined, motivo: undefined });
                            reintentar();
                        }}
                    >
                        Cambiarlo igual
                    </Button>
                </div>
            </div>
        );
    }

    if (que === 'NOTAS_CON_EL_INSTRUMENTO') {
        return (
            <div className="space-y-2">
                <p className="text-sm text-gray-700">
                    Mientras tanto se calificó con el instrumento anterior ({c.choque?.notas} nota(s)). Si lo cambias igual, esas notas se borran (quedan en la papelera) y habrá que calificar de nuevo.
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="contorno"
                        className="flex-1"
                        onClick={async () => {
                            await actualizarCambio(c.id, { datos: { ...c.datos, decision: 'dejar' }, estado: 'pendiente', choque: undefined, motivo: undefined });
                            reintentar();
                        }}
                    >
                        Dejar el anterior
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={async () => {
                            await actualizarCambio(c.id, { datos: { ...c.datos, decision: 'cambiar' }, estado: 'pendiente', choque: undefined, motivo: undefined });
                            reintentar();
                        }}
                    >
                        Cambiarlo igual
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-2">
            <Button variant="contorno" className="flex-1" onClick={() => void quitarCambio(c.id)}>
                Descartar
            </Button>
            <Button
                className="flex-1"
                onClick={async () => {
                    await actualizarCambio(c.id, { datos: { ...c.datos, decision: 'la-mia' }, estado: 'pendiente', choque: undefined });
                    reintentar();
                }}
            >
                Enviar igual
            </Button>
        </div>
    );
}

function Fila({ c }: { c: CambioPendiente }) {
    const icono =
        c.estado === 'hay-que-decidir' ? (
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        ) : c.estado === 'en-espera' ? (
            <Hourglass className="h-4 w-4 text-indigo-600" aria-hidden />
        ) : c.estado === 'rechazado' ? (
            <XCircle className="h-4 w-4 text-rose-600" aria-hidden />
        ) : (
            <Clock3 className="h-4 w-4 text-gray-500" aria-hidden />
        );
    return (
        <li
            className={cn(
                'rounded-2xl p-3 ring-1',
                c.estado === 'hay-que-decidir' ? 'bg-amber-50 ring-amber-200' : c.estado === 'rechazado' ? 'bg-rose-50 ring-rose-200' : 'bg-gray-50 ring-gray-200'
            )}
        >
            <p className="flex items-start gap-2 text-sm font-semibold text-gray-900">
                <span className="mt-0.5">{icono}</span>
                <span className="min-w-0 flex-1">{c.resumen}</span>
            </p>
            <p className="ml-6 text-xs text-gray-600">Hecho {hace(c.hechoEn)}</p>
            {c.estado === 'hay-que-decidir' && (
                <div className="ml-6 mt-2 space-y-2">
                    {c.motivo && <p className="text-sm text-amber-900">{c.motivo}</p>}
                    <Decidir c={c} />
                </div>
            )}
            {c.estado === 'en-espera' && (
                <div className="ml-6 mt-2 space-y-2">
                    <p className="text-sm text-indigo-900">{c.motivo ?? `Espera a que ${c.choque?.esperaA ?? 'otra persona'} decida.`}</p>
                    <Button variant="contorno" onClick={() => void quitarCambio(c.id)}>
                        Entendido
                    </Button>
                </div>
            )}
            {c.estado === 'rechazado' && (
                <div className="ml-6 mt-2 space-y-2">
                    <p className="text-sm text-rose-900">No se pudo: {c.motivo}</p>
                    <div className="flex gap-2">
                        <Button variant="contorno" onClick={() => void quitarCambio(c.id)}>
                            Descartar
                        </Button>
                        <Button
                           
                            onClick={async () => {
                                await actualizarCambio(c.id, { estado: 'pendiente', motivo: undefined, noAntesDe: undefined });
                                reintentar();
                            }}
                        >
                            Reintentar
                        </Button>
                    </div>
                </div>
            )}
        </li>
    );
}

export function CambiosSinEnviar() {
    const cola = usePorEnviar();
    const { hayConexion } = useConexion();
    const [abierto, setAbierto] = React.useState(false);

    if (!cola.length) return null;
    const porDecidir = cola.filter((c) => c.estado === 'hay-que-decidir' || c.estado === 'rechazado');
    const orden = { 'hay-que-decidir': 0, rechazado: 1, 'en-espera': 2, pendiente: 3 } as const;
    const lista = [...cola].sort((a, b) => orden[a.estado] - orden[b.estado] || a.orden - b.orden);
    const texto = porDecidir.length ? `${porDecidir.length} por decidir` : `${cola.length} sin enviar`;

    return (
        <div
            data-aviso="sin-enviar"
            className={cn(
                'fixed z-50 print:!hidden',
                // Junto al icono de sin conexión (a su izquierda), o en su sitio si hay conexión.
                hayConexion ? 'right-16 top-[calc(var(--zona-segura-arriba)+6px)]' : 'right-[7.5rem] top-[calc(var(--zona-segura-arriba)+6px)]',
                hayConexion ? 'lateral:bottom-5 lateral:right-5 lateral:top-auto' : 'lateral:bottom-5 lateral:right-[10rem] lateral:top-auto'
            )}
        >
            <button
                type="button"
                onClick={() => setAbierto(true)}
                aria-label={`${texto}: tocar para ver`}
                className={cn(
                    'flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold shadow-sm ring-1',
                    porDecidir.length ? 'bg-amber-500 text-white ring-amber-600' : 'bg-white text-gray-800 ring-gray-300'
                )}
            >
                {porDecidir.length ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <Clock3 className="h-4 w-4" aria-hidden />}
                <span className="tabular-nums">{porDecidir.length || cola.length}</span>
                <span className="hidden lateral:inline">{porDecidir.length ? 'por decidir' : 'sin enviar'}</span>
            </button>
            {abierto && (
                <Dialog open onOpenChange={setAbierto}>
                    <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto rounded-2xl">
                        <DialogHeader>
                            <DialogTitle>Lo que hiciste sin conexión</DialogTitle>
                            <DialogDescription>
                                {hayConexion
                                    ? 'Se envía solo. Si alguien cambió lo mismo mientras tanto, aquí eliges qué queda.'
                                    : 'Está guardado en este teléfono y se envía solo cuando vuelva la conexión.'}
                            </DialogDescription>
                        </DialogHeader>
                        <ul className="space-y-2">
                            {lista.map((c) => (
                                <Fila key={c.id} c={c} />
                            ))}
                        </ul>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

export default CambiosSinEnviar;
