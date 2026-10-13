'use client';

import * as React from 'react';
import Link from 'next/link';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronUp, KeyRound, LogOut, Palette, Settings, Check } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import FichaDeMiCuenta from '@/components/layout/FichaDeMiCuenta';
import { ACENTOS, CAMBIO_DE_COLOR, acentoGuardado, elegirAcento, type Acento } from '@/lib/tema-de-la-app';
import { cn } from '@/lib/utils';

/**
 * TU NOMBRE, ABAJO DE LA BARRA, Y SU MENÚ (octubre 2026)
 *
 * Arriba de la barra se apretaban el nombre, el «?» y la campana: «Prof…»
 * cortado. Cristian lo quiso abajo, como el menú de Claude: el primer nombre
 * y el rol; al pulsarlo, quién eres, tu cuenta, el color de la app, la
 * configuración (el admin) y salir.
 *
 * «Mi cuenta y contraseña» abre la misma ficha que en el teléfono, desde la
 * derecha. Hasta ahora, en el ordenador no había forma de cambiar la
 * contraseña: esa ficha solo se abría desde la cabecera del teléfono.
 */

const ROLES: Record<string, string> = {
    ADMIN: 'Administrador',
    TEACHER: 'Profesor',
    STUDENT: 'Estudiante',
    TUTOR: 'Representante',
};

const FILA =
    'flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#0B1B33] outline-none transition-colors data-[highlighted]:bg-[#EEF3FA] [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:text-[#5B6B82]';

export interface MiNombreYMenuProps {
    nombre: string;
    apellido: string;
    correo?: string;
    avatar?: string | null;
    rol: string;
    liceo?: string;
    recogida: boolean;
    alCerrarSesion: () => void | Promise<void>;
}

