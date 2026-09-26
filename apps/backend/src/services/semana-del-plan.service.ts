import { PrismaClient } from '@prisma/client';
import { planWeekNumberFromRange } from '../utils/plan-weeks';
import { lapsoDeLaFecha } from '../utils/lapso-de-la-actividad';

/**
 * ¿QUÉ SEMANA DEL PLAN ES ESTA FECHA? — UNA SOLA CUENTA PARA TODO
 *
 * La contaban cinco sitios, y no igual:
 *
 *   - la rejilla del plan contaba desde el inicio del LAPSO;
 *   - la clase en vivo y el horario en vivo, desde el inicio del AÑO (el plan
 *     no guarda `fechaDesde`: ninguna pantalla lo escribe). En el 2º y 3er
 *     lapso, la «Semana 5» de la clase no era la Semana 5 del plan;
 *   - y buscaban el plan de la materia sin decir de qué lapso: salía el que
 *     fuera primero.
 *
 * Y hay algo que no contaba nadie: muchos liceos dejan una o dos semanas al
 * empezar el lapso —diagnóstico, adaptación— en las que el profesor da lo que
 * le parece, y el plan de evaluación empieza después. Cada liceo lo pone a su
 * manera en el editor del ciclo (`Period.inicioDelPlan`, libre). Antes de esa
 * fecha la semana es 0 («Diagnóstico», o como lo llame el liceo).
 *
 * El inicio del plan, en este orden: el `fechaDesde` del propio plan (si algún
 * día se escribe), el `inicioDelPlan` del lapso, el inicio del lapso, y si el
 * año no tiene lapsos, el inicio del año (como antes).
 */

export interface SemanaDelPlan {
    /** '1', '2', '3'… (el número del lapso en el año), o null si el año no tiene lapsos. */
    lapso: string | null;
    /** Desde cuándo cuentan las semanas del plan. */
    inicioDelPlan: Date | null;
    /** 0 = antes de que empiece el plan (diagnóstico). */
    semana: number;
    antesDelPlan: boolean;
    /** Cómo se llaman las semanas de antes en este liceo. */
    nombreAntesDelPlan: string;
    /** Semanas del plan en el lapso (de su inicio al final del lapso). */
    semanasDelLapso: number | null;
}

export const NOMBRE_ANTES_DEL_PLAN = 'Diagnóstico';

const DIA = 24 * 60 * 60 * 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const soloDia = (d: Date) => new Date(`${ymd(d)}T00:00:00.000Z`).getTime();

interface LapsoConPlan {
    id: string;
    startDate: Date;
    endDate: Date;
    inicioDelPlan?: Date | null;
    nombreAntesDelPlan?: string | null;
}

/**
 * La cuenta, pura: el lapso de la fecha y su semana del plan. `fechaDesde`
 * manda si viene (un plan con su propio inicio).
 */
export function semanaDelPlanCon(
    fecha: Date,
    lapsos: LapsoConPlan[],
    inicioDelAno: Date | null,
    fechaDesde?: Date | null
): SemanaDelPlan {
    const ordenados = [...lapsos].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const id = lapsoDeLaFecha(ymd(fecha), ordenados);
    const indice = ordenados.findIndex((l) => l.id === id);
    const lapso = indice >= 0 ? ordenados[indice] : null;

    const inicio = fechaDesde ?? lapso?.inicioDelPlan ?? lapso?.startDate ?? inicioDelAno ?? null;
    const nombre = lapso?.nombreAntesDelPlan?.trim() || NOMBRE_ANTES_DEL_PLAN;
    const semanasDelLapso =
        inicio && lapso ? Math.max(1, Math.ceil((lapso.endDate.getTime() - inicio.getTime()) / (7 * DIA))) : null;

    if (!inicio) {
        return { lapso: lapso ? String(indice + 1) : null, inicioDelPlan: null, semana: 1, antesDelPlan: false, nombreAntesDelPlan: nombre, semanasDelLapso };
    }
    const antes = soloDia(fecha) < soloDia(inicio);
    return {
        lapso: lapso ? String(indice + 1) : null,
        inicioDelPlan: inicio,
        semana: antes ? 0 : planWeekNumberFromRange(inicio, fecha),
        antesDelPlan: antes,
        nombreAntesDelPlan: nombre,
        semanasDelLapso,
    };
}

/** La semana del plan de una sección en una fecha (lee los lapsos de su año). */
export async function semanaDelPlan(
    prisma: PrismaClient,
    classroomId: string,
    fecha: Date,
    fechaDesde?: Date | null
): Promise<SemanaDelPlan> {
    const seccion = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            academicYear: {
                select: {
                    startDate: true,
                    periods: {
                        select: { id: true, startDate: true, endDate: true, inicioDelPlan: true, nombreAntesDelPlan: true },
                    },
                },
            },
        },
    });
    return semanaDelPlanCon(
        fecha,
        seccion?.academicYear?.periods ?? [],
        seccion?.academicYear?.startDate ?? null,
        fechaDesde
    );
}
