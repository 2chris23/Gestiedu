/// <reference path="../../types/fastify.d.ts" />
import { franjasDelTurno } from '../../utils/franjas-del-horario';
import { platformPrisma } from '../../config/database';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';

/**
 * Generación Automática de Horario (Auto-Schedule)
 */
/**
 * Generación / Ordenamiento al Azar de horario para una sección
 * Reglas fundamentales:
 * 1. Clases SIEMPRE APILADAS consecutivamente desde la 1ra hora (cero huecos / cero horas libres intermedias).
 * 2. Horarios estándar matutinos (07:00 a 12:30 con recreo 09:15-09:30; 4ta hora inicia a las 09:30).
 * 3. Sin colisiones de profesores (un docente no puede estar en dos aulas a la misma hora).
 * 4. Máximo 2 bloques de la misma materia por día.
 */
export async function autoGenerateSchedule(
    request: FastifyRequest<{ Params: { classroomId: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const prisma = request.tenantPrisma;

        // 1. Obtener todas las materias asignadas a la sección
        const subjects = await prisma.classroomSubject.findMany({
            where: { classroomId },
            include: {
                subject: true,
                teacher: true,
                scheduleBlocks: true,
            },
        });

        if (!subjects || subjects.length === 0) {
            return reply.status(400).send({
                error: 'La sección no tiene materias asignadas',
                code: 'NO_SUBJECTS_ASSIGNED',
            });
        }

        /**
         * LAS HORAS DEL DÍA SON LAS DEL LICEO, Y LAS DE SU TURNO
         *
         * Estaban escritas aquí: 07:00 a 12:30 con el recreo a las 09:15. Una
         * sección de la tarde recibía un horario de mañana, y un liceo con
         * horas de 40 minutos, clases que no caían en ninguna hora de su día.
         * Ahora salen de su configuración (`utils/franjas-del-horario.ts`).
         */
        const seccion = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { shift: true } });
        const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
        const liceo = instituteId
            ? await platformPrisma.institute.findUnique({ where: { id: instituteId }, select: { academicConfig: true } })
            : null;
        const STANDARD_PERIODS = franjasDelTurno((liceo?.academicConfig as any)?.schedule, seccion?.shift)
            .filter((f) => f.type === 'class')
            .map((f, index) => ({ index, startTime: f.startTime, endTime: f.endTime }));
        const DAYS = [1, 2, 3, 4, 5];
        const CAPACIDAD = STANDARD_PERIODS.length * DAYS.length;

        let totalBlocksNeeded = subjects.reduce((sum, s) => sum + (s.weeklyBlocks || 0), 0);

        // Ajustar bloques si exceden lo que cabe en la semana del turno
        const adjustedSubjects = subjects.map(s => {
            let blocks = s.weeklyBlocks || 0;
            if (totalBlocksNeeded > CAPACIDAD) {
                blocks = Math.max(1, Math.round((blocks / totalBlocksNeeded) * CAPACIDAD));
            }
            return { ...s, effectiveBlocks: blocks };
        });

        let adjustedTotal = adjustedSubjects.reduce((sum, s) => sum + s.effectiveBlocks, 0);
        while (adjustedTotal > CAPACIDAD) {
            adjustedSubjects.sort((a, b) => b.effectiveBlocks - a.effectiveBlocks);
            adjustedSubjects[0].effectiveBlocks--;
            adjustedTotal--;
        }
        while (adjustedTotal < Math.min(totalBlocksNeeded, CAPACIDAD - DAYS.length)) {
            adjustedSubjects.sort((a, b) => a.effectiveBlocks - b.effectiveBlocks);
            adjustedSubjects[0].effectiveBlocks++;
            adjustedTotal++;
        }

        // Distribución diaria APILADA (sin huecos)
        const basePerDay = Math.floor(adjustedTotal / 5);
        const remainder = adjustedTotal % 5;
        const targetSlots: Array<{ day: number; startTime: string; endTime: string }> = [];

        DAYS.forEach((day, idx) => {
            const count = basePerDay + (idx < remainder ? 1 : 0);
            for (let p = 0; p < count; p++) {
                targetSlots.push({
                    day,
                    startTime: STANDARD_PERIODS[p].startTime,
                    endTime: STANDARD_PERIODS[p].endTime,
                });
            }
        });

        // Obtener horarios ocupados de profesores en OTRAS secciones
        // Incluye las horas PERSONALES: no tienen sección, así que un
        // `classroomId: { not }` las dejaba fuera y el generador podía colocar
        // una clase encima de la hora de planificación de un profesor.
        const otherBlocks = await prisma.scheduleBlock.findMany({
            where: { OR: [{ classroomId: { not: classroomId } }, { classroomId: null }] },
            include: { classroomSubject: { select: { teacherId: true } } },
        });

        const teacherBusySet = new Set<string>();
        otherBlocks.forEach(b => {
            // Profesor del bloque: el de su asignación (clase) o el dueño (hora personal)
            const busyTeacher = b.teacherId ?? b.classroomSubject?.teacherId;
            if (busyTeacher) {
                teacherBusySet.add(`${busyTeacher}-${b.dayOfWeek}-${b.startTime}`);
            }
        });

        // Crear pool de unidades de clase
        const unitPool: Array<{
            classroomSubjectId: string;
            subjectId: string;
            subjectName: string;
            teacherId: string | null;
        }> = [];

        adjustedSubjects.forEach(s => {
            for (let i = 0; i < s.effectiveBlocks; i++) {
                unitPool.push({
                    classroomSubjectId: s.id,
                    subjectId: s.subjectId,
                    subjectName: s.subject.name,
                    teacherId: s.teacherId,
                });
            }
        });

        // Heurística de asignación aleatoria con reintentos
        let bestAssignments: any[] | null = null;
        const MAX_ATTEMPTS = 100;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const pool = [...unitPool].sort(() => Math.random() - 0.5);
            const assignments: any[] = [];
            const dailySubjectCount: Record<string, number> = {};
            let success = true;

            for (const slot of targetSlots) {
                let foundIdx = -1;

                for (let i = 0; i < pool.length; i++) {
                    const unit = pool[i];
                    const countKey = `${slot.day}-${unit.subjectId}`;
                    const currentDayCount = dailySubjectCount[countKey] || 0;

                    // Máximo 2 bloques de la misma materia por día
                    if (currentDayCount >= 2) continue;

                    // Verificación de conflicto de profesor
                    if (unit.teacherId && teacherBusySet.has(`${unit.teacherId}-${slot.day}-${slot.startTime}`)) {
                        continue;
                    }

                    foundIdx = i;
                    break;
                }

                if (foundIdx === -1) {
                    success = false;
                    break;
                }

                const chosen = pool.splice(foundIdx, 1)[0];
                const countKey = `${slot.day}-${chosen.subjectId}`;
                dailySubjectCount[countKey] = (dailySubjectCount[countKey] || 0) + 1;

                assignments.push({
                    classroomId,
                    classroomSubjectId: chosen.classroomSubjectId,
                    dayOfWeek: slot.day,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    blockType: 'CLASS',
                });
            }

            if (success) {
                bestAssignments = assignments;
                break;
            }
        }

        // Fallback: si no hay forma de cumplir TODAS las reglas, se relaja solo la
        // blanda ("máximo 2 bloques de la misma materia por día"). La dura —un
        // profesor no puede estar en dos sitios a la vez— NUNCA: antes aquí se
        // colocaba la unidad igual (`pool.pop()`), y así se crearon choques
        // heredados. Lo que no quepa queda sin colocar y se informa.
        let unplacedUnits: typeof unitPool = [];
        if (!bestAssignments) {
            const pool = [...unitPool].sort(() => Math.random() - 0.5);
            const assignments: any[] = [];
            for (const slot of targetSlots) {
                let foundIdx = -1;
                for (let i = 0; i < pool.length; i++) {
                    const unit = pool[i];
                    if (unit.teacherId && teacherBusySet.has(`${unit.teacherId}-${slot.day}-${slot.startTime}`)) {
                        continue;
                    }
                    foundIdx = i;
                    break;
                }
                // Nadie cabe en esta franja sin chocar: queda vacía.
                if (foundIdx === -1) continue;
                const chosen = pool.splice(foundIdx, 1)[0];
                if (chosen) {
                    assignments.push({
                        classroomId,
                        classroomSubjectId: chosen.classroomSubjectId,
                        dayOfWeek: slot.day,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        blockType: 'CLASS',
                    });
                }
            }
            bestAssignments = assignments;
            unplacedUnits = pool;
        }

        // Limpiar horario anterior de esta sección y guardar el nuevo ordenado.
        // El horario viejo se guarda: si el generador automático produce algo peor
        // que lo que había, lo anterior no se ha perdido.
        await borrarGuardandoCopia(prisma, 'scheduleBlock', { classroomId }, quienBorra(request as any));

        if (bestAssignments && bestAssignments.length > 0) {
            await prisma.scheduleBlock.createMany({
                data: bestAssignments,
            });
        }

        // Consultar los bloques recién creados con relaciones para devolverlos
        const createdBlocks = await prisma.scheduleBlock.findMany({
            where: { classroomId },
            include: {
                classroomSubject: {
                    include: {
                        subject: { select: { id: true, name: true, code: true, color: true } },
                        teacher: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });

        return reply.status(200).send({
            message: unplacedUnits.length > 0
                ? `Horario reorganizado. ${unplacedUnits.length} bloques no se colocaron para no dejar a un profesor en dos sitios a la vez`
                : 'Horario reorganizado al azar y apilado exitosamente',
            stats: {
                totalAssigned: createdBlocks.length,
                stacked: true,
                hasGaps: unplacedUnits.length > 0,
            },
            scheduleBlocks: createdBlocks,
            unplaced: unplacedUnits.map((u) => ({ subject: u.subjectName, teacherId: u.teacherId })),
        });

    } catch (error) {
        logger.error('Error generando horario automáticamente', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al generar horario',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * Colocar al azar los bloques que le faltan a un profesor.
 *
 * A diferencia del "ordenar al azar" de una sección, aquí NO se borra nada: un
 * profesor toca muchas secciones y regenerar su horario reescribiría el de
 * todas ellas. Se rellenan solo los bloques pendientes (los que el admin asignó
 * y aún no están en la cuadrícula), en huecos donde estén libres a la vez el
 * profesor y la sección destino.
 *
 * Las franjas horarias llegan del cliente porque se derivan de la configuración
 * del instituto (`useSchedulePeriods`), que es configurable por liceo — el
 * servidor no las inventa ni las hardcodea, solo valida su formato.
 */
export async function autoFillTeacherSchedule(
    request: FastifyRequest<{
        Params: { teacherId: string };
        Body: { periods?: Array<{ startTime: string; endTime: string }>; days?: number[] };
    }>,
    reply: FastifyReply
) {
    try {
        const { teacherId } = request.params;
        const { periods = [], days = [1, 2, 3, 4, 5] } = request.body || {};
        const prisma = request.tenantPrisma;

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const validPeriods = periods.filter(
            (p) => timeRegex.test(p?.startTime) && timeRegex.test(p?.endTime) && p.startTime < p.endTime
        );
        if (validPeriods.length === 0) {
            return reply.status(400).send({
                error: 'No se recibieron franjas horarias válidas',
                code: 'NO_PERIODS',
            });
        }
        const validDays = days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        if (validDays.length === 0) {
            return reply.status(400).send({ error: 'No se recibieron días válidos', code: 'NO_DAYS' });
        }

        const result = await prisma.$transaction(async (tx: any) => {
            const assignments = await tx.classroomSubject.findMany({
                where: { teacherId },
                include: {
                    subject: { select: { id: true, name: true } },
                    classroom: { select: { id: true, name: true } },
                    scheduleBlocks: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true } },
                },
            });

            if (assignments.length === 0) {
                const err: any = new Error('Este profesor no tiene materias asignadas');
                err.statusCode = 400;
                err.code = 'NO_SUBJECTS_ASSIGNED';
                throw err;
            }

            // Ocupación actual: del profesor (en cualquier sección) y de cada
            // sección destino (con clases de cualquier profesor).
            const classroomIds = Array.from(new Set(assignments.map((a: any) => a.classroomId)));
            const existing = await tx.scheduleBlock.findMany({
                where: {
                    OR: [
                        { classroomId: { in: classroomIds } },
                        { classroomSubject: { teacherId } },
                    ],
                },
                select: {
                    classroomId: true,
                    dayOfWeek: true,
                    startTime: true,
                    classroomSubject: { select: { teacherId: true, subjectId: true } },
                },
            });

            const slotKey = (day: number, start: string) => day + '|' + start;
            const teacherBusy = new Set<string>();
            const classroomBusy = new Set<string>();
            /** cuántos bloques de una materia ya hay ese día en esa sección */
            const perDayCount = new Map<string, number>();

            for (const b of existing) {
                if (b.classroomSubject?.teacherId === teacherId) {
                    teacherBusy.add(slotKey(b.dayOfWeek, b.startTime));
                }
                classroomBusy.add(b.classroomId + '|' + slotKey(b.dayOfWeek, b.startTime));
                if (b.classroomSubject?.subjectId) {
                    const k = b.classroomId + '|' + b.classroomSubject.subjectId + '|' + b.dayOfWeek;
                    perDayCount.set(k, (perDayCount.get(k) ?? 0) + 1);
                }
            }

            // Un elemento por bloque pendiente, barajados para que el reparto
            // no favorezca siempre a las mismas secciones.
            const pending: any[] = [];
            for (const a of assignments) {
                const missing = (a.weeklyBlocks || 0) - a.scheduleBlocks.length;
                for (let i = 0; i < missing; i++) pending.push(a);
            }
            for (let i = pending.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = pending[i];
                pending[i] = pending[j];
                pending[j] = tmp;
            }

            const slots: Array<{ day: number; startTime: string; endTime: string }> = [];
            for (const day of validDays) {
                for (const p of validPeriods) {
                    slots.push({ day, startTime: p.startTime, endTime: p.endTime });
                }
            }

            const created: any[] = [];
            const unplaced: Array<{ classroom: string; subject: string }> = [];

            for (const assignment of pending) {
                const candidates = slots
                    .filter((s) => !teacherBusy.has(slotKey(s.day, s.startTime)))
                    .filter((s) => !classroomBusy.has(assignment.classroomId + '|' + slotKey(s.day, s.startTime)));

                if (candidates.length === 0) {
                    unplaced.push({
                        classroom: assignment.classroom?.name ?? '',
                        subject: assignment.subject?.name ?? '',
                    });
                    continue;
                }

                // Se prefiere no amontonar más de 2 bloques de la misma materia
                // el mismo día en la misma sección; si no queda otra, se acepta.
                const countKey = (day: number) =>
                    assignment.classroomId + '|' + assignment.subjectId + '|' + day;
                const preferred = candidates.filter((s) => (perDayCount.get(countKey(s.day)) ?? 0) < 2);
                const pool = preferred.length > 0 ? preferred : candidates;
                const chosen = pool[Math.floor(Math.random() * pool.length)];

                created.push(
                    await tx.scheduleBlock.create({
                        data: {
                            classroomId: assignment.classroomId,
                            classroomSubjectId: assignment.id,
                            dayOfWeek: chosen.day,
                            startTime: chosen.startTime,
                            endTime: chosen.endTime,
                            blockType: 'CLASS',
                        },
                    })
                );

                teacherBusy.add(slotKey(chosen.day, chosen.startTime));
                classroomBusy.add(assignment.classroomId + '|' + slotKey(chosen.day, chosen.startTime));
                perDayCount.set(countKey(chosen.day), (perDayCount.get(countKey(chosen.day)) ?? 0) + 1);
            }

            return { created, unplaced };
        });

        return reply.status(200).send({
            message: 'Bloques colocados al azar',
            placed: result.created.length,
            unplaced: result.unplaced,
            blocks: result.created,
        });
    } catch (error) {
        if ((error as any)?.statusCode === 400) {
            return reply.status(400).send({
                error: (error as any).message,
                code: (error as any).code,
            });
        }
        logger.error('Error al colocar bloques al azar del profesor', {
            error: error instanceof Error ? error.message : String(error),
            teacherId: request.params.teacherId,
        });
        return reply.status(500).send({ error: 'Error al colocar bloques al azar', code: 'INTERNAL_SERVER_ERROR' });
    }
}
