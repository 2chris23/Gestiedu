'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings, KeyRound, LogOut, Smartphone, ChevronRight, Loader2, Fingerprint } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import UserAvatar from '@/components/ui/UserAvatar';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/utils';
import { elLiceoDeLaCookie } from '@/lib/la-puerta-del-liceo';
import { guardarLaLlave, hayHuella, hayLlaveGuardada, laLlaveGuardada, olvidarLaLlave } from '@/lib/la-huella';

/**
 * MI CUENTA
 *
 * En el teléfono ya no hay cortina lateral, así que lo que vivía dentro de
 * ella y no es navegación vive aquí: quién soy, la configuración del liceo
 * —para quien puede tocarla—, cambiar mi contraseña, ver dónde tengo la
 * sesión abierta, y salir.
 *
 * Lo de salir importa más de lo que parece: era lo ÚNICO que sacaba de la
 * sesión y estaba al fondo de la cortina, debajo de la barra de gestos del
 * teléfono. Se veía, pero el dedo pulsaba la barra. Había que girar el móvil
 * para poder cerrar sesión.
 *
 * Lo que NO se puede hacer desde aquí, a propósito: cambiar el nombre, el
 * correo o la foto. Los datos de una persona los pone el liceo, no la persona
 * —tampoco el profesor—, y eso se decide en el servidor; esta pantalla solo
 * se ajusta a la regla en vez de ofrecer un botón que iba a responder 403.
 */

const ROLES: Record<string, string> = {
    ADMIN: 'Administrador',
    TEACHER: 'Profesor',
    STUDENT: 'Estudiante',
    TUTOR: 'Representante',
};

interface SesionAbierta {
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: string;
    lastUsedAt?: string | null;
    isCurrent: boolean;
}

export interface FichaDeMiCuentaProps {
    abierta: boolean;
    alCerrar: () => void;
    nombreCompleto: string;
    avatar?: string | null;
    rol: string;
    liceo?: string;
    esAdmin: boolean;
    alCerrarSesion: () => void | Promise<void>;
}

/** «Mozilla/5.0 (Linux; Android 14; SM-A536B)…» → «Android · Chrome». */
function comoSeLlamaElAparato(userAgent: string | null): string {
    if (!userAgent) return 'Un dispositivo';
    const sistema = /Android/i.test(userAgent)
        ? 'Android'
        : /iPhone|iPad|iOS/i.test(userAgent)
          ? 'iPhone o iPad'
          : /Windows/i.test(userAgent)
            ? 'Windows'
            : /Mac OS/i.test(userAgent)
              ? 'Mac'
              : /Linux/i.test(userAgent)
                ? 'Linux'
                : 'Un dispositivo';
    const navegador = /Edg\//i.test(userAgent)
        ? 'Edge'
        : /OPR\//i.test(userAgent)
          ? 'Opera'
          : /Firefox/i.test(userAgent)
            ? 'Firefox'
            : /Chrome/i.test(userAgent)
              ? 'Chrome'
              : /Safari/i.test(userAgent)
                ? 'Safari'
                : null;
    return navegador ? `${sistema} · ${navegador}` : sistema;
}

