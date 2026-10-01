/**
 * LAS HORAS DEL DÍA
 *
 * Salen de la configuración del liceo, turno por turno: ver
 * `lib/franjas-del-horario.ts`. Antes aquí la tarde empezaba a las 13:00
 * fijas y con las mismas horas que la mañana, y había dos tablas de horas
 * escritas a mano que ya no usaba nadie.
 */
import { franjasDelTurno, type HorarioDelLiceo } from '@/lib/franjas-del-horario';

export type ShiftType = 'MANANA' | 'TARDE' | 'INTEGRAL';

/** La forma vieja de guardar el horario (solo la mañana). Se sigue leyendo. */
export interface ScheduleConfig {
    startTime: string;
    blockDuration: number;
    totalBlocks: number;
    breakAfterBlock: number;
    breakDuration: number;
}

export interface Period {
    id: string;
    startTime: string;
    endTime: string;
    label: string;
    type: 'class' | 'break';
}

export function getOrdinal(n: number): string {
    const ordinals = [
        '0', '1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma', '8va', '9na', '10ma',
        '11ma', '12ma', '13ra', '14ta', '15ta'
    ];
    return ordinals[n] || `${n}ta`;
}

/** Las horas (y recreos) de un turno. INTEGRAL va con la mañana, como hasta ahora. */
export function periodosDelTurno(horario: HorarioDelLiceo | null | undefined, shift: ShiftType = 'MANANA'): Period[] {
    return franjasDelTurno(horario, shift);
}
