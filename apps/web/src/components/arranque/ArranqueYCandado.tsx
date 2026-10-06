'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/auth.store';
import { useEnElMarco } from '@/lib/en-el-marco';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { elPerfilRecordado, type PerfilRecordado } from '@/lib/perfil-recordado';
import {
    abrirElCandado,
    alSalirYVolver,
    apuntarQueSalio,
    apuntarQueVolvio,
    cerrarElCandado,
    esLaApp,
    esconderElIconoDeArranque,
    estaVerificando,
    hayQuePedir,
} from '@/lib/el-candado';
import { LibroQueSeAbre } from '@/components/arranque/LibroQueSeAbre';
import { PantallaDeBloqueo } from '@/components/arranque/PantallaDeBloqueo';
import { quitarLaCortina } from '@/lib/cortina-del-arranque';

/**
 * EL ARRANQUE Y EL CANDADO DE LA APP (octubre 2026, pedido por Cristian)
 *
 * Al abrir la app: el icono de Android (lo deja puesto `SplashScreen` hasta
 * que esto pinta), el libro que se abre, el logo del liceo y luego:
 *
 *   · si en este teléfono hay alguien con la sesión abierta, la pantalla de
 *     bloqueo (`PantallaDeBloqueo`): «Ingresar» con la huella o el bloqueo
 *     del teléfono, o «Cerrar sesión»;
 *   · si no, el login de siempre.
 *
 * Y al volver a la app pasado el tiempo elegido (1 min por defecto, «Mi
 * cuenta»), otra vez el bloqueo. Al irse, una cortina con el logo, para que
 * la miniatura de «apps recientes» no enseñe notas ni nombres.
 *
 * Solo en la app (o con `gestiedu:candado-en-el-navegador` para las pruebas).
 * Lo de detrás queda tapado y sin poder tocarse (`inert`).
 */

const LLAVE_PRUEBAS = 'gestiedu:candado-en-el-navegador';
const LLAVE_ARRANCO = 'gestiedu:arranco';

function seUsaElCandado(): boolean {
    if (esLaApp()) return true;
    try {
        return localStorage.getItem(LLAVE_PRUEBAS) === '1';
    } catch {
        return false;
    }
}

const nada = () => () => {};

export function ArranqueYCandado() {
    const activo = React.useSyncExternalStore(nada, seUsaElCandado, () => false);
    const enMarco = useEnElMarco();
    // Sin candado aquí, la cortina de antes de pintar no tiene quién la quite.
    React.useEffect(() => {
        if (!seUsaElCandado() || enMarco) quitarLaCortina();
    }, [enMarco]);
    if (!activo || enMarco) return null;
    return <ElCandado />;
}

type Fase = 'libro' | 'logo' | 'bloqueo' | 'cortina' | 'libre';

function yaArranco(): boolean {
    try {
        return sessionStorage.getItem(LLAVE_ARRANCO) === '1';
    } catch {
        return false;
    }
}

