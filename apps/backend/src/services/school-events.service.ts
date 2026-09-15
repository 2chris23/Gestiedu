import { randomUUID } from 'crypto';

/**
 * Eventos del liceo (actos, jornadas, reuniones…).
 *
 * FUENTE ÚNICA de "qué clases caen en una franja": `findClassesInSlot`. La usan
 * a la vez la vista de día del calendario (cuántas clases hay en cada bloque),
 * la vista previa del evento ("se suspenderán N clases") y la suspensión real.
 * Si cada una calculara lo suyo, la vista previa podría prometer 12 clases y el
 * evento suspender 14 — exactamente el tipo de lógica paralela que este
 * proyecto ha pagado caro.
 *
 * Un evento SIEMPRE suspende las clases de su franja y alcance (decisión de
 * producto). La suspensión es el mismo estado que usa Clase en Vivo
 * (`ClassSession.status = 'SUSPENDED'`, que ya muestra "Clase suspendida:
 * <motivo>"), y queda registrada en `suspendedByEventId` para poder deshacerla.
 *
 * Lo que un evento NO hace: fusionar el tema generador del plan de evaluación.
 * `suspendClassSession` (la suspensión manual de un profesor) sí lo hace, porque
 * ahí el profesor pierde su semana. Aplicado a un evento, un acto de UN bloque
 * desplazaría una semana entera el plan de cada materia afectada en cada
 * sección, y esa fusión no es reversible si luego se borra el evento.
 */

export type EventScope = 'INSTITUTE' | 'GRADES' | 'CLASSROOMS';
export const EVENT_SCOPES: EventScope[] = ['INSTITUTE', 'GRADES', 'CLASSROOMS'];

export interface EventInput {
    title: string;
    description?: string | null;
    /** YYYY-MM-DD */
    date: string;
    startTime: string;
    endTime: string;
    scope: EventScope;
    grades?: number[];
    classroomIds?: string[];
    academicYearId?: string;
}

