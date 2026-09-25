import { AppErrors } from '../middleware/error.middleware';
import { dayOfWeekOf, parseDay } from './school-events.service';

/**
 * REEMPLAZAR UNA CLASE SUSPENDIDA POR OTRA MATERIA
 *
 * Un profesor falta y el liceo no quiere dejar a la sección con una hora libre:
 * otro profesor de la MISMA sección adelanta su clase en ese hueco. Solo el
 * administrador lo decide.
 *
 * Lo que se comprueba antes de aceptarlo, porque cada cosa que falte es un
 * problema real en el liceo:
 *
 *   1. La clase de ese día **está suspendida**. No se reemplaza algo que se va
 *      a dar: saldrían dos profesores para el mismo salón.
 *   2. La materia que entra **es de esa sección y tiene profesor**. El profesor
 *      pasa asistencia y pone notas con sus permisos de siempre, que son los de
 *      las materias que imparte ahí.
 *   3. **El profesor está libre a esa hora ese día**: ni otra clase, ni una hora
 *      personal, ni otro reemplazo. Si la clase que tenía a esa hora también
 *      está suspendida ese día, sí está libre.
 *   4. **El hueco no está ya cubierto** por otro reemplazo.
 *
 * El horario semanal no se toca: el reemplazo es de UN día.
 */

export interface Hueco {
    startTime: string;
    endTime: string;
}

const seSolapan = (a: Hueco, b: Hueco) => a.startTime < b.endTime && b.startTime < a.endTime;

