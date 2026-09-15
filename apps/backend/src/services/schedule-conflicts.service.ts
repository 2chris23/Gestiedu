/**
 * Detección de choques de horario.
 *
 * FUENTE ÚNICA: un bloque de horario (`ScheduleBlock`) cuelga de un
 * `ClassroomSubject`, que es la asignación *sección + materia + profesor* que
 * hace el admin. Por eso el horario de una sección y el de un profesor son la
 * misma tabla vista desde dos lados, y las dos vistas tienen que validar contra
 * las mismas reglas — si no, mover un bloque desde la vista del profesor podría
 * crear un choque que la vista de la sección jamás habría permitido.
 *
 * Dos reglas, ambas duras:
 *   1. Una sección no puede tener dos bloques solapados (no puede recibir dos
 *      clases a la vez).
 *   2. Un profesor no puede estar en dos sitios a la vez (dos secciones, o una
 *      sección y una hora PERSONAL).
 *
 * CHOQUES HEREDADOS. La regla se introdujo cuando ya había datos que la
 * incumplían (el generador automático relaja la comprobación de profesor si no
 * encuentra hueco, y asignar un profesor a una materia no mira sus bloques).
 * Aplicarla a TODO lo que se envía al guardar dejaba sin poder guardar
 * cualquier sección con un choque antiguo, aunque nadie tocara ese bloque — en
 * el instituto de pruebas, las 20 secciones de 2026-2027. Por eso se separan:
 *   - `blocking`: choques que el guardado CREA o EMPEORA (algún bloque implicado
 *     es nuevo o se movió). Abortan la transacción.
 *   - `preexisting`: choques entre bloques que este guardado no toca. Se
 *     devuelven como aviso y no bloquean, para poder seguir trabajando y
 *     resolverlos poco a poco.
 *
 * Antes esta comprobación vivía suelta dentro de `bulkUpdateSchedule`, se
 * ejecutaba DESPUÉS de commitear la transacción y solo dejaba un `logger.warn`:
 * el horario en conflicto se guardaba igual. Aquí se ejecuta dentro de la
 * transacción para poder abortarla.
 */

export type ScheduleConflictType = 'CLASSROOM_BUSY' | 'TEACHER_BUSY';

export interface ScheduleConflict {
    type: ScheduleConflictType;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    /** Sección implicada. Nulo si el choque es contra una hora personal. */
    classroomId: string | null;
    classroomName: string;
    subjectName: string | null;
    teacherId: string | null;
    teacherName: string | null;
    message: string;
}

/** Bloque tal y como quedaría tras guardar. */
export interface DesiredBlock {
    /** Presente si es un bloque que ya existe y se está moviendo. */
    id?: string;
    /** Nulo en los bloques PERSONAL: no pertenecen a ninguna sección. */
    classroomId?: string | null;
    classroomSubjectId?: string | null;
    /** Dueño de un bloque PERSONAL. En los CLASS el profesor sale del ClassroomSubject. */
    teacherId?: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    blockType?: string | null;
}

export interface ConflictAnalysis {
    /** Choques que el guardado crea o empeora: abortan el guardado. */
    blocking: ScheduleConflict[];
    /** Choques que ya existían entre bloques que este guardado no toca: solo avisan. */
    preexisting: ScheduleConflict[];
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Las horas vienen como "HH:MM" con cero a la izquierda, así que comparar como
 * texto equivale a comparar cronológicamente. Bordes que se tocan (una clase
 * termina 07:45 y la siguiente empieza 07:45) NO son solapamiento.
 */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
}

function dayLabel(day: number): string {
    return DAY_NAMES[day] ?? `Día ${day}`;
}

function personName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
    if (!user) return null;
    return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null;
}

/**
 * Clasifica los choques que provocaría guardar `desiredBlocks`.
 *
 * @param tx            cliente Prisma del tenant (o el `tx` de una transacción)
 * @param desiredBlocks estado final de los bloques que se están guardando
 * @param options.ignoreBlockIds  ids que se van a borrar en la misma operación
 */
