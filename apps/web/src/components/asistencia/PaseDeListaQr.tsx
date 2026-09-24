'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, MapPin, MapPinOff, QrCode, ScanLine, UserCheck, X } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import { asistenciaQr, elMotivo, laUbicacion, QUE_PASO, type RegistroDelPase, type VistaDelPase } from '@/lib/asistencia-qr';
import CodigoQr from '@/components/asistencia/CodigoQr';
import EscanerDeQr from '@/components/asistencia/EscanerDeQr';
import { mantenerLaPantallaEncendida } from '@/lib/pantalla-encendida';

/**
 * EL PASE DE LISTA POR QR, EN EL TELÉFONO DEL PROFESOR
 *
 * El profesor deja el teléfono sobre la mesa con el QR a la vista; cada alumno
 * lo escanea desde su app. Debajo del QR van entrando los avisos —«Sofía
 * Andrade, presente, 07:46»— y el profesor, que está en el salón, quita a quien
 * no está de un toque, sin salir de esta pantalla. Arriba, la cuenta: 18 de 32.
 *
 * Al terminar se le enseña quién NO escaneó, que es lo que va a quedar como
 * falta, y puede marcar «estaba» a quien se le olvidó. Nadie queda ausente sin
 * que el profesor lo haya visto en una lista.
 *
 * El código cambia cada 10 s (se pide al servidor justo cuando cambia) y la
 * pantalla no se apaga mientras esto esté abierto.
 */

interface Props {
    classroomId: string;
    subjectId: string;
    /** El día de la clase. Uno pasado abre una CORRECCIÓN. */
    fecha: string;
    /** Al cerrar el pase (o salir sin abrirlo). */
    alTerminar: (cerrado: boolean) => void;
}

const HORA = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

function Etiqueta({ r }: { r: RegistroDelPase }) {
    if (r.estado === 'ACEPTADO') {
        return r.asistencia === 'LATE' ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Tarde</span>
        ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Presente</span>
        );
    }
    if (r.estado === 'POR_CONFIRMAR') return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900">Por confirmar</span>;
    if (r.estado === 'QUITADO') return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">Quitado</span>;
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Rechazado</span>;
}

