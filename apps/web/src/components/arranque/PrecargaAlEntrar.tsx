'use client';

import * as React from 'react';
import { CloudOff, CheckCircle2 } from 'lucide-react';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useConexion } from '@/hooks/useConexion';
import { usePagosActivos } from '@/hooks/usePagos';
import { usePaeActivo } from '@/hooks/usePae';
import { useCerrarSesion } from '@/hooks/useCerrarSesion';
import { useAuthStore } from '@/store/auth.store';
import { useOcuparLaPantalla } from '@/lib/turno-de-ofrecer';
import { elMenuDe } from '@/lib/el-menu';
import { elDuenoDeAhora } from '@/lib/el-dueno';
import { bajarTodo, cuandoSeCompleto, enMegas, estaCompleta, seEnsenaLaPrecarga, type Avance } from '@/lib/precarga';
import { LibroQueSeAbre } from '@/components/arranque/LibroQueSeAbre';

/**
 * «DESCARGANDO TU LICEO» — SOLO LA PRIMERA VEZ (como WhatsApp al restaurar)
 *
 * La primera vez que alguien entra en este teléfono, el libro que se abre
 * mientras se baja TODO lo suyo (`lib/precarga.ts`), con los MB: «12,4 de
 * 31 MB». No se puede saltar: así, cuando se vaya la luz, la app está
 * entera. Si se va la conexión a mitad: «Sin conexión. Esperando para
 * seguir descargando…», sin botón para seguir (decidido por Cristian); solo
 * «Cerrar sesión», por si entró con la cuenta que no era. Sigue sola al volver.
 *
 * Las veces siguientes no sale nunca: lo que cambie se baja de fondo
 * (`DescargaEnSegundoPlano`), sin pantalla.
 */

const UN_DIA = 24 * 60 * 60 * 1000;

