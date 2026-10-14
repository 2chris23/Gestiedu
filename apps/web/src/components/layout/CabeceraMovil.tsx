'use client';

import { Campana } from '@/components/layout/Campana';
import { BotonDelRecorrido } from '@/components/common/Recorrido';
import AvisoSinConexion from '@/components/common/AvisoSinConexion';
import { pintarLaBarraDelReloj } from '@/lib/barra-del-reloj';
import { CAMBIO_DE_COLOR, colorDeLaCabecera } from '@/lib/tema-de-la-app';
import { CAMBIO_DE_MODO } from '@/lib/modo-de-la-app';
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import FichaDeMiCuenta from '@/components/layout/FichaDeMiCuenta';

/**
 * LO DE ARRIBA, EN EL TELÉFONO
 *
 * Una foto y un nombre. Nada más.
 *
 * Antes ponía «Gestión Escolar» —que ya se sabe— y un botón de hamburguesa de
 * 24 px que abría una cortina con el menú. Dos problemas de una vez: lo único
 * que decía la cabecera no era información, y el botón era la mitad de lo que
 * necesita un dedo.
 *
 * ─── Y LA BARRA DEL RELOJ ───────────────────────────────────────────────────
 *
 * Esta franja tiene que estar **tapada por algo opaco**, y ese algo es esta
 * cabecera. En un teléfono con muesca la ventana de la app empieza detrás del
 * reloj y la batería (Android 15 lo impone a toda app que apunte a la
 * plataforma 35). Sin reservar ese hueco, el nombre del liceo salía partido
 * por el reloj y los botones de arriba no se podían pulsar, porque el dedo
 * daba en la barra del sistema.
 *
 * El hueco se reserva con `zona-segura-arriba` (globals.css), y el fondo de la
 * cabecera sube hasta el borde para que detrás del reloj haya color y no un
 * trozo de la pantalla anterior. Lo comprueba `npm run movil`.
 */

const ABRIR_MI_CUENTA = 'gestiedu:abrir-mi-cuenta';

/** Los botones redondos sobre el azul: blanco translúcido, como el diseño. */
const SOBRE_AZUL = 'bg-cabecera-texto/[0.12] text-cabecera-texto hover:bg-cabecera-texto/20 hover:text-cabecera-texto';

/** Abre «Mi cuenta» desde fuera de la cabecera (el botón de la barra de abajo). */
export function abrirMiCuenta(): void {
    window.dispatchEvent(new Event(ABRIR_MI_CUENTA));
}

export interface CabeceraMovilProps {
    nombre: string;
    apellido?: string;
    avatar?: string | null;
    rol: string;
    liceo?: string;
    /** El liceo activó el módulo de pagos: cambia lo que se ofrece en la ficha. */
    esAdmin: boolean;
    alCerrarSesion: () => void | Promise<void>;
    /**
     * En el Inicio, la cabecera es azul y sigue en el bloque de arriba (el
     * promedio y las cifras): el diseño «Panel Admin — App móvil».
     */
    azul?: boolean;
    /** En Finanzas, como Rial: el aura del saldo empieza aquí arriba, desde el reloj. */
    aura?: boolean;
}

/** El fondo pintado de un elemento, en #rrggbb (el `theme-color` y Android no leen variables). */
function fondoDe(el: HTMLElement | null): string | null {
    if (!el) return null;
    const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return null;
    return '#' + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
}

const ROL_DE: Record<string, string> = { ADMIN: 'Administrador', TEACHER: 'Profesor', STUDENT: 'Estudiante', TUTOR: 'Representante' };

