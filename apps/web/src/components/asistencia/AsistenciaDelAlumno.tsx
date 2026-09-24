'use client';

import * as React from 'react';
import { CheckCircle2, Clock, Loader2, QrCode, ScanLine, X, XCircle } from 'lucide-react';
import { asistenciaQr, elAparato, elMotivo, laUbicacion, useConfigAsistenciaQr, type Ubicacion } from '@/lib/asistencia-qr';
import EscanerDeQr from '@/components/asistencia/EscanerDeQr';
import CodigoQr from '@/components/asistencia/CodigoQr';
import { mantenerLaPantallaEncendida } from '@/lib/pantalla-encendida';
import { cn } from '@/lib/utils';

/**
 * LA ASISTENCIA POR QR, DEL LADO DEL ALUMNO
 *
 * Dentro de su clase, dos botones:
 *
 *  · «Escanear asistencia»: se abre la cámara, lee el QR que enseña el
 *    profesor y queda registrado. Mientras la cámara busca, se pide ya dónde
 *    está el teléfono: así, al leer, no hay que esperar al GPS.
 *  · «Mi QR»: para cuando es el profesor quien escanea. Cambia cada 10 s,
 *    como el del profesor: una captura pasada a un amigo no sirve.
 *
 * El alumno no escribe nada más: el servidor decide si vale (teléfono, sección,
 * distancia) y lo dice con palabras.
 *
 * ─── POR QUÉ HAY DOS PIEZAS ─────────────────────────────────────────────────
 *
 * Los botones viven dentro de la ventana de la clase, y una ventana (Radix)
 * atrapa los toques: una cámara a pantalla completa abierta DESDE dentro no se
 * podía cerrar, y tocarla cerraba la ventana y con ella la cámara. Así que los
 * botones solo avisan (`abrirAsistencia`) y la cámara la pinta
 * `AsistenciaEnPantalla`, montada una vez en el panel, fuera de toda ventana.
 */

const EVENTO = 'gestiedu:asistencia-del-alumno';
type Que = 'escanear' | 'mi-qr';

export function abrirAsistencia(que: Que) {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: que }));
}

/** Los dos botones, para la ventana de la clase. */
export function BotonesDeAsistencia({ antes, className }: { antes?: () => void; className?: string }) {
    const { data: config } = useConfigAsistenciaQr();
    const abrir = (que: Que) => {
        antes?.();
        // Tras cerrarse la ventana, para que no se quede con los toques.
        setTimeout(() => abrirAsistencia(que), 60);
    };
    if (config && !config.activa) return null;
    return (
        <section className={cn('rounded-xl border border-indigo-100 bg-indigo-50/60 p-3', className)}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-900">Asistencia</h3>
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    onClick={() => abrir('escanear')}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white"
                >
                    <ScanLine className="h-4 w-4" /> Escanear asistencia
                </button>
                <button
                    type="button"
                    onClick={() => abrir('mi-qr')}
                    className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold text-indigo-800"
                >
                    <QrCode className="h-4 w-4" /> Mi QR
                </button>
            </div>
        </section>
    );
}

function MiQr({ alCerrar }: { alCerrar: () => void }) {
    const [codigo, setCodigo] = React.useState<{ codigo: string; cambiaEnMs: number } | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => mantenerLaPantallaEncendida(), []);

    React.useEffect(() => {
        let vivo = true;
        let t: ReturnType<typeof setTimeout> | null = null;
        const pedir = async () => {
            try {
                const c = await asistenciaQr.miCodigo();
                if (!vivo) return;
                setCodigo(c);
                setError(null);
                t = setTimeout(pedir, Math.max(400, c.cambiaEnMs + 150));
            } catch (e) {
                if (!vivo) return;
                setError(elMotivo(e, 'No se pudo pedir tu código. Revisa la conexión.'));
                t = setTimeout(pedir, 3000);
            }
        };
        void pedir();
        return () => {
            vivo = false;
            if (t) clearTimeout(t);
        };
    }, []);

    return (
        <div className="fixed inset-0 !m-0 z-[80] flex flex-col items-center justify-center gap-4 bg-white p-6" role="dialog" aria-modal aria-label="Mi QR de asistencia">
            <button
                type="button"
                onClick={alCerrar}
                aria-label="Cerrar"
                className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full text-gray-600"
                style={{ top: 'calc(var(--zona-segura-arriba) + 8px)' }}
            >
                <X className="h-6 w-6" />
            </button>
            <p className="text-lg font-bold text-gray-900">Tu QR de asistencia</p>
            <div style={{ width: 'min(80vw, 55vh, 360px)' }}>
                {codigo ? (
                    <CodigoQr texto={codigo.codigo} tamano={360} etiqueta="Tu código de asistencia" />
                ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gray-100">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-500" aria-hidden />
                    </div>
                )}
            </div>
            <p className="max-w-xs text-center text-sm text-gray-600">Enséñaselo al profesor. Cambia cada 10 segundos: una captura no sirve.</p>
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        </div>
    );
}

