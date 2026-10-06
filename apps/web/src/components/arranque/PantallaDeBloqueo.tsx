'use client';

import * as React from 'react';
import { Fingerprint, LogOut, ShieldAlert } from 'lucide-react';
import { useRelojDelLiceo } from '@/hooks/useSchoolTime';
import { useCerrarSesion } from '@/hooks/useCerrarSesion';
import { laCola } from '@/lib/por-enviar';
import { comoSeLee, type PerfilRecordado } from '@/lib/perfil-recordado';
import { verificarQueEsElDueno } from '@/lib/el-candado';
import { comprobarElPin, comoVanLosFallos, crearElPin, queToca, FALLOS_PARA_CERRAR, type QueToca } from '@/lib/pin-de-la-app';
import { TecladoDelPin } from '@/components/arranque/TecladoDelPin';
import { FondoDeIconos } from '@/components/arranque/FondoDeIconos';

/**
 * LA PANTALLA DE BLOQUEO (como Zinli o el banco)
 *
 * El logo del liceo, la foto, «¡Buenas noches!», el nombre y el rol de quien
 * usa este teléfono, y dos botones: **Ingresar**, que pide la huella o el
 * bloqueo del teléfono (`el-candado.ts`), y **Cerrar sesión**. Si el teléfono
 * no tiene bloqueo, el PIN de 4 números de la app (`pin-de-la-app.ts`).
 *
 * Todo sale de lo guardado en el teléfono (`perfil-recordado.ts`): se ve
 * igual sin conexión.
 */

function saludo(hora: string): string {
    const h = Number(hora.slice(0, 2));
    if (h >= 5 && h < 12) return '¡Buenos días!';
    if (h >= 12 && h < 19) return '¡Buenas tardes!';
    return '¡Buenas noches!';
}

function iniciales(nombre: string, apellido: string): string {
    return `${nombre.trim()[0] ?? ''}${apellido.trim()[0] ?? ''}`.toUpperCase() || '·';
}

type Paso =
    | { tipo: 'inicio'; aviso?: string }
    | { tipo: 'pin'; toca: QueToca; primero?: string; error?: string };

