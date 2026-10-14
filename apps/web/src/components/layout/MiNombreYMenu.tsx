'use client';

import * as React from 'react';
import Link from 'next/link';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronUp, LogOut, Settings } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';

/**
 * TU NOMBRE, ABAJO DE LA BARRA, Y SU MENÚ (octubre 2026)
 *
 * Arriba de la barra se apretaban el nombre, el «?» y la campana: «Prof…»
 * cortado. Cristian lo quiso abajo, como el menú de Claude: el primer nombre
 * y el rol; al pulsarlo, quién eres, Configuración y salir (como el menú de
 * Rial, 14-oct-2026). La contraseña, el color y el modo viven ahora en
 * Configuración, cada uno en su apartado, igual que en el teléfono.
 */

const ROLES: Record<string, string> = {
    ADMIN: 'Administrador',
    TEACHER: 'Profesor',
    STUDENT: 'Estudiante',
    TUTOR: 'Representante',
};

const FILA =
    'flex min-h-[44px] cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-sm font-medium text-texto-fuerte outline-none transition-colors data-[highlighted]:bg-superficie-hover [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:text-texto-gris';

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

export function MiNombreYMenu({ nombre, apellido, correo, avatar, rol, recogida, alCerrarSesion }: MiNombreYMenuProps) {
    const primerNombre = nombre?.split(' ')[0] || 'Usuario';
    const nombreCompleto = `${nombre ?? ''} ${apellido ?? ''}`.trim() || 'Usuario';

    return (
        <>
            <Menu.Root>
                <Menu.Trigger asChild>
                    <button
                        type="button"
                        data-recorrido="mi-cuenta"
                        className="group flex h-14 w-full items-center gap-3 rounded-2xl pl-0.5 pr-2 text-left outline-none transition-colors hover:bg-cabecera-texto/10 focus-visible:ring-2 focus-visible:ring-cabecera-texto/50 data-[state=open]:bg-cabecera-texto/[0.14]"
                    >
                        <UserAvatar
                            name={nombreCompleto}
                            src={avatar}
                            className="!h-10 !w-10 !bg-cabecera-celeste"
                            initialsClassName="text-sm !font-extrabold !text-cabecera-sobreceleste"
                        />
                        <span className="flex w-[128px] shrink-0 flex-col transition-opacity duration-150 recogida:opacity-0">
                            <span className="truncate text-sm font-bold text-cabecera-texto">{primerNombre}</span>
                            {/* Con el menú abierto (o el ratón encima) el fondo se aclara: el rol pasa a blanco, si no baja de 4,5:1 (LATERAL-04). */}
                            <span className="truncate text-xs font-medium text-cabecera-suave group-hover:text-cabecera-texto group-data-[state=open]:text-cabecera-texto">
                                {ROLES[rol] ?? rol}
                            </span>
                        </span>
                        <ChevronUp
                            className="ml-auto h-4 w-4 shrink-0 self-center text-cabecera-suave transition-[transform,opacity] duration-200 group-data-[state=open]:rotate-180 recogida:opacity-0"
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
                        className={`z-[60] ${recogida ? 'w-64' : 'w-[var(--radix-dropdown-menu-trigger-width)]'} origin-[--radix-dropdown-menu-content-transform-origin] rounded-2xl bg-white p-1.5 dark:bg-[#282828] shadow-[0_16px_48px_rgba(4,24,64,0.28),0_2px_6px_rgba(4,24,64,0.12)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.97] data-[state=open]:zoom-in-[0.97] data-[state=closed]:duration-100 data-[state=open]:duration-150`}
                    >
                        <div className="px-3 pb-2.5 pt-2">
                            <p className="truncate text-sm font-bold text-texto-fuerte">{nombreCompleto}</p>
                            {correo && <p className="truncate text-xs text-texto-gris">{correo}</p>}
                        </div>
                        <Menu.Separator className="mx-1.5 my-1 h-px bg-borde-suave dark:bg-[#3e3e3e]" />

                        <Menu.Item asChild className={FILA}>
                            <Link href="/dashboard/configuracion">
                                <Settings aria-hidden />
                                Configuración
                            </Link>
                        </Menu.Item>

                        <Menu.Separator className="mx-1.5 my-1 h-px bg-borde-suave dark:bg-[#3e3e3e]" />
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
        </>
    );
}

export default MiNombreYMenu;
