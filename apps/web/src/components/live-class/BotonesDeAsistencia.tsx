'use client';

import * as React from 'react';
import { ATTENDANCE_CONFIG, AttendanceStatusType } from '@/components/live-class/AnimatedAttendancePicker';
import { cn } from '@/lib/utils';

/**
 * PASAR ASISTENCIA DE UN TOQUE
 *
 * Antes había que tocar a cada alumno, esperar a que se desplegara un menú y
 * elegir. Treinta alumnos son noventa toques y un menú abriéndose y cerrándose
 * todo el rato; en un teléfono, encima, tapando la lista.
 *
 * Aquí los cuatro estados están siempre a la vista: un toque, listo. Se guarda
 * solo.
 */

const ORDEN: AttendanceStatusType[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

interface Props {
    estado: AttendanceStatusType;
    alCambiar: (estado: AttendanceStatusType) => void;
    desactivado?: boolean;
    nombre: string;
}

export function BotonesDeAsistencia({ estado, alCambiar, desactivado, nombre }: Props) {
    return (
        <div className="flex items-center gap-1 sm:gap-1.5" role="group" aria-label={`Asistencia de ${nombre}`}>
            {ORDEN.map((clave) => {
                const def = ATTENDANCE_CONFIG[clave];
                const Icono = def.icon;
                const activo = estado === clave;
                return (
                    <button
                        key={clave}
                        type="button"
                        disabled={desactivado}
                        aria-pressed={activo}
                        onClick={() => alCambiar(clave)}
                        title={def.label}
                        className={cn(
                            // 44 px de alto: el mínimo para un dedo. El ancho se
                            // aprieta en el teléfono para que quepan los cuatro.
                            'flex h-11 items-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition-all disabled:opacity-50 sm:px-2.5',
                            activo
                                ? def.btnActive
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        <Icono className="h-4 w-4" />
                        <span className="hidden sm:inline">{def.label}</span>
                        <span className="sr-only sm:hidden">{def.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default BotonesDeAsistencia;
