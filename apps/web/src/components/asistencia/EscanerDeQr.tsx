'use client';

import * as React from 'react';
import { Camera, Loader2, X } from 'lucide-react';

/**
 * LA CÁMARA QUE LEE UN QR
 *
 * Abre la cámara de atrás y mira cada fotograma hasta encontrar un QR. Lee con
 * el lector del propio teléfono (`BarcodeDetector`) cuando lo tiene —es rápido
 * y no gasta batería— y, si no, con `jsqr` sobre una foto reducida del vídeo.
 *
 * Dentro de la app Android la cámara la pide Capacitor al primer uso (el
 * permiso CAMERA está en el manifiesto). En un navegador solo existe en https o
 * en localhost: fuera de eso se dice, en vez de enseñar un recuadro negro.
 */

interface Props {
    titulo: string;
    ayuda?: string;
    /**
     * Lo leído. Si devuelve `false` (o una promesa de `false`), se sigue
     * leyendo: sirve para escanear uno detrás de otro (el profesor a sus
     * alumnos). Cualquier otra cosa cierra la lectura.
     */
    alLeer: (texto: string) => unknown;
    alCerrar: () => void;
    /**
     * La cámara ya está viendo. Para pedir OTRO permiso (la ubicación) solo
     * después: dos avisos de permiso de Android a la vez y el segundo se pierde
     * —medido en el emulador: la cámara no abría—.
     */
    alArrancar?: () => void;
    /** Algo que enseñar encima del vídeo (el último leído, un aviso…). */
    children?: React.ReactNode;
}

type Lector = (fuente: HTMLVideoElement, lienzo: HTMLCanvasElement) => Promise<string | null>;

async function elLector(): Promise<Lector> {
    const Nativo = (globalThis as unknown as { BarcodeDetector?: any }).BarcodeDetector;
    if (Nativo) {
        try {
            const formatos: string[] = (await Nativo.getSupportedFormats?.()) ?? ['qr_code'];
            if (formatos.includes('qr_code')) {
                const detector = new Nativo({ formats: ['qr_code'] });
                return async (video) => {
                    const hallados = await detector.detect(video);
                    return hallados?.[0]?.rawValue ?? null;
                };
            }
        } catch {
            // Sin lector nativo: se usa jsqr.
        }
    }
    const jsQR = (await import('jsqr')).default;
    return async (video, lienzo) => {
        const ancho = video.videoWidth;
        const alto = video.videoHeight;
        if (!ancho || !alto) return null;
        // Más pequeño se lee igual de bien y cuesta mucho menos.
        const escala = Math.min(1, 640 / Math.max(ancho, alto));
        lienzo.width = Math.round(ancho * escala);
        lienzo.height = Math.round(alto * escala);
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
        const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
        return jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    };
}

export function EscanerDeQr({ titulo, ayuda, alLeer, alCerrar, alArrancar, children }: Props) {
    const video = React.useRef<HTMLVideoElement>(null);
    const lienzo = React.useRef<HTMLCanvasElement>(null);
    const alLeerRef = React.useRef(alLeer);
    const alArrancarRef = React.useRef(alArrancar);
    const [problema, setProblema] = React.useState<string | null>(null);
    const [arrancando, setArrancando] = React.useState(true);
    const [intento, setIntento] = React.useState(0);

    React.useEffect(() => {
        alLeerRef.current = alLeer;
        alArrancarRef.current = alArrancar;
    });

    React.useEffect(() => {
        let vivo = true;
        let flujo: MediaStream | null = null;
        let ocupado = false;
        let temporizador: ReturnType<typeof setTimeout> | null = null;

        const parar = () => {
            if (temporizador) clearTimeout(temporizador);
            flujo?.getTracks().forEach((t) => t.stop());
        };

        (async () => {
            setProblema(null);
            setArrancando(true);
            if (typeof window !== 'undefined' && !window.isSecureContext) {
                setProblema('La cámara solo funciona con conexión segura (https).');
                setArrancando(false);
                return;
            }
            if (!navigator.mediaDevices?.getUserMedia) {
                setProblema('Este teléfono no deja usar la cámara desde aquí.');
                setArrancando(false);
                return;
            }
            try {
                flujo = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false,
                });
            } catch (e: any) {
                if (!vivo) return;
                console.warn('La cámara no abrió:', e?.name, e?.message);
                setProblema(
                    e?.name === 'NotAllowedError'
                        ? 'Hace falta permiso para usar la cámara. Actívalo y vuelve a intentarlo.'
                        : e?.name === 'NotFoundError'
                          ? 'Este teléfono no tiene cámara disponible.'
                          : 'No se pudo abrir la cámara.'
                );
                setArrancando(false);
                return;
            }
            if (!vivo || !video.current) {
                parar();
                return;
            }
            video.current.srcObject = flujo;
            await video.current.play().catch(() => undefined);
            setArrancando(false);
            alArrancarRef.current?.();

            const leer = await elLector();
            const vuelta = async () => {
                if (!vivo) return;
                if (!ocupado && video.current && lienzo.current && video.current.readyState >= 2) {
                    try {
                        const texto = await leer(video.current, lienzo.current);
                        if (texto && vivo) {
                            ocupado = true;
                            const sigue = await alLeerRef.current(texto);
                            if (sigue === false) {
                                // Un respiro para no leer el mismo QR veinte veces.
                                temporizador = setTimeout(() => (ocupado = false), 1500);
                            } else {
                                return;
                            }
                        }
                    } catch {
                        // Un fotograma que no se pudo leer: el siguiente.
                    }
                }
                temporizador = setTimeout(vuelta, 120);
            };
            void vuelta();
        })();

        return () => {
            vivo = false;
            parar();
        };
    }, [intento]);

    return (
        <div className="fixed inset-0 !m-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal aria-label={titulo}>
            <div className="relative flex-1 overflow-hidden">
                <video ref={video} className="h-full w-full object-cover" playsInline muted aria-hidden />
                <canvas ref={lienzo} className="hidden" aria-hidden />

                {/* El recuadro donde poner el código */}
                {!problema && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                        <div className="aspect-square w-[min(70vw,60vh)] rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                    </div>
                )}

                <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3" style={{ paddingTop: 'calc(var(--zona-segura-arriba) + 12px)' }}>
                    <div className="rounded-2xl bg-black/55 px-3 py-2 text-white">
                        <p className="text-sm font-bold">{titulo}</p>
                        {ayuda && <p className="text-xs text-white/85">{ayuda}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={alCerrar}
                        aria-label="Cerrar la cámara"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 text-white"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {arrancando && !problema && (
                    <div className="absolute inset-0 flex items-center justify-center text-white">
                        <Loader2 className="h-8 w-8 animate-spin" aria-label="Abriendo la cámara" />
                    </div>
                )}

                {problema && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
                        <Camera className="h-10 w-10 opacity-80" aria-hidden />
                        <p className="max-w-xs text-base font-semibold">{problema}</p>
                        <button
                            type="button"
                            onClick={() => setIntento((n) => n + 1)}
                            className="min-h-[44px] rounded-xl bg-white px-5 text-sm font-bold text-gray-900"
                        >
                            Intentar otra vez
                        </button>
                    </div>
                )}

                {children && (
                    <div className="absolute inset-x-0 bottom-0 p-3" style={{ paddingBottom: 'calc(var(--zona-segura-abajo) + 12px)' }}>
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}

export default EscanerDeQr;