export function MiNombreYMenu({ nombre, apellido, correo, avatar, rol, liceo, recogida, alCerrarSesion }: MiNombreYMenuProps) {
    const [fichaAbierta, setFichaAbierta] = React.useState(false);
    const [acento, setAcento] = React.useState<Acento>('turquesa');
    const primerNombre = nombre?.split(' ')[0] || 'Usuario';
    const nombreCompleto = `${nombre ?? ''} ${apellido ?? ''}`.trim() || 'Usuario';
    const esAdmin = rol === 'ADMIN';

    React.useEffect(() => {
        setAcento(acentoGuardado());
        const alCambiar = (e: Event) => setAcento((e as CustomEvent<Acento>).detail);
        window.addEventListener(CAMBIO_DE_COLOR, alCambiar);
        return () => window.removeEventListener(CAMBIO_DE_COLOR, alCambiar);
    }, []);

    return (
        <>
            <Menu.Root>
                <Menu.Trigger asChild>
                    <button
                        type="button"
                        data-recorrido="mi-cuenta"
                        className="group flex h-14 w-full items-center gap-3 rounded-2xl pl-0.5 pr-2 text-left outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50 data-[state=open]:bg-white/[0.14]"
                    >
                        <UserAvatar
                            name={nombreCompleto}
                            src={avatar}
                            className="!h-10 !w-10 !bg-[#90CAF9]"
                            initialsClassName="text-sm !font-extrabold !text-[#0D47A1]"
                        />
                        <span className="flex w-[128px] shrink-0 flex-col transition-opacity duration-150 recogida:opacity-0">
                            <span className="truncate text-sm font-bold text-white">{primerNombre}</span>
                            {/* Con el menú abierto (o el ratón encima) el fondo se aclara: el rol pasa a blanco, si no baja de 4,5:1 (LATERAL-04). */}
                            <span className="truncate text-xs font-medium text-[#BBDEFB] group-hover:text-white group-data-[state=open]:text-white">
                                {ROLES[rol] ?? rol}
                            </span>
                        </span>
                        <ChevronUp
                            className="ml-auto h-4 w-4 shrink-0 self-center text-[#90CAF9] transition-[transform,opacity] duration-200 group-data-[state=open]:rotate-180 recogida:opacity-0"
                            aria-hidden
                        />
                    </button>
                </Menu.Trigger>

                <Menu.Portal>
                    <Menu.Content
                        side={recogida ? 'right' : 'top'}
                        align={recogida ? 'end' : 'start'}
                        sideOffset={recogida ? 14 : 8}
                        collisionPadding={12}
                        className={`z-[60] ${recogida ? 'w-64' : 'w-[var(--radix-dropdown-menu-trigger-width)]'} origin-[--radix-dropdown-menu-content-transform-origin] rounded-2xl bg-white p-1.5 shadow-[0_16px_48px_rgba(4,24,64,0.28),0_2px_6px_rgba(4,24,64,0.12)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97] data-[state=closed]:duration-100 data-[state=open]:duration-150`}
                    >
                        <div className="px-3 pb-2.5 pt-2">
                            <p className="truncate text-sm font-bold text-[#0B1B33]">{nombreCompleto}</p>
                            {correo && <p className="truncate text-xs text-[#5B6B82]">{correo}</p>}
                        </div>
                        <Menu.Separator className="mx-1.5 my-1 h-px bg-[#EDF1F7]" />

                        <Menu.Item className={FILA} onSelect={() => setFichaAbierta(true)}>
                            <KeyRound aria-hidden />
                            Mi cuenta y contraseña
                        </Menu.Item>

                        {/* El color, en dos líneas: así cabe en el ancho de la barra. */}
                        <div className="flex flex-col gap-1.5 px-3 py-2 text-sm font-medium text-[#0B1B33]">
                            <span id="color-de-la-app" className="flex items-center gap-3">
                                <Palette className="h-[18px] w-[18px] shrink-0 text-[#5B6B82]" aria-hidden />
                                Color de la app
                            </span>
                            <Menu.RadioGroup
                                value={acento}
                                onValueChange={(v) => elegirAcento(v as Acento)}
                                aria-labelledby="color-de-la-app"
                                className="flex gap-1 pl-[26px]"
                            >
                                {(Object.keys(ACENTOS) as Acento[]).map((a) => (
                                    <Menu.RadioItem
                                        key={a}
                                        value={a}
                                        // Elegir un color no cierra el menú: se ve el cambio y se sigue.
                                        onSelect={(e) => e.preventDefault()}
                                        aria-label={ACENTOS[a].nombre}
                                        title={ACENTOS[a].nombre}
                                        data-color={a}
                                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full outline-none data-[highlighted]:bg-[#EEF3FA]"
                                    >
                                        <span
                                            className={cn(
                                                'flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 transition-shadow',
                                                a === acento ? 'ring-2 ring-[#0D47A1]' : 'ring-1 ring-black/10'
                                            )}
                                            style={{ backgroundColor: ACENTOS[a].color }}
                                        >
                                            <Menu.ItemIndicator>
                                                <Check className="h-4 w-4 text-[var(--sobre-acento)]" strokeWidth={2.6} aria-hidden />
                                            </Menu.ItemIndicator>
                                        </span>
                                    </Menu.RadioItem>
                                ))}
                            </Menu.RadioGroup>
                        </div>

                        {esAdmin && (
                            <Menu.Item asChild className={FILA}>
                                <Link href="/dashboard/configuracion">
                                    <Settings aria-hidden />
                                    Configuración del liceo
                                </Link>
                            </Menu.Item>
                        )}

                        <Menu.Separator className="mx-1.5 my-1 h-px bg-[#EDF1F7]" />
                        <Menu.Item
                            className={cn(FILA, 'font-semibold text-red-700 data-[highlighted]:bg-red-50 [&>svg]:text-red-600')}
                            onSelect={() => void alCerrarSesion()}
                        >
                            <LogOut aria-hidden />
                            Cerrar sesión
                        </Menu.Item>
                    </Menu.Content>
                </Menu.Portal>
            </Menu.Root>

            <FichaDeMiCuenta
                abierta={fichaAbierta}
                alCerrar={() => setFichaAbierta(false)}
                nombreCompleto={nombreCompleto}
                avatar={avatar}
                rol={rol}
                liceo={liceo}
                esAdmin={esAdmin}
                alCerrarSesion={alCerrarSesion}
                lado="right"
            />
        </>
    );
}

export default MiNombreYMenu;