type Resultado = { bien: boolean; espera?: boolean; titulo: string; texto: string };

/** La cámara, el QR propio y el resultado: a pantalla completa, fuera de toda ventana. */
export function AsistenciaEnPantalla() {
    const [que, setQue] = React.useState<Que | null>(null);
    const [enviando, setEnviando] = React.useState(false);
    const [resultado, setResultado] = React.useState<Resultado | null>(null);
    const ubicacion = React.useRef<Promise<Ubicacion | null> | null>(null);

    React.useEffect(() => {
        const alAviso = (e: Event) => {
            const pedido = (e as CustomEvent).detail as Que;
            setResultado(null);
            ubicacion.current = null;
            setQue(pedido);
        };
        window.addEventListener(EVENTO, alAviso);
        return () => window.removeEventListener(EVENTO, alAviso);
    }, []);

    const alLeer = async (texto: string) => {
        setQue(null);
        setEnviando(true);
        try {
            const [aparato, dondeEstoy] = await Promise.all([elAparato(), ubicacion.current ?? laUbicacion()]);
            const r = await asistenciaQr.escanear({ codigo: texto, aparato, ubicacion: dondeEstoy });
            const clase = [r.materia, r.seccion].filter(Boolean).join(' · ');
            setResultado(
                r.estado === 'ACEPTADO'
                    ? {
                          bien: true,
                          titulo: r.yaEstaba ? 'Ya estabas registrado' : r.asistencia === 'LATE' ? 'Registrado, como tarde' : '¡Listo, estás presente!',
                          texto: clase,
                      }
                    : { bien: true, espera: true, titulo: 'Enviado', texto: r.mensaje }
            );
        } catch (e) {
            setResultado({ bien: false, titulo: 'No quedó registrado', texto: elMotivo(e) });
        } finally {
            setEnviando(false);
        }
        return true;
    };

    return (
        <>
            {que === 'escanear' && (
                <EscanerDeQr
                    titulo="Escanea el QR del profesor"
                    ayuda="Apunta a la pantalla de su teléfono."
                    alLeer={alLeer}
                    alCerrar={() => setQue(null)}
                    // Mientras la cámara busca el código, el GPS busca dónde estás.
                    alArrancar={() => {
                        ubicacion.current = laUbicacion(10000);
                    }}
                />
            )}
            {que === 'mi-qr' && <MiQr alCerrar={() => setQue(null)} />}

            {(enviando || resultado) && (
                <div className="fixed inset-0 !m-0 z-[80] flex flex-col items-center justify-center gap-4 bg-white p-6 text-center" role="alertdialog" aria-modal aria-live="assertive">
                    {enviando ? (
                        <>
                            <Loader2 className="h-12 w-12 animate-spin text-indigo-600" aria-hidden />
                            <p className="text-base font-semibold text-gray-800">Registrando tu asistencia…</p>
                        </>
                    ) : resultado ? (
                        <>
                            {!resultado.bien ? (
                                <XCircle className="h-16 w-16 text-red-600" aria-hidden />
                            ) : resultado.espera ? (
                                <Clock className="h-16 w-16 text-blue-600" aria-hidden />
                            ) : (
                                <CheckCircle2 className="h-16 w-16 text-emerald-600" aria-hidden />
                            )}
                            <p className="text-xl font-bold text-gray-900">{resultado.titulo}</p>
                            {resultado.texto && <p className="max-w-sm text-base text-gray-700">{resultado.texto}</p>}
                            <div className="flex gap-2">
                                {!resultado.bien && (
                                    <button
                                        type="button"
                                        onClick={() => abrirAsistencia('escanear')}
                                        className="min-h-[48px] rounded-xl border border-gray-300 px-5 text-sm font-bold text-gray-800"
                                    >
                                        Intentar otra vez
                                    </button>
                                )}
                                <button type="button" onClick={() => setResultado(null)} className="min-h-[48px] rounded-xl bg-indigo-600 px-6 text-sm font-bold text-white">
                                    Listo
                                </button>
                            </div>
                        </>
                    ) : null}
                </div>
            )}
        </>
    );
}

export default AsistenciaEnPantalla;