function ElCandado() {
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const [fase, setFase] = React.useState<Fase>(() => (yaArranco() ? 'cortina' : 'libro'));
    const [perfil, setPerfil] = React.useState<PerfilRecordado | null>(null);
    const hayAlguien = Boolean(user?.id);

    // El perfil que se enseña: lo recordado (foto, logo, año) sobre lo de la sesión.
    React.useEffect(() => {
        if (!user) return setPerfil(null);
        const dueno = elDuenoDeAhora() ?? `?:${user.id}`;
        const recordado = elPerfilRecordado();
        const base: PerfilRecordado = {
            dueno,
            nombre: user.firstName?.split(' ')[0] ?? '',
            apellido: user.lastName?.split(' ')[0] ?? '',
            rol: user.role,
            detalle: null,
            correo: '',
            foto: null,
            logo: null,
            liceo: null,
            nombreDelLiceo: null,
        };
        setPerfil(recordado && recordado.dueno === dueno ? { ...base, ...recordado } : base);
    }, [user, fase]);

    // Qué toca después del arranque (o de una recarga, que no repite el libro).
    const decidir = React.useCallback(() => {
        if (!useAuthStore.getState().user?.id) return setFase('libre');
        setFase(hayQuePedir() ? 'bloqueo' : 'libre');
    }, []);

    // El arranque: libro (~1,4 s) → logo (~0,8 s) → decidir.
    React.useEffect(() => {
        if (!isHydrated) return;
        esconderElIconoDeArranque();
        if (fase === 'cortina') {
            decidir();
            return;
        }
        if (fase !== 'libro') return;
        const a = window.setTimeout(() => setFase('logo'), 1400);
        return () => window.clearTimeout(a);
    }, [fase, isHydrated, decidir]);

    React.useEffect(() => {
        if (fase !== 'logo') return;
        try {
            sessionStorage.setItem(LLAVE_ARRANCO, '1');
        } catch {
            /* nada */
        }
        const t = window.setTimeout(decidir, 800);
        return () => window.clearTimeout(t);
    }, [fase, decidir]);

    // Alguien acaba de entrar con su contraseña: eso ya prueba quién es.
    const antes = React.useRef(hayAlguien);
    React.useEffect(() => {
        if (hayAlguien && !antes.current && fase === 'libre') abrirElCandado();
        if (!hayAlguien) {
            // Cerró sesión (desde el bloqueo o el menú): al login de siempre.
            cerrarElCandado();
            if (fase === 'bloqueo') setFase('libre');
        }
        antes.current = hayAlguien;
    }, [hayAlguien, fase]);

    // Irse y volver.
    React.useEffect(() => {
        return alSalirYVolver(
            () => {
                if (estaVerificando() || !useAuthStore.getState().user?.id) return;
                apuntarQueSalio();
                setFase((f) => (f === 'libre' ? 'cortina' : f));
            },
            () => {
                if (estaVerificando()) return;
                setFase((f) => {
                    if (f !== 'cortina' && f !== 'libre') return f;
                    if (!useAuthStore.getState().user?.id) return 'libre';
                    if (hayQuePedir()) {
                        cerrarElCandado();
                        return 'bloqueo';
                    }
                    apuntarQueVolvio();
                    return 'libre';
                });
            }
        );
    }, []);

    // Lo de detrás, sin poder tocarse ni leerse mientras hay algo encima.
    const tapa = fase !== 'libre';

    // Ya está pintado el libro (o no hay nada que tapar): fuera la cortina
    // de antes de pintar (`lib/cortina-del-arranque.ts`).
    React.useEffect(() => {
        quitarLaCortina();
    }, []);
    React.useEffect(() => {
        if (!tapa) return;
        const otros = Array.from(document.body.children).filter((e) => !(e as HTMLElement).dataset.capaDelCandado);
        otros.forEach((e) => {
            e.setAttribute('inert', '');
            e.setAttribute('aria-hidden', 'true');
        });
        return () =>
            otros.forEach((e) => {
                e.removeAttribute('inert');
                e.removeAttribute('aria-hidden');
            });
    }, [tapa]);

    if (!tapa || typeof document === 'undefined') return null;

    const abrir = () => {
        abrirElCandado();
        setFase('libre');
    };

    return createPortal(
        <div data-capa-del-candado="1" data-candado={fase}>
            {fase === 'bloqueo' && perfil ? (
                <PantallaDeBloqueo perfil={perfil} alAbrir={abrir} />
            ) : (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-50 px-6">
                    {fase === 'libro' ? (
                        <LibroQueSeAbre titulo="Abriendo tu liceo…" avance={null} />
                    ) : perfil?.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={perfil.logo} alt={perfil.nombreDelLiceo ?? 'Logo del liceo'} className="h-28 w-auto max-w-[240px] object-contain motion-safe:animate-aparecer" />
                    ) : (
                        <p className="text-2xl font-extrabold text-[var(--azul-cabecera)] motion-safe:animate-aparecer">
                            {perfil?.nombreDelLiceo ?? 'Gestiedu'}
                        </p>
                    )}
                </div>
            )}
        </div>,
        document.body
    );
}

export default ArranqueYCandado;