export function PrecargaAlEntrar() {
    const { yo } = useQuienSoy();
    const { hayConexion } = useConexion();
    const { data: pagos, isFetched: pagosSabido } = usePagosActivos();
    const { data: comedor, isFetched: comedorSabido } = usePaeActivo(yo?.role === 'ADMIN');
    // El menú depende de los módulos del liceo: hasta saberlos, no se pide nada
    // (si no, Pagos o Comedor quedaban fuera de lo descargado).
    const menuSabido = pagosSabido && (yo?.role !== 'ADMIN' || comedorSabido);
    const cerrarSesion = useCerrarSesion();
    const [avance, setAvance] = React.useState<Avance | null>(null);
    const [aLaVista, setALaVista] = React.useState(false);
    const [preguntando, setPreguntando] = React.useState(false);
    const conexion = React.useRef(hayConexion);
    React.useEffect(() => {
        conexion.current = hayConexion;
    }, [hayConexion]);
    const corriendo = React.useRef(false);
    const cancelada = React.useRef(false);

    const menu = React.useMemo(
        () => elMenuDe(yo?.role, Boolean(pagos?.enabled), Boolean(comedor?.enabled)).map((d) => d.href),
        [yo?.role, pagos?.enabled, comedor?.enabled]
    );

    React.useEffect(() => {
        cancelada.current = false;
        return () => {
            cancelada.current = true;
        };
    }, []);

    /**
     * EL LIBRO, ANTES DE PINTAR EL INICIO
     *
     * La descarga espera a saber quién es y qué módulos tiene el liceo (dos
     * preguntas al servidor), y hasta entonces se veía el esqueleto del
     * Inicio y DESPUÉS el libro (lo vio Cristian en su teléfono). Si hay que
     * descargar lo decide lo guardado en el teléfono, que se sabe ya: el
     * libro sale antes de la primera pintada («Preparando la descarga…»).
     */
    const quien = useAuthStore((s) => s.user?.id);
    React.useLayoutEffect(() => {
        if (!quien || !seEnsenaLaPrecarga()) return;
        const dueno = elDuenoDeAhora();
        if (dueno && !estaCompleta(dueno)) setALaVista(true);
    }, [quien]);

    React.useEffect(() => {
        if (!yo?.id || !yo.role || corriendo.current) return;
        if (!seEnsenaLaPrecarga()) return;
        if (!menuSabido) return;
        const dueno = elDuenoDeAhora();
        if (!dueno) return;
        const completa = estaCompleta(dueno);
        // Ya hecha: de fondo, una vez al día como mucho (lo de cada cambio lo
        // trae `DescargaEnSegundoPlano`), y aquí sí esperamos a que el menú esté sabido.
        if (completa) {
            if (Date.now() - cuandoSeCompleto(dueno) < UN_DIA || !hayConexion) return;
        }
        corriendo.current = true;
        // Solo la primera vez, con el libro.
        if (!completa) setALaVista(true);

        void (async () => {
            try {
                const fin = await bajarTodo({
                    dueno,
                    menu,
                    alAvanzar: completa ? undefined : setAvance,
                    hayConexion: () => conexion.current,
                    cancelada: () => cancelada.current || elDuenoDeAhora() !== dueno,
                });
                if (fin === 'listo') window.setTimeout(() => setALaVista(false), 1500);
            } catch {
                // Un fallo de verdad (no de conexión): no se encierra a nadie
                // por un error del servidor; la pasada de fondo lo reintenta.
                setALaVista(false);
            } finally {
                corriendo.current = false;
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yo?.id, yo?.role, hayConexion, menu.length, menuSabido]);

    // Ninguna oferta («¿Te avisamos?», «Descarga la app») encima del libro.
    useOcuparLaPantalla(aLaVista);

    if (!aLaVista) return null;

    const fase = avance?.fase ?? 'empezando';
    const lista = fase === 'listo';
    const esperando = fase === 'esperando';
    const total = avance?.bytesTotales ?? null;
    // El % va por lecturas (exacto desde el principio), no por MB (calculados).
    const proporcion =
        avance?.porcentaje !== undefined
            ? Math.min(1, avance.porcentaje / 100)
            : avance && avance.lecturasTotales
              ? Math.min(1, avance.lecturasHechas / avance.lecturasTotales)
              : null;
    const detalle =
        fase === 'empezando'
            ? 'Preparando la descarga…'
            : fase === 'preparando'
              ? (avance?.porcentaje !== undefined
                  ? `Preparando tu paquete… ${avance.porcentaje} %`
                  : 'Preparando tu paquete…')
            : fase === 'paginas'
              ? 'Terminando…'
              : avance && total
                ? `${enMegas(avance.bytes)} de ${enMegas(total)}${avance.velocidad ? ` · ${enMegas(avance.velocidad)}/s` : ''}`
                : null;
    // Lo que de verdad usa de los datos del teléfono: va comprimido, y es lo
    // que cuenta para quien paga los megas (pedido por Cristian: «ver cuánto
    // está descargando»).
    const nota = avance && avance.bytesPorLaRed > 0 && fase === 'bajando' ? `Datos de internet usados: ${enMegas(avance.bytesPorLaRed)} (va comprimido)` : null;

    return (
        <div
            className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-8 bg-gray-50 px-6 pb-[var(--zona-segura-abajo)] pt-[var(--zona-segura-arriba)]"
            data-precarga={fase}
            role="dialog"
            aria-modal="true"
            aria-label="Descargando tu liceo para usar sin conexión"
        >
            {lista ? (
                <div className="flex flex-col items-center gap-3 text-center">
                    <CheckCircle2 className="h-14 w-14 text-[var(--acento-hondo)]" aria-hidden />
                    <p className="text-lg font-bold text-[#0B1B33]" role="status">
                        Listo: tu liceo ya funciona sin conexión
                    </p>
                </div>
            ) : esperando ? (
                <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                    <CloudOff className="h-12 w-12 text-amber-700 motion-safe:animate-pulse" aria-hidden />
                    <p className="text-lg font-bold text-[#0B1B33]" role="status">
                        Sin conexión
                    </p>
                    <p className="text-sm text-gray-700">Esperando para seguir descargando… Sigue sola en cuanto vuelva la conexión.</p>
                    {avance && total ? (
                        <p className="text-sm font-semibold text-gray-700">
                            {enMegas(avance.bytes)} de {enMegas(total)}
                        </p>
                    ) : null}
                </div>
            ) : (
                <LibroQueSeAbre titulo="Descargando tu liceo…" detalle={detalle} nota={nota} avance={proporcion} />
            )}

            {!lista && (
                <div className="flex flex-col items-center gap-2 text-center">
                    <p className="max-w-xs text-xs text-gray-600">Solo esta vez: después la app funciona aunque no haya conexión.</p>
                    {preguntando ? (
                        <div role="alertdialog" aria-label="¿Cerrar sesión?" className="flex flex-col items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">¿Cerrar sesión en este teléfono?</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPreguntando(false)}
                                    className="min-h-[44px] rounded-full border border-gray-300 px-5 text-sm font-semibold text-gray-800"
                                >
                                    No
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        cancelada.current = true;
                                        void cerrarSesion({ perderLoPendiente: true });
                                    }}
                                    className="min-h-[44px] rounded-full bg-red-700 px-5 text-sm font-bold text-white"
                                >
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setPreguntando(true)}
                            className="min-h-[44px] px-4 text-sm font-semibold text-gray-700 underline underline-offset-4"
                        >
                            Cerrar sesión
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default PrecargaAlEntrar;