export function FichaDeMiCuenta({
    abierta,
    alCerrar,
    nombreCompleto,
    avatar,
    rol,
    liceo,
    esAdmin,
    alCerrarSesion,
}: FichaDeMiCuentaProps) {
    const [cambiandoClave, setCambiandoClave] = React.useState(false);

    return (
        <Sheet open={abierta} onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                /* El hueco de abajo es la barra de gestos del teléfono: sin él,
                   el último botón queda donde el dedo pulsa la barra. */
                className="zona-segura-abajo max-h-[88dvh] overflow-y-auto rounded-t-2xl p-0"
            >
                <div className="px-5 pb-4 pt-6">
                    <div className="flex items-center gap-3">
                        <UserAvatar name={nombreCompleto} src={avatar} className="h-14 w-14" initialsClassName="text-lg" />
                        <div className="min-w-0">
                            <p className="truncate text-base font-bold text-gray-900">{nombreCompleto}</p>
                            <p className="text-sm text-gray-600">{ROLES[rol] ?? rol}</p>
                            {liceo && <p className="truncate text-xs text-gray-500">{liceo}</p>}
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-200">
                    {esAdmin && (
                        <Link
                            href="/dashboard/configuracion"
                            onClick={alCerrar}
                            className="flex min-h-[56px] w-full items-center gap-3 px-5 py-3 text-sm font-medium text-gray-800 transition-colors active:bg-gray-100"
                        >
                            <Settings className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                            <span className="flex-1 text-left">Configuración del liceo</span>
                            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
                        </Link>
                    )}

                    <button
                        type="button"
                        onClick={() => setCambiandoClave((v) => !v)}
                        aria-expanded={cambiandoClave}
                        className="flex min-h-[56px] w-full items-center gap-3 px-5 py-3 text-sm font-medium text-gray-800 transition-colors active:bg-gray-100"
                    >
                        <KeyRound className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                        <span className="flex-1 text-left">Cambiar mi contraseña</span>
                        <ChevronRight
                            className={`h-4 w-4 text-gray-400 transition-transform ${cambiandoClave ? 'rotate-90' : ''}`}
                            aria-hidden
                        />
                    </button>

                    {cambiandoClave && <FormularioDeClave alTerminar={() => setCambiandoClave(false)} />}

                    <LaHuellaDeEsteTelefono visible={abierta} correo={nombreCompleto} />

                    <SesionesAbiertas visible={abierta} />

                    <button
                        type="button"
                        onClick={alCerrarSesion}
                        className="flex min-h-[56px] w-full items-center gap-3 border-t border-gray-200 px-5 py-3 text-sm font-semibold text-red-600 transition-colors active:bg-red-50"
                    >
                        <LogOut className="h-5 w-5 shrink-0" aria-hidden />
                        Cerrar sesión
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

/**
 * ENTRAR CON LA HUELLA EN ESTE TELÉFONO
 *
 * Solo aparece dentro de la app del liceo y solo si el teléfono tiene huella
 * configurada. En un navegador no sale: no hay dónde guardar una llave detrás
 * de una huella, y ofrecerlo sería fingir una seguridad que no está.
 *
 * Lo que se guarda es una llave que emite el servidor, en el almacén de claves
 * del propio Android. La huella abre ese cajón; no entra al sistema. Al
 * apagarlo, la llave se anula en el servidor y se borra del teléfono.
 */
function LaHuellaDeEsteTelefono({ visible, correo }: { visible: boolean; correo: string }) {
    const [sePuede, setSePuede] = React.useState(false);
    const [encendida, setEncendida] = React.useState(false);
    const [trabajando, setTrabajando] = React.useState(false);

    const liceo = React.useMemo(() => elLiceoDeLaCookie(), []);

    React.useEffect(() => {
        if (!visible || !liceo) return;
        let vivo = true;
        (async () => {
            const puede = await hayHuella();
            if (!vivo) return;
            setSePuede(puede);
            if (puede) setEncendida(await hayLlaveGuardada(liceo));
        })();
        return () => {
            vivo = false;
        };
    }, [visible, liceo]);

    if (!sePuede || !liceo) return null;

    const cambiar = async (encender: boolean) => {
        setTrabajando(true);
        try {
            if (encender) {
                const r = await fetch('/api/auth/llave-del-telefono', { method: 'POST' });
                if (!r.ok) throw new Error('No se pudo guardar la llave');
                const { llave } = await r.json();
                const guardada = await guardarLaLlave(liceo, correo, llave);
                if (!guardada) throw new Error('El teléfono no dejó guardar la llave');
                setEncendida(true);
                toast.success('Listo: la próxima vez entras con la huella');
            } else {
                const llave = await laLlaveGuardada(liceo);
                await olvidarLaLlave(liceo);
                await fetch('/api/auth/llave-del-telefono', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ llave }),
                });
                setEncendida(false);
                toast.success('Ya no se entra con la huella en este teléfono');
            }
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'No se pudo cambiar'));
        } finally {
            setTrabajando(false);
        }
    };

    return (
        <label className="flex min-h-[56px] w-full items-center gap-3 border-t border-gray-200 px-5 py-3 text-sm font-medium text-gray-800">
            <Fingerprint className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
            <span className="flex-1">
                Entrar con la huella
                <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    Solo en este teléfono. La primera vez siempre es con contraseña.
                </span>
            </span>
            {trabajando ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
            ) : (
                <input
                    type="checkbox"
                    checked={encendida}
                    onChange={(e) => cambiar(e.target.checked)}
                    className="h-6 w-6 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
            )}
        </label>
    );
}

/** El formulario de la contraseña. El servidor exige 8; aquí se dice antes. */
function FormularioDeClave({ alTerminar }: { alTerminar: () => void }) {
    const [actual, setActual] = React.useState('');
    const [nueva, setNueva] = React.useState('');
    const [repetida, setRepetida] = React.useState('');
    const [enviando, setEnviando] = React.useState(false);

    const enviar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (nueva.length < 8) {
            toast.error('La contraseña nueva necesita al menos 8 caracteres');
            return;
        }
        if (nueva !== repetida) {
            toast.error('Las dos contraseñas nuevas no son iguales');
            return;
        }
        try {
            setEnviando(true);
            await api.post('/auth/change-password', { currentPassword: actual, newPassword: nueva });
            toast.success('Contraseña cambiada');
            setActual('');
            setNueva('');
            setRepetida('');
            alTerminar();
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'No se pudo cambiar la contraseña'));
        } finally {
            setEnviando(false);
        }
    };

    const campo =
        'w-full rounded-lg border border-gray-300 px-3 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

    return (
        <form onSubmit={enviar} className="space-y-3 bg-gray-50 px-5 py-4">
            <input
                type="password"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="Contraseña actual"
                required
                className={campo}
            />
            <input
                type="password"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Contraseña nueva (mínimo 8)"
                required
                className={campo}
            />
            <input
                type="password"
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                placeholder="Repite la contraseña nueva"
                required
                className={campo}
            />
            <button
                type="submit"
                disabled={enviando}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors active:bg-indigo-700 disabled:opacity-60"
            >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Guardar la contraseña nueva
            </button>
        </form>
    );
}

/** Dónde está abierta la sesión. Mirar, no tocar: revocar es otra pantalla. */
function SesionesAbiertas({ visible }: { visible: boolean }) {
    const { data, isLoading } = useQuery({
        queryKey: ['misSesiones'],
        queryFn: async () => (await api.get<{ sessions: SesionAbierta[] }>('/auth/sessions')).data.sessions,
        enabled: visible,
        staleTime: 60_000,
    });

    if (isLoading || !data?.length) return null;

    return (
        <div className="border-t border-gray-200 px-5 py-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Smartphone className="h-4 w-4" aria-hidden />
                Sesión abierta en
            </p>
            <ul className="space-y-1.5">
                {data.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                        <span className="truncate">{comoSeLlamaElAparato(s.userAgent)}</span>
                        {s.isCurrent && (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                este
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default FichaDeMiCuenta;
