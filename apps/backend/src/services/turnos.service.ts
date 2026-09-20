import { PrismaClient } from '@prisma/client';

/**
 * EL TURNO DE UNA SECCIÓN
 *
 * Hay liceos que dan el mismo año dos veces: 3er año A por la mañana y 3er año
 * A por la tarde, con otros alumnos y otros profesores. El turno vive en la
 * sección (`classrooms.shift`) y hay que decirlo en todo lo que se pinta con
 * horas: si la pantalla dibuja la rejilla de la mañana para una sección de la
 * tarde, las clases caen fuera de todos los bloques y el horario sale vacío.
 */
export type Turno = 'MANANA' | 'TARDE' | 'INTEGRAL';

export const TURNO_POR_DEFECTO: Turno = 'MANANA';

export async function elTurnoDeLaSeccion(prisma: PrismaClient, classroomId: string): Promise<Turno> {
    const seccion = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { shift: true },
    });
    return ((seccion?.shift as Turno) || TURNO_POR_DEFECTO);
}
