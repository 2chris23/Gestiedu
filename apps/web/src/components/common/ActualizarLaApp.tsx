'use client';

import * as React from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import api from '@/lib/axios';
import { BACKEND_URL } from '@/config/env';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui';

/**
 * «HAY UNA VERSIÓN NUEVA DE LA APP»
 *
 * Casi todo lo que cambia en el sistema se ve sin instalar nada: la app
 * enseña lo que vive en el servidor. Pero lo que va DENTRO de la APK —la franja
 * del reloj, guardar la sesión al salir, la huella— solo llega instalando la
 * nueva, y pedirle a cada alumno que entre a una página a buscarla no
 * funciona: nadie lo hace.
 *
 * Al abrir la app (y al volver a ella) se pregunta al servidor cuál es la
 * última publicada; si es más nueva que esta, se ofrece aquí mismo: se baja
 * dentro de la app, con su barra, y Android pide confirmar la instalación.
 *
 * Solo dentro de la APK. En un navegador no hay nada que instalar: la web ya
 * es siempre la última.
 *
 * ─── LO QUE HACE EL TELÉFONO ────────────────────────────────────────────────
 *
 * `ActualizarAppPlugin.java`: baja el archivo a la caché de la app, comprueba
 * su huella contra la publicada y abre el instalador. La primera vez Android
 * pide permiso para que esta app pueda instalar; se explica y se lleva a
 * la pantalla de ajustes, y al volver sigue sola.
 */

interface Ficha {
    versionCode: number;
    versionName: string;
    sha256: string;
    tamano: number;
    notas?: string;
    url: string;
}

interface Oyente {
    remove: () => Promise<void> | void;
}

interface PluginApp {
    getInfo: () => Promise<{ id: string; build: string; version: string }>;
    addListener: (evento: 'resume', alVolver: () => void) => Promise<Oyente> | Oyente;
}

interface PluginActualizar {
    puedeInstalar: () => Promise<{ puede: boolean }>;
    pedirPermiso: () => Promise<void>;
    descargarEInstalar: (o: { url: string; sha256: string }) => Promise<void>;
    addListener: (evento: 'progreso', alAvanzar: (p: { porcentaje: number }) => void) => Promise<Oyente> | Oyente;
}

function losDelTelefono(): { app: PluginApp; actualizar: PluginActualizar } | null {
    if (typeof window === 'undefined') return null;
    const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, any> } }).Capacitor?.Plugins;
    const app = plugins?.App as PluginApp | undefined;
    const actualizar = plugins?.ActualizarApp as PluginActualizar | undefined;
    return app?.getInfo && actualizar?.descargarEInstalar ? { app, actualizar } : null;
}

/** «Ahora no» vale un día: al siguiente se vuelve a ofrecer. */
const DESCARTADA = 'gestiedu:version-de-la-app-descartada';
const UN_DIA = 24 * 60 * 60 * 1000;

function laDescartada(): { versionCode: number; hasta: number } | null {
    try {
        return JSON.parse(localStorage.getItem(DESCARTADA) || 'null');
    } catch {
        return null;
    }
}

type Fase = 'ofrecer' | 'permiso' | 'bajando' | 'instalando' | 'error';