export function PaseDeListaQr({ classroomId, subjectId, fecha, alTerminar }: Props) {
    const [vista, setVista] = React.useState<VistaDelPase | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [trabajando, setTrabajando] = React.useState<string | null>(null);
    const [escaneando, setEscaneando] = React.useState(false);
    const [ultimoLeido, setUltimoLeido] = React.useState<{ nombre: string; foto: string | null; texto: string; bien: boolean } | null>(null);
    const [cerrando, setCerrando] = React.useState(false);
    const [estaban, setEstaban] = React.useState<Set<string>>(new Set());
    const paseId = vista?.pase.id;

    /**
     * Abrirlo. El faro es dónde está este teléfono, pero el QR no lo espera: la
     * primera vez Android pregunta por el permiso, y el GPS dentro de un aula
     * tarda. Se le dan 3 s; si no llega, el pase se abre igual y el faro se pone
     * en cuanto llegue (`/faro`), antes de que haya escaneado casi nadie.
     */
    React.useEffect(() => {
        let vivo = true;
        (async () => {
            const buscando = laUbicacion(20000);
            const aTiempo = await Promise.race([buscando, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
            try {
                const v = await asistenciaQr.abrir({ classroomId, subjectId, fecha, ubicacion: aTiempo });
                if (!vivo) return;
                setVista(v);
                if (!v.pase.conFaro && !aTiempo) {
                    const u = await buscando;
                    if (u && vivo) setVista(await asistenciaQr.faro(v.pase.id, u));
                }
            } catch (e) {
                if (vivo) setError(elMotivo(e, 'No se pudo abrir el pase de lista.'));
            }
        })();
        return () => {
            vivo = false;
        };
    }, [classroomId, subjectId, fecha]);

    // La pantalla no se apaga mientras el QR está a la vista.
    React.useEffect(() => mantenerLaPantallaEncendida(), []);

    const pedir = React.useCallback(async () => {
        if (!paseId) return;
        try {
            setVista(await asistenciaQr.ver(paseId));
        } catch {
            // Sin conexión un momento: se vuelve a pedir en la próxima vuelta.
        }
    }, [paseId]);

    // El código cambia cada 10 s: se pide justo cuando cambia.
    const cambiaEn = vista?.cambiaEnMs ?? null;
    React.useEffect(() => {
        if (!paseId || cambiaEn == null || cerrando) return;
        const t = setTimeout(() => void pedir(), Math.max(400, cambiaEn + 150));
        return () => clearTimeout(t);
    }, [paseId, cambiaEn, vista?.codigo, pedir, cerrando]);

    // Y cuando alguien escanea, el servidor avisa (sin datos) y se pide.
    React.useEffect(() => {
        if (!paseId) return;
        let pendiente: ReturnType<typeof setTimeout> | null = null;
        const alAviso = (e: Event) => {
            if ((e as CustomEvent).detail?.paseId !== paseId) return;
            if (pendiente) return;
            pendiente = setTimeout(() => {
                pendiente = null;
                void pedir();
            }, 250);
        };
        window.addEventListener('gestiedu:asistencia-qr', alAviso);
        return () => {
            window.removeEventListener('gestiedu:asistencia-qr', alAviso);
            if (pendiente) clearTimeout(pendiente);
        };
    }, [paseId, pedir]);

    const accion = async (registro: RegistroDelPase, que: 'aprobar' | 'quitar') => {
        if (!paseId) return;
        setTrabajando(registro.id);
        try {
            setVista(que === 'aprobar' ? await asistenciaQr.aprobar(paseId, registro.id) : await asistenciaQr.quitar(paseId, registro.id));
        } catch (e) {
            toast.error(elMotivo(e));
        } finally {
            setTrabajando(null);
        }
    };

    const leerAlumno = async (texto: string) => {
        if (!paseId) return false;
        try {
            const r = await asistenciaQr.escanearAlumno(paseId, texto);
            setUltimoLeido({
                nombre: r.alumno.nombre,
                foto: r.alumno.foto,
                texto: r.yaEstaba ? 'ya estaba registrado' : r.asistencia === 'LATE' ? 'tarde' : 'presente',
                bien: true,
            });
            void pedir();
        } catch (e) {
            setUltimoLeido({ nombre: 'No se registró', foto: null, texto: elMotivo(e), bien: false });
        }
        return false; // se sigue leyendo al siguiente
    };

    const cerrar = async () => {
        if (!paseId) return;
        setTrabajando('cerrar');
        try {
            const r = await asistenciaQr.cerrar(paseId, Array.from(estaban));
            toast.success(
                vista?.pase.esCorreccion
                    ? 'Corrección guardada.'
                    : `Pase cerrado: ${vista?.cuenta.registrados ?? 0} por QR${r.presentes ? `, ${r.presentes} a mano` : ''}${r.ausentes ? ` y ${r.ausentes} ${r.ausentes === 1 ? 'ausente' : 'ausentes'}` : ''}.`
            );
            alTerminar(true);
        } catch (e) {
            toast.error(elMotivo(e, 'No se pudo cerrar el pase.'));
        } finally {
            setTrabajando(null);
        }
    };

    const porConfirmar = (vista?.registros ?? []).filter((r) => r.estado === 'POR_CONFIRMAR');
    const lado = 'min(78vw, 42vh, 360px)';

    return (
        <div
            className="fixed inset-0 !m-0 z-[70] flex flex-col bg-white"
            role="dialog"
            aria-modal
            aria-label="Pase de lista por QR"
            style={{ paddingTop: 'var(--zona-segura-arriba)', paddingBottom: 'var(--zona-segura-abajo)' }}
        >
            {/* Cabecera: la clase y la cuenta */}
            <div className="flex items-center gap-2 border-b border-gray-200 px-2 py-1.5">
                <button
                    type="button"
                    onClick={() => (vista ? setCerrando(true) : alTerminar(false))}
                    aria-label="Terminar el pase de lista"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600"
                >
                    <X className="h-6 w-6" />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-gray-900">Pase de lista</p>
                    <p className="truncate text-xs text-gray-600">
                        {[vista?.pase.materia, vista?.pase.seccion].filter(Boolean).join(' · ') || 'Abriendo…'}
                    </p>
                </div>
                {vista && (
                    <div className="shrink-0 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-bold tabular-nums text-indigo-800" aria-live="polite">
                        {vista.cuenta.registrados} de {vista.cuenta.total}
                    </div>
                )}
            </div>

            {error ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
                    <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden />
                    <p className="max-w-sm text-base font-semibold text-gray-900">{error}</p>
                    <button type="button" onClick={() => alTerminar(false)} className="min-h-[44px] rounded-xl bg-gray-900 px-5 text-sm font-bold text-white">
                        Volver a la clase
                    </button>
                </div>
            ) : !vista ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-600">
                    <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                    <p className="text-sm">Abriendo el pase de lista…</p>
                </div>
            ) : cerrando ? (
                /* ── Antes de cerrar: quién queda ausente ─────────────────── */
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto p-4">
                        {vista.pase.esCorreccion ? (
                            <p className="text-sm text-gray-700">
                                Es una corrección: solo cambia lo de quien escaneó. A los demás no se les toca nada.
                            </p>
                        ) : vista.faltan.length === 0 ? (
                            <p className="text-sm font-semibold text-emerald-800">Escanearon todos. Nadie queda ausente.</p>
                        ) : (
                            <>
                                <h2 className="text-base font-bold text-gray-900">
                                    {vista.faltan.length - estaban.size} {vista.faltan.length - estaban.size === 1 ? 'queda ausente' : 'quedan ausentes'}
                                </h2>
                                <p className="mt-1 text-sm text-gray-600">
                                    No escanearon. Si alguno estaba y se le olvidó, márcalo.
                                    {porConfirmar.length > 0 &&
                                        ` Hay ${porConfirmar.length} por confirmar: si no los apruebas, también quedan ausentes.`}
                                </p>
                                <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
                                    {vista.faltan.map((a) => {
                                        const estaba = estaban.has(a.id);
                                        return (
                                            <li key={a.id}>
                                                <button
                                                    type="button"
                                                    aria-pressed={estaba}
                                                    onClick={() =>
                                                        setEstaban((s) => {
                                                            const n = new Set(s);
                                                            if (n.has(a.id)) n.delete(a.id);
                                                            else n.add(a.id);
                                                            return n;
                                                        })
                                                    }
                                                    className="flex min-h-[52px] w-full items-center gap-3 px-3 text-left"
                                                >
                                                    <UserAvatar name={a.nombre} src={a.foto} className="h-8 w-8" initialsClassName="text-xs" />
                                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{a.nombre}</span>
                                                    <span
                                                        className={cn(
                                                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                                                            estaba ? 'bg-emerald-100 text-emerald-800' : 'bg-red-50 text-red-700'
                                                        )}
                                                    >
                                                        {estaba ? 'Estaba' : 'Ausente'}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </>
                        )}
                    </div>
                    <div className="mx-auto flex w-full max-w-2xl gap-2 border-t border-gray-200 p-3">
                        <button
                            type="button"
                            onClick={() => setCerrando(false)}
                            className="min-h-[48px] flex-1 rounded-xl border border-gray-300 text-sm font-bold text-gray-800"
                        >
                            Volver al QR
                        </button>
                        <button
                            type="button"
                            onClick={cerrar}
                            disabled={trabajando === 'cerrar'}
                            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white disabled:opacity-60"
                        >
                            {trabajando === 'cerrar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Cerrar el pase
                        </button>
                    </div>
                </div>
            ) : (
                /* ── El QR y la lista en vivo ─────────────────────────────── */
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
                        {vista.pase.esCorreccion && (
                            <p className="mx-3 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                Corrección del {vista.pase.fecha.split('-').reverse().join('/')}: quien escanee queda presente ese día.
                            </p>
                        )}

                        <div className="flex flex-col items-center px-4 pt-4">
                            <div style={{ width: lado }}>
                                {vista.codigo ? (
                                    <CodigoQr texto={vista.codigo} tamano={360} etiqueta="Código del pase de lista: escanéalo desde tu app" />
                                ) : (
                                    <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-600">
                                        El pase se cerró
                                    </div>
                                )}
                            </div>
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
                                <QrCode className="h-3.5 w-3.5" aria-hidden /> Cambia cada 10 segundos: una foto no sirve.
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                                {vista.pase.conFaro ? (
                                    <>
                                        <MapPin className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Solo cuenta quien esté cerca de este teléfono.
                                    </>
                                ) : (
                                    <>
                                        <MapPinOff className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Sin la ubicación de este teléfono: no se comprueba la distancia.
                                    </>
                                )}
                            </p>
                        </div>

                        <h2 className="px-4 pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-gray-500">
                            {vista.registros.length ? 'Van entrando' : 'Aún no ha escaneado nadie'}
                        </h2>
                        <ul className="divide-y divide-gray-100 px-2 pb-3" aria-live="polite">
                            {vista.registros.map((r) => (
                                <li key={r.id} className={cn('flex items-center gap-3 px-2 py-2', r.estado === 'QUITADO' && 'opacity-50')}>
                                    <UserAvatar name={r.nombre} src={r.foto} className="h-10 w-10" initialsClassName="text-sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-gray-900">{r.nombre}</p>
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-600">
                                            <Etiqueta r={r} />
                                            <span className="tabular-nums">{HORA(r.hora)}</span>
                                            {r.forma === 'PROFESOR_ESCANEA' && <span>lo escaneaste tú</span>}
                                            {r.motivo && QUE_PASO[r.motivo] && (
                                                <span className={r.estado === 'RECHAZADO' ? 'font-semibold text-red-700' : ''}>
                                                    {QUE_PASO[r.motivo]}
                                                    {r.motivo === 'FUERA_DEL_RADIO' && r.distancia != null && ` (${r.distancia} m)`}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    {r.estado === 'POR_CONFIRMAR' && (
                                        <button
                                            type="button"
                                            onClick={() => accion(r, 'aprobar')}
                                            disabled={trabajando === r.id}
                                            aria-label={`Aprobar a ${r.nombre}`}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white disabled:opacity-60"
                                        >
                                            <UserCheck className="h-5 w-5" />
                                        </button>
                                    )}
                                    {(r.estado === 'ACEPTADO' || r.estado === 'POR_CONFIRMAR') && (
                                        <button
                                            type="button"
                                            onClick={() => accion(r, 'quitar')}
                                            disabled={trabajando === r.id}
                                            aria-label={`Quitar a ${r.nombre}: no está en el salón`}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-200 text-red-600 disabled:opacity-60"
                                        >
                                            <X className="h-5 w-5" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mx-auto flex w-full max-w-2xl gap-2 border-t border-gray-200 p-3">
                        <button
                            type="button"
                            onClick={() => {
                                setUltimoLeido(null);
                                setEscaneando(true);
                            }}
                            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800"
                        >
                            <ScanLine className="h-4 w-4" /> Escanear alumnos
                        </button>
                        <button
                            type="button"
                            onClick={() => setCerrando(true)}
                            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white"
                        >
                            <Check className="h-4 w-4" /> Terminar
                        </button>
                    </div>
                </div>
            )}

            {escaneando && (
                <EscanerDeQr
                    titulo="Escanea el QR de cada alumno"
                    ayuda="Comprueba que la foto y el nombre son de quien tienes delante."
                    alLeer={leerAlumno}
                    alCerrar={() => setEscaneando(false)}
                >
                    {ultimoLeido && (
                        <div
                            className={cn(
                                'flex items-center gap-3 rounded-2xl p-3 shadow-lg',
                                ultimoLeido.bien ? 'bg-white' : 'bg-red-50'
                            )}
                            role="status"
                        >
                            {ultimoLeido.bien ? (
                                <UserAvatar name={ultimoLeido.nombre} src={ultimoLeido.foto} className="h-14 w-14" initialsClassName="text-lg" />
                            ) : (
                                <AlertTriangle className="h-8 w-8 shrink-0 text-red-600" aria-hidden />
                            )}
                            <div className="min-w-0">
                                <p className="truncate text-base font-bold text-gray-900">{ultimoLeido.nombre}</p>
                                <p className={cn('text-sm', ultimoLeido.bien ? 'text-emerald-800' : 'text-red-800')}>{ultimoLeido.texto}</p>
                            </div>
                        </div>
                    )}
                </EscanerDeQr>
            )}
        </div>
    );
}

export default PaseDeListaQr;
