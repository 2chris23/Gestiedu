'use client';

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
}

export function CabeceraMovil({
    nombre,
    apellido,
    avatar,
    rol,
    liceo,
    esAdmin,
    alCerrarSesion,
}: CabeceraMovilProps) {
    const [fichaAbierta, setFichaAbierta] = React.useState(false);

    React.useEffect(() => {
        const abrir = () => setFichaAbierta(true);
        window.addEventListener(ABRIR_MI_CUENTA, abrir);
        return () => window.removeEventListener(ABRIR_MI_CUENTA, abrir);
    }, []);
    const nombreCompleto = `${nombre ?? ''} ${apellido ?? ''}`.trim() || 'Usuario';
    // En una pantalla de 390 px cabe el nombre de pila y un apellido; un
    // «María de los Ángeles Rodríguez Betancourt» entero empuja la cabecera.
    const comoSeLeLlama = [nombre?.split(' ')[0], apellido?.split(' ')[0]].filter(Boolean).join(' ');

    return (
        <>
            <header className="zona-segura-arriba sticky top-0 z-40 border-b border-gray-200 bg-white lateral:hidden">
                <div className="flex h-14 items-center px-3">
                    <button
                        type="button"
                        onClick={() => setFichaAbierta(true)}
                        aria-haspopup="dialog"
                        aria-expanded={fichaAbierta}
                        className="-ml-1 flex min-h-[44px] items-center gap-2.5 rounded-full px-1 pr-3 text-left transition-colors active:bg-gray-100"
                    >
                        <UserAvatar
                            name={nombreCompleto}
                            src={avatar}
                            className="h-9 w-9"
                            initialsClassName="text-xs"
                        />
                        <span className="truncate text-sm font-semibold text-gray-900">{comoSeLeLlama}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                    </button>
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