export function ActualizarLaApp() {
    const [ficha, setFicha] = React.useState<Ficha | null>(null);
    const [fase, setFase] = React.useState<Fase>('ofrecer');
    const [porcentaje, setPorcentaje] = React.useState(0);
    const [error, setError] = React.useState('');
    const esperandoPermiso = React.useRef(false);
    const laFicha = React.useRef<Ficha | null>(null);
    React.useEffect(() => {
        laFicha.current = ficha;
    }, [ficha]);

    const bajar = React.useCallback(async (esta: Ficha) => {
        const telefono = losDelTelefono();
        if (!telefono) return;

        const { puede } = await telefono.actualizar.puedeInstalar();
        if (!puede) {
            setFase('permiso');
            return;
        }

        setFase('bajando');
        setPorcentaje(0);
        const oyente = await telefono.actualizar.addListener('progreso', (p) => setPorcentaje(Math.max(0, p.porcentaje)));
        try {
            const url = esta.url.startsWith('http') ? esta.url : `${BACKEND_URL}${esta.url}`;
            await telefono.actualizar.descargarEInstalar({ url, sha256: esta.sha256 });
            setFase('instalando');
        } catch (e: any) {
            setError(e?.message || 'No se pudo bajar la versión nueva.');
            setFase('error');
        } finally {
            await oyente.remove();
        }
    }, []);

    const comprobar = React.useCallback(async () => {
        const telefono = losDelTelefono();
        if (!telefono) return;

        // Si se fue a dar el permiso, al volver se sigue solo.
        if (esperandoPermiso.current) {
            esperandoPermiso.current = false;
            const { puede } = await telefono.actualizar.puedeInstalar();
            if (puede && laFicha.current) void bajar(laFicha.current);
            return;
        }

        try {
            const info = await telefono.app.getInfo();
            const laMia = Number(info.build) || 0;
            const { data } = await api.get<Ficha>(`/app-movil/${encodeURIComponent(info.id)}/version`, { timeout: 8000 });
            if (!data || !(data.versionCode > laMia)) return;
            const descartada = laDescartada();
            if (descartada?.versionCode === data.versionCode && Date.now() < descartada.hasta) return;
            setFicha(data);
            // Si se vuelve del instalador y esta sigue siendo la vieja, es que
            // se canceló (instalada, la app se habría reiniciado): se ofrece otra vez.
            setFase((f) => (f === 'bajando' ? f : 'ofrecer'));
        } catch {
            // Sin conexión, o sin ninguna versión publicada (404): nada que ofrecer.
        }
    }, [bajar]);

    React.useEffect(() => {
        const telefono = losDelTelefono();
        if (!telefono) return;
        void comprobar();
        let oyente: Oyente | null = null;
        let vivo = true;
        Promise.resolve(telefono.app.addListener('resume', () => void comprobar())).then((o) => {
            if (vivo) oyente = o;
            else void o.remove();
        });
        return () => {
            vivo = false;
            void oyente?.remove();
        };
    }, [comprobar]);

    const ahoraNo = () => {
        if (ficha) {
            try {
                localStorage.setItem(DESCARTADA, JSON.stringify({ versionCode: ficha.versionCode, hasta: Date.now() + UN_DIA }));
            } catch {
                // Sin almacenamiento, se volverá a ofrecer la próxima vez: no pasa nada.
            }
        }
        setFicha(null);
    };

    if (!ficha) return null;

    const megas = (ficha.tamano / 1024 / 1024).toFixed(1).replace('.', ',');
    const cerrable = fase === 'ofrecer' || fase === 'error' || fase === 'permiso' || fase === 'instalando';

    return (
        <Dialog open onOpenChange={(abierto) => !abierto && cerrable && ahoraNo()}>
            {/* Sin foco de entrada en un botón: en el teléfono salía «Ahora no»
                rodeado de un anillo, como si ya se hubiera pulsado. */}
            <DialogContent className="max-w-sm rounded-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <span className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600" aria-hidden>
                        {fase === 'permiso' ? <ShieldCheck className="h-6 w-6" /> : <Download className="h-6 w-6" />}
                    </span>
                    <DialogTitle className="text-center">
                        {fase === 'permiso'
                            ? 'Falta un permiso de Android'
                            : fase === 'instalando'
                              ? 'Confirma la instalación'
                              : 'Hay una versión nueva de la app'}
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        {fase === 'permiso' &&
                            'Android pide permiso para que esta app instale su propia actualización. En la pantalla que se abre, permítelo («Permitir de esta fuente» o «Permitir siempre», según el teléfono) y vuelve: se seguirá sola.'}
                        {fase === 'instalando' &&
                            'Android te pregunta si quieres instalar la actualización. Al aceptar, la app se cierra y se abre la nueva. No se pierde nada. Si Google Play Protect pide revisarla antes, acepta: tarda unos segundos.'}
                        {(fase === 'ofrecer' || fase === 'bajando') &&
                            `Versión ${ficha.versionName} · ${megas} MB. Se baja aquí mismo y Android te pedirá confirmar la instalación.`}
                        {fase === 'error' && error}
                    </DialogDescription>
                </DialogHeader>

                {ficha.notas && fase === 'ofrecer' && (
                    <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">{ficha.notas}</p>
                )}

                {fase === 'bajando' && (
                    <div aria-live="polite">
                        <div
                            role="progressbar"
                            aria-label="Descargando la versión nueva"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={porcentaje}
                            className="h-2.5 overflow-hidden rounded-full bg-gray-100"
                        >
                            <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-200" style={{ width: `${porcentaje}%` }} />
                        </div>
                        <p className="mt-2 text-center text-sm font-medium text-gray-700 tabular-nums">Descargando… {porcentaje} %</p>
                    </div>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {(fase === 'ofrecer' || fase === 'error' || fase === 'permiso') && (
                        <Button variant="outline" onClick={ahoraNo}>
                            Ahora no
                        </Button>
                    )}
                    {fase === 'ofrecer' && <Button onClick={() => void bajar(ficha)}>Descargar e instalar</Button>}
                    {fase === 'error' && <Button onClick={() => void bajar(ficha)}>Volver a intentarlo</Button>}
                    {fase === 'permiso' && (
                        <Button
                            onClick={() => {
                                esperandoPermiso.current = true;
                                void losDelTelefono()?.actualizar.pedirPermiso();
                            }}
                        >
                            Ir a dar el permiso
                        </Button>
                    )}
                    {fase === 'instalando' && (
                        <Button variant="outline" onClick={() => setFicha(null)}>
                            Cerrar
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ActualizarLaApp;