export async function analyzeScheduleConflicts(
    tx: any,
    desiredBlocks: DesiredBlock[],
    options: { ignoreBlockIds?: string[] } = {}
): Promise<ConflictAnalysis> {
    const relevant = desiredBlocks.filter((b) => (b.blockType ?? 'CLASS') !== 'BREAK');
    if (relevant.length === 0) return { blocking: [], preexisting: [] };

    // 1. Resolver el profesor de cada bloque entrante (viene por ClassroomSubject).
    const classroomSubjectIds = Array.from(
        new Set(relevant.map((b) => b.classroomSubjectId).filter((id): id is string => Boolean(id)))
    );

    const classroomSubjects = classroomSubjectIds.length
        ? await tx.classroomSubject.findMany({
            where: { id: { in: classroomSubjectIds } },
            select: {
                id: true,
                teacherId: true,
                subject: { select: { name: true } },
                teacher: { select: { id: true, firstName: true, lastName: true } },
            },
        })
        : [];

    const csById = new Map<string, any>(classroomSubjects.map((cs: any) => [cs.id, cs]));
    // Una hora PERSONAL ocupa al profesor igual que una clase, así que el dueño
    // se busca primero en el propio bloque y solo después en su asignación.
    const teacherOf = (b: DesiredBlock): string | null =>
        b.teacherId ?? (b.classroomSubjectId ? csById.get(b.classroomSubjectId)?.teacherId : null) ?? null;

    // 2. Qué bloques NO cambian con este guardado: mismo id, misma sección,
    //    misma asignación y misma franja que lo que ya está en la base.
    const desiredIds = relevant.map((b) => b.id).filter((id): id is string => Boolean(id));
    const persisted = desiredIds.length
        ? await tx.scheduleBlock.findMany({
            where: { id: { in: desiredIds } },
            select: {
                id: true,
                classroomId: true,
                classroomSubjectId: true,
                teacherId: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
            },
        })
        : [];
    const persistedById = new Map<string, any>(persisted.map((p: any) => [p.id, p]));

    const isUnchanged = (b: DesiredBlock): boolean => {
        if (!b.id) return false;
        const p = persistedById.get(b.id);
        if (!p) return false;
        return (
            (b.classroomId ?? null) === (p.classroomId ?? null) &&
            (b.classroomSubjectId ?? null) === (p.classroomSubjectId ?? null) &&
            (b.teacherId ?? null) === (p.teacherId ?? null) &&
            b.dayOfWeek === p.dayOfWeek &&
            b.startTime === p.startTime &&
            b.endTime === p.endTime
        );
    };

    const blocking: ScheduleConflict[] = [];
    const preexisting: ScheduleConflict[] = [];
    const seenBlocking = new Set<string>();
    const seenPreexisting = new Set<string>();
    const record = (c: ScheduleConflict, inherited: boolean) => {
        const key = `${c.type}|${c.classroomId}|${c.dayOfWeek}|${c.startTime}|${c.teacherId ?? ''}`;
        const [list, seen] = inherited ? [preexisting, seenPreexisting] : [blocking, seenBlocking];
        if (seen.has(key)) return;
        seen.add(key);
        list.push(c);
    };

    // 3. Choques DENTRO del propio lote. Solo es heredado si los dos bloques
    //    están exactamente donde ya estaban.
    for (let i = 0; i < relevant.length; i++) {
        for (let j = i + 1; j < relevant.length; j++) {
            const a = relevant[i];
            const b = relevant[j];
            if (a.dayOfWeek !== b.dayOfWeek) continue;
            if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
            const inherited = isUnchanged(a) && isUnchanged(b);

            if (a.classroomId && b.classroomId && a.classroomId === b.classroomId) {
                record(
                    {
                        type: 'CLASSROOM_BUSY',
                        dayOfWeek: a.dayOfWeek,
                        startTime: a.startTime,
                        endTime: a.endTime,
                        classroomId: a.classroomId,
                        classroomName: '',
                        subjectName: a.classroomSubjectId ? csById.get(a.classroomSubjectId)?.subject?.name ?? null : null,
                        teacherId: teacherOf(a),
                        teacherName: personName(a.classroomSubjectId ? csById.get(a.classroomSubjectId)?.teacher : null),
                        message: `La sección ya tiene otra clase el ${dayLabel(a.dayOfWeek)} a las ${a.startTime}.`,
                    },
                    inherited
                );
                continue;
            }

            const teacherA = teacherOf(a);
            if (teacherA && teacherA === teacherOf(b)) {
                const cs = a.classroomSubjectId ? csById.get(a.classroomSubjectId) : null;
                record(
                    {
                        type: 'TEACHER_BUSY',
                        dayOfWeek: a.dayOfWeek,
                        startTime: a.startTime,
                        endTime: a.endTime,
                        classroomId: b.classroomId ?? null,
                        classroomName: '',
                        subjectName: cs?.subject?.name ?? null,
                        teacherId: teacherA,
                        teacherName: personName(cs?.teacher),
                        message: `El profesor quedaría en dos secciones a la vez el ${dayLabel(a.dayOfWeek)} a las ${a.startTime}.`,
                    },
                    inherited
                );
            }
        }
    }

    // 4. Choques contra lo YA guardado. Se excluyen los bloques del propio lote
    //    (se están reescribiendo) y los que se van a borrar en esta operación.
    //    Si el bloque del lote no se movió, el choque ya existía: es heredado.
    const excludedIds = new Set<string>([...desiredIds, ...(options.ignoreBlockIds ?? [])]);

    const days = Array.from(new Set(relevant.map((b) => b.dayOfWeek)));
    const teacherIds = Array.from(new Set(relevant.map(teacherOf).filter((id): id is string => Boolean(id))));
    const classroomIds = Array.from(
        new Set(relevant.map((b) => b.classroomId).filter((id): id is string => Boolean(id)))
    );

    const existing = await tx.scheduleBlock.findMany({
        where: {
            dayOfWeek: { in: days },
            ...(excludedIds.size ? { id: { notIn: Array.from(excludedIds) } } : {}),
            OR: [
                ...(classroomIds.length ? [{ classroomId: { in: classroomIds } }] : []),
                ...(teacherIds.length
                    ? [
                        { classroomSubject: { teacherId: { in: teacherIds } } },
                        // bloques PERSONAL, que no cuelgan de ningún ClassroomSubject
                        { teacherId: { in: teacherIds } },
                    ]
                    : []),
            ],
        },
        select: {
            id: true,
            classroomId: true,
            teacherId: true,
            title: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            blockType: true,
            classroom: { select: { name: true } },
            teacher: { select: { id: true, firstName: true, lastName: true } },
            classroomSubject: {
                select: {
                    teacherId: true,
                    subject: { select: { name: true } },
                    teacher: { select: { id: true, firstName: true, lastName: true } },
                },
            },
        },
    });

    for (const desired of relevant) {
        const desiredTeacher = teacherOf(desired);
        const inherited = isUnchanged(desired);

        for (const other of existing) {
            if ((other.blockType ?? 'CLASS') === 'BREAK') continue;
            if (other.dayOfWeek !== desired.dayOfWeek) continue;
            if (!overlaps(desired.startTime, desired.endTime, other.startTime, other.endTime)) continue;

            if (desired.classroomId && other.classroomId === desired.classroomId) {
                record(
                    {
                        type: 'CLASSROOM_BUSY',
                        dayOfWeek: desired.dayOfWeek,
                        startTime: desired.startTime,
                        endTime: desired.endTime,
                        classroomId: other.classroomId,
                        classroomName: other.classroom?.name ?? '',
                        subjectName: other.classroomSubject?.subject?.name ?? null,
                        teacherId: other.classroomSubject?.teacherId ?? null,
                        teacherName: personName(other.classroomSubject?.teacher),
                        message: `${other.classroom?.name ?? 'La sección'} ya tiene ${other.classroomSubject?.subject?.name ?? 'otra clase'} el ${dayLabel(desired.dayOfWeek)} a las ${other.startTime}.`,
                    },
                    inherited
                );
                continue;
            }

            const otherTeacher = other.teacherId ?? other.classroomSubject?.teacherId ?? null;
            if (desiredTeacher && otherTeacher === desiredTeacher) {
                const isPersonal = (other.blockType ?? 'CLASS') === 'PERSONAL';
                const who =
                    personName(other.classroomSubject?.teacher) ?? personName(other.teacher) ?? 'El profesor';

                record(
                    {
                        type: 'TEACHER_BUSY',
                        dayOfWeek: desired.dayOfWeek,
                        startTime: desired.startTime,
                        endTime: desired.endTime,
                        classroomId: other.classroomId ?? null,
                        classroomName: other.classroom?.name ?? '',
                        subjectName: other.classroomSubject?.subject?.name ?? null,
                        teacherId: desiredTeacher,
                        teacherName: who,
                        message: isPersonal
                            ? `${who} tiene reservada la hora "${other.title ?? 'personal'}" el ${dayLabel(desired.dayOfWeek)} a las ${other.startTime}.`
                            : `${who} ya da ${other.classroomSubject?.subject?.name ?? 'clase'} en ${other.classroom?.name ?? 'otra sección'} el ${dayLabel(desired.dayOfWeek)} a las ${other.startTime}.`,
                    },
                    inherited
                );
            }
        }
    }

    return { blocking, preexisting };
}

