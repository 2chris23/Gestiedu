'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, QrCode, Save } from 'lucide-react';
import { asistenciaQr, elMotivo, type ConfigAsistenciaQr } from '@/lib/asistencia-qr';
import { cn } from '@/lib/utils';

/**
 * ASISTENCIA POR QR: LAS REGLAS DE ESTE LICEO
 *
 * Nada de esto está escrito en el código: cada liceo decide el radio, si lejos
 * se rechaza o solo se avisa, cuánto es «a tiempo» y hasta cuándo se corrige.
 * Lo que sale de fábrica es lo que se propuso en el diseño
 * (`docs/PROXIMAS-FUNCIONES.md`).
 */

const campo =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const rotulo = 'block text-sm font-medium text-gray-800';
const ayuda = 'mt-1 text-xs text-gray-600';

function SiNo({ valor, alCambiar, etiqueta }: { valor: boolean; alCambiar: (v: boolean) => void; etiqueta: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={valor}
            aria-label={etiqueta}
            onClick={() => alCambiar(!valor)}
            className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', valor ? 'bg-indigo-600' : 'bg-gray-300')}
        >
            <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', valor ? 'translate-x-6' : 'translate-x-1')} />
        </button>
    );
}

export function QrSettings() {
    const cola = useQueryClient();
    const { data, isLoading } = useQuery({ queryKey: ['asistencia-qr', 'config'], queryFn: asistenciaQr.config });
    const [c, setC] = useState<ConfigAsistenciaQr | null>(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (data) setC(data);
    }, [data]);

    if (isLoading || !c) {
        return (
            <div className="flex items-center gap-2 p-6 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
        );
    }

    const poner = <K extends keyof ConfigAsistenciaQr>(k: K, v: ConfigAsistenciaQr[K]) => setC((x) => (x ? { ...x, [k]: v } : x));

    const guardar = async () => {
        setGuardando(true);
        try {
            const nueva = await asistenciaQr.guardarConfig(c);
            cola.setQueryData(['asistencia-qr', 'config'], nueva);
            toast.success('Reglas de la asistencia por QR guardadas');
        } catch (e) {
            toast.error(elMotivo(e, 'No se pudo guardar'));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start gap-3">
                <QrCode className="mt-0.5 h-6 w-6 text-indigo-600" aria-hidden />
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Asistencia por QR</h2>
                    <p className="text-sm text-gray-600">
                        El profesor abre un QR en su clase y los alumnos lo escanean desde su app. Pasar lista a mano sigue funcionando siempre.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                    <p className={rotulo}>Usar la asistencia por QR</p>
                    <p className={ayuda}>Apagada, el botón del QR no aparece en las clases.</p>
                </div>
                <SiNo valor={c.activa} alCambiar={(v) => poner('activa', v)} etiqueta="Usar la asistencia por QR" />
            </div>

            <fieldset disabled={!c.activa} className="grid gap-5 disabled:opacity-60 sm:grid-cols-2">
                <div>
                    <label htmlFor="qr-radio" className={rotulo}>Distancia máxima al teléfono del profesor (metros)</label>
                    <input
                        id="qr-radio"
                        type="number"
                        inputMode="numeric"
                        min={10}
                        max={5000}
                        value={c.radioMetros}
                        onChange={(e) => poner('radioMetros', Number(e.target.value))}
                        className={campo}
                    />
                    <p className={ayuda}>El centro es el teléfono del profesor al abrir el QR, esté donde esté la clase.</p>
                </div>

                <div>
                    <span className={rotulo}>Si el alumno está más lejos</span>
                    <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Si el alumno está más lejos">
                        {(
                            [
                                { v: 'confirmar', t: 'Entra por confirmar' },
                                { v: 'bloquear', t: 'No se registra' },
                            ] as const
                        ).map((o) => (
                            <button
                                key={o.v}
                                type="button"
                                role="radio"
                                aria-checked={c.fueraDelRadio === o.v}
                                onClick={() => poner('fueraDelRadio', o.v)}
                                className={cn(
                                    'min-h-[44px] rounded-lg border px-3 text-sm font-medium',
                                    c.fueraDelRadio === o.v ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-800'
                                )}
                            >
                                {o.t}
                            </button>
                        ))}
                    </div>
                    <p className={ayuda}>«Por confirmar»: el profesor lo aprueba de un toque. Sin GPS, siempre es por confirmar.</p>
                </div>

                <div>
                    <label htmlFor="qr-tiempo" className={rotulo}>Minutos para llegar a tiempo</label>
                    <input
                        id="qr-tiempo"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={120}
                        value={c.minutosATiempo}
                        onChange={(e) => poner('minutosATiempo', Number(e.target.value))}
                        className={campo}
                    />
                    <p className={ayuda}>Desde que el profesor abre el QR. Quien escanea después entra como «tarde».</p>
                </div>

                <div>
                    <label htmlFor="qr-dias" className={rotulo}>Días hacia atrás que se pueden corregir</label>
                    <input
                        id="qr-dias"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={365}
                        value={c.diasParaCorregir}
                        onChange={(e) => poner('diasParaCorregir', Number(e.target.value))}
                        className={campo}
                    />
                    <p className={ayuda}>Para marcar a quien se olvidó un día pasado. Nunca más allá del cierre del lapso.</p>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4 sm:col-span-2">
                    <div>
                        <p className={rotulo}>Un teléfono por alumno</p>
                        <p className={ayuda}>
                            El primer teléfono desde el que un alumno pasa asistencia queda suyo. Si lo cambia, lo desbloqueas desde su perfil.
                        </p>
                    </div>
                    <SiNo valor={c.unTelefonoPorAlumno} alCambiar={(v) => poner('unTelefonoPorAlumno', v)} etiqueta="Un teléfono por alumno" />
                </div>
            </fieldset>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={guardar}
                    disabled={guardando}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
                >
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar
                </button>
            </div>
        </div>
    );
}

export default QrSettings;