const nombre = (u?: { firstName?: string | null; lastName?: string | null } | null) =>
    [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();

export function esFecha(texto: unknown): texto is string {
    return typeof texto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(texto) && !Number.isNaN(parseDay(texto).getTime());
}

/** Los bloques de esa materia en esa sección ese día de la semana. */
export async function huecosDeLaMateria(
    tx: any,
    classroomId: string,
    subjectId: string,
    fecha: string
): Promise<Hueco[]> {
    const bloques = await tx.scheduleBlock.findMany({
        where: {
            classroomId,
            dayOfWeek: dayOfWeekOf(fecha),
            blockType: 'CLASS',
            classroomSubject: { subjectId },
        },
        select: { startTime: true, endTime: true },
        orderBy: { startTime: 'asc' },
    });
    return bloques;
}

/** ¿Tiene ese profesor algo a esa hora ese día? Devuelve qué, para decírselo al admin. */
async function enQueEstaOcupado(tx: any, teacherId: string, fecha: string, huecos: Hueco[]): Promise<string | null> {
    const dia = parseDay(fecha);
    const dow = dayOfWeekOf(fecha);

    const [clases, personales, reemplazos, suspendidas] = await Promise.all([
        tx.scheduleBlock.findMany({
            where: { dayOfWeek: dow, blockType: 'CLASS', classroomSubject: { teacherId } },
            select: {
                startTime: true,
                endTime: true,
                classroomId: true,
                classroom: { select: { name: true } },
                classroomSubject: { select: { subjectId: true, subject: { select: { name: true } } } },
            },
        }),
        tx.scheduleBlock.findMany({
            where: { dayOfWeek: dow, blockType: 'PERSONAL', teacherId },
            select: { startTime: true, endTime: true, title: true },
        }),
        tx.classReplacement.findMany({
            where: { teacherId, date: dia },
            select: { startTime: true, endTime: true, classroom: { select: { name: true } } },
        }),
        tx.classSession.findMany({
            where: { date: dia, status: 'SUSPENDED' },
            select: { classroomId: true, subjectId: true },
        }),
    ]);

    const libre = new Set(suspendidas.map((s: any) => `${s.classroomId}|${s.subjectId}`));

    for (const h of huecos) {
        for (const c of clases) {
            if (!seSolapan(h, c)) continue;
            if (libre.has(`${c.classroomId}|${c.classroomSubject.subjectId}`)) continue;
            return `tiene ${c.classroomSubject.subject?.name ?? 'clase'} en ${c.classroom?.name ?? 'otra sección'} de ${c.startTime} a ${c.endTime}`;
        }
        for (const p of personales) {
            if (seSolapan(h, p)) return `tiene una hora personal (${p.title ?? 'sin título'}) de ${p.startTime} a ${p.endTime}`;
        }
        for (const r of reemplazos) {
            if (seSolapan(h, r)) return `ya cubre otra clase en ${r.classroom?.name ?? 'otra sección'} de ${r.startTime} a ${r.endTime}`;
        }
    }
    return null;
}

export async function crearReemplazo(
    tx: any,
    datos: {
        classroomId: string;
        suspendedSubjectId: string;
        subjectId: string;
        fecha: string;
        reason?: string | null;
        createdById?: string | null;
    }
) {
    const { classroomId, suspendedSubjectId, subjectId, fecha } = datos;
    const dia = parseDay(fecha);

    if (subjectId === suspendedSubjectId) {
        throw AppErrors.BadRequest('La materia que entra tiene que ser otra');
    }

    const sesion = await tx.classSession.findFirst({
        where: { classroomId, subjectId: suspendedSubjectId, date: dia },
        select: { status: true },
    });
    if (sesion?.status !== 'SUSPENDED') {
        throw Object.assign(AppErrors.Conflict('Solo se puede reemplazar una clase suspendida'), {
            code: 'CLASS_NOT_SUSPENDED',
        });
    }

    const [asignacion, suspendida] = await Promise.all([
        tx.classroomSubject.findUnique({
            where: { classroomId_subjectId: { classroomId, subjectId } },
            select: {
                teacherId: true,
                subject: { select: { name: true } },
                teacher: { select: { id: true, firstName: true, lastName: true, isActive: true } },
            },
        }),
        tx.classroomSubject.findUnique({
            where: { classroomId_subjectId: { classroomId, subjectId: suspendedSubjectId } },
            select: { teacherId: true, subject: { select: { name: true } } },
        }),
    ]);

    if (!asignacion) throw AppErrors.NotFound('Esa materia no es de esta sección');
    if (!asignacion.teacherId || !asignacion.teacher?.isActive) {
        throw Object.assign(AppErrors.Conflict('Esa materia no tiene un profesor activo asignado'), {
            code: 'SUBJECT_WITHOUT_TEACHER',
        });
    }

    const huecos = await huecosDeLaMateria(tx, classroomId, suspendedSubjectId, fecha);
    if (huecos.length === 0) {
        throw Object.assign(AppErrors.Conflict('La materia suspendida no tiene clase ese día en el horario'), {
            code: 'NO_BLOCKS_THAT_DAY',
        });
    }

    const yaCubiertos = await tx.classReplacement.findMany({
        where: { classroomId, date: dia, startTime: { in: huecos.map((h) => h.startTime) } },
        select: { startTime: true },
    });
    if (yaCubiertos.length > 0) {
        throw Object.assign(AppErrors.Conflict('Esa clase ya tiene un reemplazo'), { code: 'ALREADY_REPLACED' });
    }

    const ocupado = await enQueEstaOcupado(tx, asignacion.teacherId, fecha, huecos);
    if (ocupado) {
        throw Object.assign(
            AppErrors.Conflict(`${nombre(asignacion.teacher) || 'El profesor'} no está libre: ${ocupado}`),
            { code: 'TEACHER_BUSY' }
        );
    }

    const razon = datos.reason?.trim() ? datos.reason.trim().slice(0, 200) : null;
    const creados = [];
    for (const h of huecos) {
        creados.push(
            await tx.classReplacement.create({
                data: {
                    classroomId,
                    date: dia,
                    startTime: h.startTime,
                    endTime: h.endTime,
                    suspendedSubjectId,
                    subjectId,
                    teacherId: asignacion.teacherId,
                    reason: razon,
                    createdById: datos.createdById ?? null,
                },
                select: SELECCION,
            })
        );
    }

    return {
        reemplazos: creados,
        profesorQueEntra: asignacion.teacherId as string,
        profesorQueSale: (suspendida?.teacherId as string | null) ?? null,
        materiaQueEntra: asignacion.subject?.name ?? 'otra materia',
        materiaQueSale: suspendida?.subject?.name ?? 'la clase',
    };
}

export const SELECCION = {
    id: true,
    classroomId: true,
    date: true,
    startTime: true,
    endTime: true,
    reason: true,
    suspendedSubject: { select: { id: true, name: true } },
    subject: { select: { id: true, name: true, color: true } },
    teacher: { select: { id: true, firstName: true, lastName: true } },
    classroom: { select: { id: true, name: true } },
} as const;
