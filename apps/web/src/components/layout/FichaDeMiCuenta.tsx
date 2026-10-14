'use client';

import * as React from 'react';
import Link from 'next/link';
import { Settings, LogOut, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import UserAvatar from '@/components/ui/UserAvatar';

/**
 * MI CUENTA
 *
 * Como el menú de Rial (Cristian, 14-oct-2026: «tiene demasiadas
 * configuraciones; solo quiero las principales»): quién soy, Configuración y
 * Cerrar sesión. Lo que vivía aquí —la contraseña, la huella, el bloqueo, las
 * sesiones y el color— está ahora en Configuración, cada cosa en su apartado.
 *
 * Lo de salir importa más de lo que parece: era lo ÚNICO que sacaba de la
 * sesión y estaba al fondo de la cortina, debajo de la barra de gestos del
 * teléfono. Se veía, pero el dedo pulsaba la barra.
 *
 * Lo que NO se puede hacer desde aquí, a propósito: cambiar el nombre, el
 * correo o la foto. Los datos de una persona los pone el liceo, no la persona.
 */

const ROLES: Record<string, string> = {
    ADMIN: 'Administrador',
    TEACHER: 'Profesor',
    STUDENT: 'Estudiante',
    TUTOR: 'Representante',
};

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

export function FichaDeMiCuenta({ abierta, alCerrar, nombreCompleto, avatar, rol, liceo, esAdmin, alCerrarSesion }: FichaDeMiCuentaProps) {
    return (
        <Sheet open={abierta} onOpenChange={(v) => !v && alCerrar()}>
            <SheetContent
                side="bottom"
                // Al abrir, el foco no va a la equis: en el teléfono se veía
                // «como si la hubieran tocado» (el anillo del foco).
                onOpenAutoFocus={(e) => e.preventDefault()}
                /* El hueco de abajo es la barra de gestos del teléfono. */
                className="zona-segura-abajo max-h-[88dvh] overflow-y-auto rounded-t-[28px] bg-gray-50 px-4 pb-4 pt-6"
            >
                <div className="flex items-center gap-3 px-1 pr-12">
                    <UserAvatar name={nombreCompleto} src={avatar} className="h-14 w-14" initialsClassName="text-lg" />
                    <div className="min-w-0">
                        <SheetTitle className="truncate text-base font-bold text-gray-900">{nombreCompleto}</SheetTitle>
                        <p className="truncate text-sm text-gray-600">
                            {ROLES[rol] ?? rol}
                            {liceo ? ` · ${liceo}` : ''}
                        </p>
                    </div>
                </div>

                <nav aria-label="Mi cuenta" className="mt-5 overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                    <Link
                        href="/dashboard/configuracion"
                        onClick={alCerrar}
                        className="flex min-h-[64px] w-full items-center gap-4 px-5 py-3 text-left transition-colors active:bg-gray-100"
                    >
                        <Settings className="h-6 w-6 shrink-0 text-gray-800" aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block text-base text-gray-900">Configuración</span>
                            <span className="block text-sm text-gray-600">
                                {esAdmin ? 'Tu cuenta, la app y el liceo' : 'Tu contraseña, la huella y el color de la app'}
                            </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                    </Link>
                </nav>

                <button
                    type="button"
                    onClick={alCerrarSesion}
                    className="mt-3 flex min-h-[56px] w-full items-center gap-4 rounded-[24px] bg-white px-5 py-3 text-base font-medium text-red-600 ring-1 ring-gray-200 transition-colors active:bg-red-50"
                >
                    <LogOut className="h-6 w-6 shrink-0" aria-hidden />
                    Cerrar sesión
                </button>
            </SheetContent>
        </Sheet>
    );
}

export default FichaDeMiCuenta;