export interface ClassInSlot {
    blockId: string;
    classroomId: string;
    classroomName: string;
    grade: number;
    subjectId: string;
    subjectName: string;
    subjectColor: string | null;
    teacherId: string | null;
    teacherName: string | null;
    startTime: string;
    endTime: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class EventError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

/**
 * Las fechas llegan como "YYYY-MM-DD" y se tratan en UTC, igual que
 * `suspendClassSession`. Con la hora local, "2026-09-14" podría convertirse en
 * el 13 según la zona del servidor y el evento caería en otro día.
 */
export function parseDay(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
}

/** 1 = lunes … 5 = viernes, igual que `ScheduleBlock.dayOfWeek`. */
export function dayOfWeekOf(date: string): number {
    return parseDay(date).getUTCDay();
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
}

function personName(u: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
    if (!u) return null;
    return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || null;
}

export function validateEventInput(input: Partial<EventInput>): EventError | null {
    if (!input.title || !input.title.trim()) {
        return new EventError(400, 'MISSING_TITLE', 'El evento necesita un título');
    }
    if (input.title.trim().length > 150) {
        return new EventError(400, 'TITLE_TOO_LONG', 'El título no puede tener más de 150 caracteres');
    }
    if (!input.date || !DATE_RE.test(input.date) || Number.isNaN(parseDay(input.date).getTime())) {
        return new EventError(400, 'INVALID_DATE', 'Fecha inválida (formato YYYY-MM-DD)');
    }
    // "2026-02-31" se convertiría silenciosamente en el 3 de marzo: se rechaza.
    if (parseDay(input.date).toISOString().slice(0, 10) !== input.date) {
        return new EventError(400, 'INVALID_DATE', 'Esa fecha no existe en el calendario');
    }
    if (!TIME_RE.test(input.startTime || '') || !TIME_RE.test(input.endTime || '')) {
        return new EventError(400, 'INVALID_TIME_FORMAT', 'Formato de hora inválido (HH:MM)');
    }
    if ((input.startTime as string) >= (input.endTime as string)) {
        return new EventError(400, 'INVALID_TIME_RANGE', 'La hora de fin debe ser posterior a la de inicio');
    }
    if (!input.scope || !EVENT_SCOPES.includes(input.scope)) {
        return new EventError(400, 'INVALID_SCOPE', 'Alcance inválido. Opciones: INSTITUTE, GRADES, CLASSROOMS');
    }
    if (input.scope === 'GRADES' && (!Array.isArray(input.grades) || input.grades.length === 0)) {
        return new EventError(400, 'MISSING_GRADES', 'Selecciona al menos un año');
    }
    if (input.scope === 'CLASSROOMS' && (!Array.isArray(input.classroomIds) || input.classroomIds.length === 0)) {
        return new EventError(400, 'MISSING_CLASSROOMS', 'Selecciona al menos una sección');
    }
    return null;
}

/** El ciclo pedido, o el activo si no se indica ninguno. */
export async function resolveAcademicYear(tx: any, academicYearId?: string) {
    const year = academicYearId
        ? await tx.academicYear.findUnique({ where: { id: academicYearId } })
        : await tx.academicYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' } });

    if (!year) {
        throw new EventError(
            404,
            'ACADEMIC_YEAR_NOT_FOUND',
            academicYearId ? 'Ciclo escolar no encontrado' : 'No hay un ciclo escolar activo'
        );
    }
    return year;
}

/** Secciones del ciclo que entran en el alcance del evento. */
export async function classroomsInScope(
    tx: any,
    academicYearId: string,
    scope: EventScope,
    grades: number[] = [],
    classroomIds: string[] = []
) {
    const where: any = { academicYearId };
    if (scope === 'GRADES') where.grade = { in: grades };
    if (scope === 'CLASSROOMS') where.id = { in: classroomIds };

    return tx.classroom.findMany({
        where,
        select: { id: true, name: true, grade: true, section: true },
        orderBy: [{ grade: 'asc' }, { section: 'asc' }],
    });
}

/**
 * FUENTE ÚNICA: las clases que se dan en una franja de un día, para un alcance.
 *
 * Solo cuentan los bloques CLASS con materia asignada: una hora PERSONAL de un
 * profesor no es una clase que suspender, y un bloque sin materia no tiene
 * sesión de clase a la que marcar.
 */
export async function findClassesInSlot(
    tx: any,
    params: {
        academicYearId: string;
        date: string;
        startTime: string;
        endTime: string;
        scope: EventScope;
        grades?: number[];
        classroomIds?: string[];
    }
): Promise<ClassInSlot[]> {
    const classrooms = await classroomsInScope(
        tx,
        params.academicYearId,
        params.scope,
        params.grades,
        params.classroomIds
    );
    if (classrooms.length === 0) return [];

    const byId = new Map<string, any>(classrooms.map((c: any) => [c.id, c]));
    const dow = dayOfWeekOf(params.date);

    const blocks = await tx.scheduleBlock.findMany({
        where: {
            classroomId: { in: classrooms.map((c: any) => c.id) },
            dayOfWeek: dow,
            blockType: 'CLASS',
            classroomSubjectId: { not: null },
        },
        select: {
            id: true,
            classroomId: true,
            startTime: true,
            endTime: true,
            classroomSubject: {
                select: {
                    subjectId: true,
                    subject: { select: { name: true, color: true } },
                    teacher: { select: { id: true, firstName: true, lastName: true } },
                },
            },
        },
        orderBy: [{ startTime: 'asc' }],
    });

    return blocks
        .filter((b: any) => overlaps(b.startTime, b.endTime, params.startTime, params.endTime))
        .map((b: any) => {
            const c = byId.get(b.classroomId);
            return {
                blockId: b.id,
                classroomId: b.classroomId,
                classroomName: c?.name ?? '',
                grade: c?.grade ?? 0,
                subjectId: b.classroomSubject.subjectId,
                subjectName: b.classroomSubject.subject?.name ?? 'Materia',
                subjectColor: b.classroomSubject.subject?.color ?? null,
                teacherId: b.classroomSubject.teacher?.id ?? null,
                teacherName: personName(b.classroomSubject.teacher),
                startTime: b.startTime,
                endTime: b.endTime,
            };
        })
        .sort(
            (a: ClassInSlot, b: ClassInSlot) =>
                a.startTime.localeCompare(b.startTime) || a.grade - b.grade || a.classroomName.localeCompare(b.classroomName)
        );
}

/**
 * Marca como suspendidas las sesiones de clase afectadas por el evento.
 *
 * La sesión de clase es por sección + materia + DÍA (restricción única de
 * `ClassSession`), así que si una materia tiene dos bloques ese día y el evento
 * solo cubre uno, la sesión del día entero queda suspendida. Es una limitación
 * del modelo de sesiones, no de los eventos.
 *
 * Una clase que un profesor ya había suspendido a mano se respeta: no se le
 * cambia el motivo ni se la apropia el evento, para que borrar el evento no
 * deshaga la decisión del profesor.
 */
export async function applyEventSuspensions(
    tx: any,
    event: { id: string; title: string; date: string },
    classes: ClassInSlot[]
): Promise<number> {
    const day = parseDay(event.date);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const reason = `Evento: ${event.title}`;

    const pairs = new Map<string, { classroomId: string; subjectId: string }>();
    for (const c of classes) {
        pairs.set(`${c.classroomId}|${c.subjectId}`, { classroomId: c.classroomId, subjectId: c.subjectId });
    }

    let suspended = 0;
    for (const { classroomId, subjectId } of pairs.values()) {
        const existing = await tx.classSession.findFirst({
            where: { classroomId, subjectId, date: { gte: day, lt: nextDay } },
            select: { id: true, status: true, suspendedByEventId: true },
        });

        if (existing) {
            const suspendedByTeacher = existing.status === 'SUSPENDED' && !existing.suspendedByEventId;
            if (suspendedByTeacher) continue;

            await tx.classSession.update({
                where: { id: existing.id },
                data: { status: 'SUSPENDED', suspendedReason: reason, suspendedByEventId: event.id },
            });
        } else {
            await tx.classSession.create({
                data: {
                    publicId: randomUUID(),
                    classroomId,
                    subjectId,
                    date: day,
                    status: 'SUSPENDED',
                    suspendedReason: reason,
                    suspendedByEventId: event.id,
                },
            });
        }
        suspended++;
    }
    return suspended;
}

/**
 * Deshace las suspensiones de un evento (al borrarlo o al moverlo).
 *
 * Una sesión sin contenido —ni tema, ni observaciones, ni asistencia, ni
 * actividades— equivale a que la clase no se haya abierto todavía (las sesiones
 * se crean al abrir Clase en Vivo), así que se borra. Si tiene contenido, se
 * reactiva y se conserva todo lo registrado.
 */
export async function revertEventSuspensions(tx: any, eventId: string): Promise<number> {
    const sessions = await tx.classSession.findMany({
        where: { suspendedByEventId: eventId },
        select: {
            id: true,
            topic: true,
            observations: true,
            _count: { select: { attendanceRecords: true, activities: true, observationsList: true } },
        },
    });

    for (const s of sessions) {
        const isEmpty =
            !s.topic?.trim() &&
            !s.observations?.trim() &&
            s._count.attendanceRecords === 0 &&
            s._count.activities === 0 &&
            s._count.observationsList === 0;

        if (isEmpty) {
            await tx.classSession.delete({ where: { id: s.id } });
        } else {
            await tx.classSession.update({
                where: { id: s.id },
                data: { status: 'ACTIVE', suspendedReason: null, suspendedByEventId: null },
            });
        }
    }
    return sessions.length;
}
