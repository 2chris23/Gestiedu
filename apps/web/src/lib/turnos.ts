/**
 * MAÑANA O TARDE
 *
 * Hay liceos que dan dos veces el mismo año: una sección por la mañana y otra
 * por la tarde. Para quien trabaja ahí, confundirlas es mandar a un profesor a
 * un aula a las siete cuando su clase era a la una.
 *
 * Por eso el turno se dice SIEMPRE igual en toda la aplicación —mismo nombre,
 * mismo color, mismo icono— y desde un solo sitio: si cada pantalla se inventa
 * su etiqueta, el ojo deja de reconocerla. Antes había tres paletas distintas
 * para lo mismo (azul en una lista, ámbar en otra, morado en la tercera).
 *
 * El color no es el único aviso: va con icono y con palabra, para quien no
 * distingue colores.
 */

export type Turno = 'MANANA' | 'TARDE' | 'INTEGRAL';

export interface DatosDelTurno {
    clave: Turno;
    nombre: string;
    /** Cómo se lee en una frase: "sección de la tarde". */
    articulo: string;
    /** Contraste comprobado sobre el fondo de la etiqueta (ver tests/e2e/contraste.spec.ts). */
    clases: string;
    /** Para los puntos y barras de color. */
    fondoFuerte: string;
}

export const TURNOS: Record<Turno, DatosDelTurno> = {
    MANANA: {
        clave: 'MANANA',
        nombre: 'Mañana',
        articulo: 'de la mañana',
        clases: 'bg-sky-50 text-sky-900 border-sky-300',
        fondoFuerte: 'bg-sky-500',
    },
    TARDE: {
        clave: 'TARDE',
        nombre: 'Tarde',
        articulo: 'de la tarde',
        clases: 'bg-amber-50 text-amber-900 border-amber-300',
        fondoFuerte: 'bg-amber-500',
    },
    INTEGRAL: {
        clave: 'INTEGRAL',
        nombre: 'Integral',
        articulo: 'integral',
        clases: 'bg-violet-50 text-violet-900 border-violet-300',
        fondoFuerte: 'bg-violet-500',
    },
};

export const elTurno = (turno?: string | null): DatosDelTurno => TURNOS[(turno as Turno) || 'MANANA'] ?? TURNOS.MANANA;

/** La hora de inicio de un bloque dice a qué turno pertenece. */
export const turnoDeLaHora = (horaDeInicio?: string | null): Turno =>
    horaDeInicio && horaDeInicio >= '12:45' ? 'TARDE' : 'MANANA';

/** Un horario con bloques antes y después del mediodía es de los dos turnos. */
export function turnosDelHorario(bloques: Array<{ startTime: string }>): Turno[] {
    const hay = new Set<Turno>();
    for (const b of bloques) hay.add(turnoDeLaHora(b.startTime));
    return Array.from(hay).sort();
}