export function CabeceraMovil({
    nombre,
    apellido,
    avatar,
    rol,
    liceo,
    esAdmin,
    alCerrarSesion,
    azul = false,
    aura = false,
}: CabeceraMovilProps) {
    const [fichaAbierta, setFichaAbierta] = React.useState(false);

    React.useEffect(() => {
        const abrir = () => setFichaAbierta(true);
        window.addEventListener(ABRIR_MI_CUENTA, abrir);
        return () => window.removeEventListener(ABRIR_MI_CUENTA, abrir);
    }, []);

    // La franja del reloj, del mismo azul que la cabecera (la de la APK la
    // pinta Android: `lib/barra-del-reloj.ts`). Al salir, la de siempre.
    // Se repite a los 0,5 y 2 s y al volver a la app: pedido en la primera
    // pintada, el puente con Android aún no estaba y se perdía (moto g13).
    // En las demás pantallas, del fondo de SU cabecera: si no, en modo oscuro
    // la franja se quedaba clara encima de una cabecera negra.
    const cabeceraRef = React.useRef<HTMLElement>(null);
    React.useEffect(() => {
        // Del color de la cabecera de quien mira (y negra en modo oscuro).
        const pintar = () => pintarLaBarraDelReloj(azul ? colorDeLaCabecera() : fondoDe(cabeceraRef.current));
        pintar();
        const relojes = [500, 2000].map((ms) => window.setTimeout(pintar, ms));
        const alVolver = () => document.visibilityState === 'visible' && pintar();
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener(CAMBIO_DE_COLOR, pintar);
        window.addEventListener(CAMBIO_DE_MODO, pintar);
        return () => {
            relojes.forEach((r) => window.clearTimeout(r));
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener(CAMBIO_DE_COLOR, pintar);
            window.removeEventListener(CAMBIO_DE_MODO, pintar);
            pintarLaBarraDelReloj(null);
        };
    }, [azul, aura]);
    const nombreCompleto = `${nombre ?? ''} ${apellido ?? ''}`.trim() || 'Usuario';
    // En una pantalla de 390 px cabe el nombre de pila y un apellido; un
    // «María de los Ángeles Rodríguez Betancourt» entero empuja la cabecera.
    const comoSeLeLlama = [nombre?.split(' ')[0], apellido?.split(' ')[0]].filter(Boolean).join(' ');

    return (
        <>
            <header
                ref={cabeceraRef}
                className={
                    azul
                        ? 'zona-segura-arriba sticky top-0 z-40 bg-cabecera dark:bg-[var(--franja-arriba)] lateral:hidden print:!hidden'
                        : aura
                          ? 'zona-segura-arriba sticky top-0 z-40 bg-cabecera-claro lateral:hidden print:!hidden'
                          : 'zona-segura-arriba sticky top-0 z-40 border-b border-gray-200 bg-white lateral:hidden print:!hidden'
                }
            >
                <div className={azul ? 'flex min-h-[68px] items-center gap-2 px-5 pt-3' : 'flex h-14 items-center px-3'}>
                    <button
                        type="button"
                        onClick={() => setFichaAbierta(true)}
                        aria-haspopup="dialog"
                        aria-expanded={fichaAbierta}
                        data-recorrido="mi-cuenta"
                        className={
                            azul
                                ? 'flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-full text-left'
                                : '-ml-1 flex min-h-[44px] items-center gap-2.5 rounded-full px-1 pr-3 text-left transition-colors active:bg-gray-100'
                        }
                    >
                        <UserAvatar
                            name={nombreCompleto}
                            src={avatar}
                            className={azul ? 'h-11 w-11 !bg-cabecera-celeste' : 'h-9 w-9'}
                            initialsClassName={azul ? 'text-[15px] !font-extrabold !text-cabecera-sobreceleste' : 'text-xs'}
                        />
                        {azul ? (
                            <span className="flex min-w-0 flex-col">
                                <span className="flex min-w-0 items-center gap-1 text-[15px] font-bold text-cabecera-texto">
                                    <span className="truncate">{comoSeLeLlama}</span>
                                    <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                                </span>
                                <span className="truncate text-xs font-medium text-cabecera-suave">
                                    {[ROL_DE[rol] ?? rol, liceo].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                        ) : (
                            <>
                                <span className="truncate text-sm font-semibold text-gray-900">{comoSeLeLlama}</span>
                                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                            </>
                        )}
                    </button>
                    {/* El «?»: cómo funciona esta pantalla (el recorrido guiado). */}
                    <div className={azul ? 'ml-auto flex items-center gap-2' : 'ml-auto flex items-center'}>
                        <AvisoSinConexion enLaCabecera />
                        <BotonDelRecorrido className={azul ? SOBRE_AZUL : undefined} />
                        <Campana className={azul ? SOBRE_AZUL : undefined} />
                    </div>
                </div>
            </header>

            <FichaDeMiCuenta
                abierta={fichaAbierta}
                alCerrar={() => setFichaAbierta(false)}
                nombreCompleto={nombreCompleto}
                avatar={avatar}
                rol={rol}
                liceo={liceo}
                esAdmin={esAdmin}
                alCerrarSesion={alCerrarSesion}
            />
        </>
    );
}

export default CabeceraMovil;