/**
 * Los choques que BLOQUEAN el guardado (los que este guardado crea o empeora).
 * Array vacío = se puede guardar. Para obtener también los heredados, usar
 * `analyzeScheduleConflicts`.
 */
export async function findScheduleConflicts(
    tx: any,
    desiredBlocks: DesiredBlock[],
    options: { ignoreBlockIds?: string[] } = {}
): Promise<ScheduleConflict[]> {
    return (await analyzeScheduleConflicts(tx, desiredBlocks, options)).blocking;
}

/**
 * Choques que provocaría ASIGNAR `teacherId` a estas asignaciones
 * (`ClassroomSubject`): sus bloques ya colocados pasarían a ocupar al profesor.
 *
 * Asignar un profesor a una materia que ya tiene bloques era una puerta por la
 * que entraban choques sin pasar por ninguna validación. Solo cuenta
 * TEACHER_BUSY: cambiar de profesor no cambia qué horas ocupa la sección.
 *
 * Pasar solo las asignaciones cuyo profesor CAMBIA: las que ya lo tienen quedan
 * como bloques existentes y se comparan contra las demás.
 */
export async function findTeacherAssignmentConflicts(
    tx: any,
    classroomSubjectIds: string[],
    teacherId: string | null | undefined
): Promise<ScheduleConflict[]> {
    if (!teacherId || classroomSubjectIds.length === 0) return [];

    const blocks = await tx.scheduleBlock.findMany({
        where: { classroomSubjectId: { in: classroomSubjectIds } },
        select: {
            id: true,
            classroomId: true,
            classroomSubjectId: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            blockType: true,
        },
    });
    if (blocks.length === 0) return [];

    // El profesor explícito en cada bloque hace que el análisis lo trate como
    // "cambiado" (se ocupa a alguien nuevo) y lo compare con sus demás horas.
    const { blocking } = await analyzeScheduleConflicts(
        tx,
        blocks.map((b: any) => ({ ...b, teacherId }))
    );
    return blocking.filter((c) => c.type === 'TEACHER_BUSY');
}

/** Error que aborta la transacción cuando hay choques. */
export class ScheduleConflictError extends Error {
    statusCode = 409;
    code = 'SCHEDULE_CONFLICT';
    conflicts: ScheduleConflict[];

    constructor(conflicts: ScheduleConflict[]) {
        super('El horario tiene choques y no se guardó');
        this.name = 'ScheduleConflictError';
        this.conflicts = conflicts;
    }
}