export function PantallaDeBloqueo({ perfil, alAbrir }: { perfil: PerfilRecordado; alAbrir: () => void }) {
    const { hora } = useRelojDelLiceo(60_000);
    const cerrar = useCerrarSesion();
    // La pregunta va aquí mismo: la ventana de «¿seguro?» de la app quedaría
    // debajo de esta pantalla.
    const [preguntando, setPreguntando] = React.useState<null | { pendientes: number }>(null);
    const cerrarSesion = async () => setPreguntando({ pendientes: (await laCola(perfil.dueno)).length });
    const [paso, setPaso] = React.useState<Paso>({ tipo: 'inicio' });
    const [ocupado, setOcupado] = React.useState(false);
    const fallos = comoVanLosFallos(perfil.dueno);

    const ingresar = async () => {
        setOcupado(true);
        try {
            const r = await verificarQueEsElDueno(perfil.nombreDelLiceo ?? '');
            if (r === 'ok') return alAbrir();
            if (r === 'cancelado') return setPaso({ tipo: 'inicio', aviso: 'No se comprobó que seas tú. Vuelve a intentarlo.' });
            setPaso({ tipo: 'pin', toca: await queToca(perfil.dueno) });
        } finally {
            setOcupado(false);
        }
    };

    const conElPin = async (pin: string) => {
        if (paso.tipo !== 'pin') return;
        setOcupado(true);
        try {
            if (paso.toca === 'crear') {
                if (!paso.primero) return setPaso({ ...paso, primero: pin, error: undefined });
                if (paso.primero !== pin) return setPaso({ tipo: 'pin', toca: 'crear', error: 'No coinciden. Empieza de nuevo.' });
                const r = await crearElPin(perfil.dueno, pin);
                if (r === 'ok') return alAbrir();
                if (r === 'ya-tiene') return setPaso({ tipo: 'pin', toca: 'comprobar', error: 'Ya tenías un PIN: escríbelo.' });
                return setPaso({ ...paso, primero: undefined, error: 'Hace falta conexión para crear el PIN.' });
            }
            const r = await comprobarElPin(perfil.dueno, pin);
            if (r === 'ok') return alAbrir();
            const mensajes: Record<string, string> = {
                mal: 'PIN incorrecto.',
                esperar: 'Demasiados intentos. Espera un momento.',
                bloqueado: 'Demasiados intentos. Cierra sesión y entra con tu contraseña.',
                'sin-conexion': 'Hace falta conexión para comprobarlo la primera vez.',
            };
            setPaso({ ...paso, error: mensajes[r] ?? 'No se pudo comprobar.' });
        } finally {
            setOcupado(false);
        }
    };

    const nombreCompleto = `${perfil.nombre} ${perfil.apellido}`.trim();

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-[linear-gradient(180deg,var(--azul-cabecera)_0%,#0B3F94_55%,#082F6E_100%)]"
            role="dialog"
            aria-modal="true"
            aria-label="La app está bloqueada"
            data-pantalla-de-bloqueo
        >
            {/*
             * Dos tercios de azul con el logo grande y los iconos del liceo
             * flotando; abajo, el tercio blanco con la persona y «Ingresar»
             * (diseño de Cristian, 2026-10-06).
             */}
            <FondoDeIconos />
            <div className="relative flex min-h-[38vh] flex-1 flex-col items-center justify-center px-6 pb-16 pt-[calc(var(--zona-segura-arriba)+24px)]">
                {perfil.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={perfil.logo}
                        alt={perfil.nombreDelLiceo ?? 'Logo del liceo'}
                        className="logo-que-respira h-36 w-auto max-w-[260px] object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
                    />
                ) : (
                    <p className="text-2xl font-extrabold text-white">{perfil.nombreDelLiceo ?? 'Gestiedu'}</p>
                )}
                {perfil.logo && perfil.nombreDelLiceo && (
                    <p className="mt-4 text-center text-base font-bold tracking-wide text-white/90">{perfil.nombreDelLiceo}</p>
                )}
            </div>

            <div className="relative flex min-h-[36vh] flex-col items-center rounded-t-[32px] bg-white px-6 pb-[calc(var(--zona-segura-abajo)+20px)] shadow-[0_-12px_32px_rgba(4,24,64,0.25)]">
                <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#90CAF9] text-2xl font-extrabold text-[#0D47A1] shadow-[0_8px_20px_rgba(4,24,64,0.25)] ring-4 ring-white">
                    {perfil.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={perfil.foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                        iniciales(perfil.nombre, perfil.apellido)
                    )}
                </div>
                <p className="mt-3 text-sm font-medium text-gray-600">{saludo(hora)}</p>
                <h1 className="mt-0.5 text-center text-xl font-extrabold text-[#0B1B33]">{nombreCompleto || 'Tu cuenta'}</h1>
                <p className="mt-0.5 text-sm font-semibold text-[var(--acento-hondo)]">{comoSeLee(perfil)}</p>
                {perfil.correo && <p className="mt-0.5 text-xs text-gray-600">{perfil.correo}</p>}

                <div className="mt-5 flex w-full max-w-sm flex-1 flex-col items-center">
                    {paso.tipo === 'pin' ? (
                        paso.toca === 'necesita-conexion' ? (
                            <div className="flex flex-col items-center gap-3 text-center">
                                <ShieldAlert className="h-10 w-10 text-amber-600" aria-hidden />
                                <p className="text-sm text-gray-700">
                                    Tu teléfono no tiene bloqueo de pantalla. Para usar el PIN de la app hace falta conexión la primera vez.
                                </p>
                                <button type="button" onClick={() => setPaso({ tipo: 'inicio' })} className="min-h-[44px] px-4 text-sm font-bold text-[#0D47A1]">
                                    Volver
                                </button>
                            </div>
                        ) : (
                            <>
                                <TecladoDelPin
                                    titulo={
                                        paso.toca === 'crear'
                                            ? paso.primero
                                                ? 'Repite tu PIN'
                                                : 'Crea un PIN de 4 números'
                                            : 'Escribe tu PIN de la app'
                                    }
                                    pista={
                                        paso.toca === 'crear' && !paso.primero
                                            ? 'Tu teléfono no tiene bloqueo de pantalla. Solo un administrador podrá cambiarlo después.'
                                            : fallos.cuantos > 0
                                              ? `Intentos fallidos: ${fallos.cuantos} de ${FALLOS_PARA_CERRAR}`
                                              : null
                                    }
                                    error={paso.error}
                                    ocupado={ocupado || fallos.bloqueado}
                                    alCompletar={conElPin}
                                />
                                <p className="mt-4 text-center text-xs text-gray-600">
                                    Consejo: pon un bloqueo de pantalla a tu teléfono (huella o patrón).
                                </p>
                            </>
                        )
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={ingresar}
                                disabled={ocupado}
                                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--azul-cabecera)] px-6 text-base font-extrabold text-white shadow-[0_8px_20px_rgba(13,71,161,0.25)] transition-transform active:scale-[0.98] disabled:opacity-70"
                            >
                                <Fingerprint className="h-6 w-6" aria-hidden />
                                Ingresar
                            </button>
                            <p className="mt-3 min-h-[20px] text-center text-sm font-medium text-gray-700" role="status">
                                {paso.aviso ?? 'Con tu huella o el bloqueo de tu teléfono'}
                            </p>
                        </>
                    )}

                    {preguntando ? (
                        <div className="mt-auto w-full rounded-2xl bg-white p-4 text-center ring-1 ring-red-200" role="alertdialog" aria-label="¿Cerrar sesión?">
                            <p className="text-sm font-bold text-[#0B1B33]">¿Cerrar sesión en este teléfono?</p>
                            <p className="mt-1 text-xs text-gray-600">
                                {preguntando.pendientes
                                    ? `Tienes ${preguntando.pendientes} cambio(s) sin enviar: se perderán.`
                                    : 'Para volver a entrar harán falta tu correo y tu contraseña.'}
                            </p>
                            <div className="mt-3 flex justify-center gap-2">
                                <button type="button" onClick={() => setPreguntando(null)} className="min-h-[44px] rounded-full px-4 text-sm font-bold text-[#0D47A1]">
                                    No
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void cerrar({ perderLoPendiente: true })}
                                    className="min-h-[44px] rounded-full bg-red-700 px-4 text-sm font-bold text-white"
                                >
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void cerrarSesion()}
                            className="mt-auto flex min-h-[44px] items-center gap-2 px-4 pt-6 text-sm font-bold text-red-700"
                        >
                            <LogOut className="h-4 w-4" aria-hidden />
                            Cerrar sesión
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PantallaDeBloqueo;
