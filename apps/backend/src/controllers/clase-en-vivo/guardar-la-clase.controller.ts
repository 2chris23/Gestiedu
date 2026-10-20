import { exigirClasePropia } from './sesion-de-clase.controller';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
    nombreDe,
} from '../../services/cambios-sin-conexion.service';
import { parseDay } from '../../services/school-events.service';
import { logger } from '../../utils/logger';
import { esUnAhoraNoDeLaBase, responderAhoraNo } from '../../utils/error-handler';
import { randomUUID } from 'crypto';
import { RequestUser } from '../../types/fastify';
import { instituteTimezone, isFutureDate, todayInTimezone } from '../../utils/school-time';

/**
 * Crear una nueva sesión de clase
 */
export async function createClassSession(
    request: FastifyRequest<{ Body: { classroomId: string; subjectId: string; date: string; topic?: string; observations?: string; startTime?: string; endTime?: string; } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, topic, observations, startTime, endTime } = request.body;
        const prisma = request.tenantPrisma;

        // Abrir la clase es darla: solo quien la imparte. Antes bastaba ser
        // profesor, de cualquier sección.
        await exigirClasePropia(request, classroomId, subjectId, 'dar clase');

        // La fecha la decide el servidor: con el reloj del dispositivo adelantado
        // (a mano o por VPN) se podría abrir la clase de un día que no ha llegado.
        const zonaLiceo = await instituteTimezone(prisma);
        if (isFutureDate(date, zonaLiceo)) {
            return reply.status(400).send({
                error: 'No se puede registrar una clase de una fecha futura',
                code: 'FUTURE_DATE',
                today: todayInTimezone(zonaLiceo),
            });
        }

        const parsedDate = parseDay(date);
        const startOfDay = new Date(parsedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const sessionData: any = { topic, observations, startTime, endTime };
        
        const session = await prisma.classSession.upsert({
            where: {
                classroomId_subjectId_date: {
                    classroomId,
                    subjectId,
                    date: startOfDay,
                },
            },
            update: sessionData,
            create: {
                publicId: randomUUID(),
                classroomId,
                subjectId,
                date: startOfDay,
                ...sessionData,
            },
        });

        return reply.status(201).send(session);
    } catch (error) {
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error creating class session', {
            error: error instanceof Error ? error.message : String(error)
        });
        return reply.status(500).send({ error: 'Error al crear sesión de clase' });
    }
}

/**
 * Guardar detalle de clase en vivo: crea/actualiza la sesión y la asistencia de los estudiantes.
 */
export async function saveLiveClassSession(
    request: FastifyRequest<{
        Body: {
            classroomId: string;
            subjectId: string;
            date: string;
            topic?: string;
            observations?: string;
            observationsTitle?: string;
            involvedStudentIds?: string[];
            startTime?: string;
            endTime?: string;
            /**
             * `antes`: lo que había cuando se marcó (lo hecho sin conexión). Si otro
             * lo cambió mientras tanto, no se pisa: se pregunta (409).
             */
            attendances?: Array<{ studentId: string; status: string; comments?: string; soloSiNoHay?: boolean; antes?: string | null }>;
            /** «la-mia»: ya se preguntó y se queda lo de quien envía. */
            decision?: 'la-mia';
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId, date, topic, observations, observationsTitle, involvedStudentIds, startTime, endTime, attendances = [], decision } = request.body;
        const prisma = request.tenantPrisma;
        const user = request.user as RequestUser;

        if (!classroomId || !subjectId || !date) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos: classroomId, subjectId, date' });
        }

        await exigirClasePropia(request, classroomId, subjectId, 'dar clase');

        // Una clase de un día que no ha llegado no se guarda: con lo hecho sin
        // conexión, la fecha la puso el reloj del teléfono (SINCON-09).
        const zonaDelLiceo = await instituteTimezone(prisma);
        if (!/^\d{4}-\d{2}-\d{2}/.test(String(date)) || isFutureDate(String(date).slice(0, 10), zonaDelLiceo)) {
            return reply.status(400).send({
                error: 'No se puede guardar una clase de una fecha futura',
                code: 'FUTURE_DATE',
                today: todayInTimezone(zonaDelLiceo),
            });
        }

        // La lista que se pasa es la de ESTA sección. Sin mirarlo, el profesor
        // de 1.º A ponía ausente a un alumno de 1.º B —y le pisaba lo que su
        // profesor ya hubiera marcado ese día—, igual que ya no puede por
        // `/attendance` (`quien-puede-que.test.ts`).
        if (attendances.length > 0) {
            const ids = Array.from(new Set(attendances.map((a) => a.studentId)));
            const deLaSeccion = await prisma.studentClassroom.count({
                where: { classroomId, isActive: true, studentId: { in: ids } },
            });
            if (deLaSeccion !== ids.length) {
                return reply.status(403).send({
                    error: 'Solo se pasa asistencia a los alumnos de esta sección',
                    code: 'STUDENT_NOT_IN_CLASSROOM',
                });
            }
        }

        const parsedDate = new Date(date);
        const startOfDay = new Date(parsedDate);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const result = await prisma.$transaction(
            async (tx: any) => {
            const sessionData: any = { topic, observations, startTime, endTime };
            if (observationsTitle !== undefined) sessionData.observationsTitle = observationsTitle;
            if (involvedStudentIds !== undefined) sessionData.involvedStudentIds = involvedStudentIds;

            // 1. Crear o actualizar sesión de forma atómica con ON CONFLICT
            const session = await tx.classSession.upsert({
                where: {
                    classroomId_subjectId_date: {
                        classroomId,
                        subjectId,
                        date: startOfDay,
                    },
                },
                update: sessionData,
                create: {
                    publicId: randomUUID(),
                    classroomId,
                    subjectId,
                    date: startOfDay,
                    ...sessionData,
                },
            });

            // 2. Registrar la asistencia EN BLOQUE
            //
            // Antes se hacía una consulta por alumno, una detrás de otra. Con 40
            // alumnos son 40 viajes a la base dentro del presupuesto de 5 segundos
            // que Prisma le da a una transacción; bajo carga se pasaba y la clase
            // entera se perdía ("Transaction already closed"). En la prueba de
            // escrituras eran 648 clases perdidas en 20 minutos.
            //
            // Así son unas pocas operaciones sin importar si la sección tiene 10
            // alumnos o 40.
            if (attendances.length > 0) {
                const idsDeAlumnos = attendances.map((a) => a.studentId);

                const yaTenian = new Set(
                    (
                        await tx.dailyAttendance.findMany({
                            where: { date: startOfDay, studentId: { in: idsDeAlumnos } },
                            select: { studentId: true },
                        })
                    ).map((a: { studentId: string }) => a.studentId)
                );

                /**
                 * LO QUE OTRO MARCÓ MIENTRAS TANTO (2026-09-30)
                 *
                 * Lo marcado sin conexión trae lo que había (`antes`). Si ahora
                 * hay otra cosa —y no es lo mismo que se quiere poner—, no se
                 * pisa: se pregunta a quien envía cuál queda.
                 */
                const conAntes = attendances.filter((a) => a.antes !== undefined && !a.soloSiNoHay);
                if (conAntes.length && decision !== 'la-mia') {
                    const hoyHay = await tx.dailyAttendance.findMany({
                        where: { date: startOfDay, studentId: { in: conAntes.map((a) => a.studentId) } },
                        select: { studentId: true, status: true, teacherId: true, modificadoPorId: true },
                    });
                    const porAlumno = new Map<string, any>(hoyHay.map((a: any) => [a.studentId, a]));
                    const choques = conAntes
                        .map((a) => {
                            const hay = porAlumno.get(a.studentId);
                            const ahora = hay?.status ?? null;
                            if (ahora === (a.antes ?? null) || ahora === a.status) return null;
                            // Lo que él mismo marcó mientras tanto (otra pestaña, la clase
                            // que se guardó sola al salir) no es «otra persona».
                            if (user?.userId && (hay?.modificadoPorId ?? hay?.teacherId) === user.userId) return null;
                            return { studentId: a.studentId, antes: a.antes ?? null, ahora, tuya: a.status, quien: hay?.modificadoPorId ?? hay?.teacherId ?? null };
                        })
                        .filter(Boolean);
                    if (choques.length) {
                        throw Object.assign(new Error('Mientras tanto otra persona cambió esta asistencia: elige cuál queda'), {
                            statusCode: 409,
                            code: 'CAMBIO_MIENTRAS_TANTO',
                            choques,
                        });
                    }
                }

                const nuevas = attendances.filter((a) => !yaTenian.has(a.studentId));
                if (nuevas.length > 0) {
                    await tx.dailyAttendance.createMany({
                        data: nuevas.map((a) => ({
                            studentId: a.studentId,
                            classroomId,
                            status: a.status,
                            comments: a.comments,
                            date: startOfDay,
                            teacherId: user?.userId,
                            classSessionId: session.id,
                        })),
                        skipDuplicates: true,
                    });
                }

                // Las que ya estaban se corrigen agrupadas por lo que se les pone:
                // casi siempre son dos o tres grupos (presente, ausente, tarde).
                const porLoQueSeLesPone = new Map<string, string[]>();
                for (const a of attendances) {
                    if (!yaTenian.has(a.studentId)) continue;
                    // «Solo si no hay»: lo que la pantalla NO tocó y manda como
                    // se ve (presente por defecto). Si ya hay algo guardado —otra
                    // pantalla lo marcó mientras tanto—, se respeta (ASIS-DOS-01,
                    // SOLO-01…03). Antes se pisaba y un ausente volvía a presente.
                    if (a.soloSiNoHay) continue;
                    const clave = `${a.status}\u0000${a.comments ?? ''}`;
                    const grupo = porLoQueSeLesPone.get(clave);
                    if (grupo) grupo.push(a.studentId);
                    else porLoQueSeLesPone.set(clave, [a.studentId]);
                }

                for (const [clave, ids] of porLoQueSeLesPone) {
                    const [status, comentario] = clave.split('\u0000');
                    await tx.dailyAttendance.updateMany({
                        where: { date: startOfDay, studentId: { in: ids } },
                        data: {
                            status: status as any,
                            comments: comentario === '' ? null : comentario,
                            classSessionId: session.id,
                            modificadoPorId: user?.userId ?? null,
                        },
                    });
                }
            }

            // 3. Vincular observaciones de esta sección y materia creadas en esta fecha que no tenían classSessionId
            const obsDateLte = new Date(startOfDay.getTime() + 30 * 3600 * 1000);
            await tx.observation.updateMany({
                where: {
                    classroomId,
                    subjectId,
                    date: { gte: startOfDay, lte: obsDateLte },
                    classSessionId: null,
                },
                data: { classSessionId: session.id },
            });

                return session;
            },
            {
                // Bajo carga la base responde más lento; con el presupuesto justo de
                // 5 s la clase se perdía entera. Ahora la operación es corta, pero se
                // le deja aire para no perder el trabajo del profesor por un pico.
                timeout: 20000,
                maxWait: 10000,
            }
        );

        // Guardar la clase mueve la asistencia de esa sección: le toca a esos
        // alumnos, a sus representantes y al personal de la sección. A los demás
        // no les cambió nada.
        request.aQuienAfecta = {
            studentIds: (attendances || []).map((a) => a.studentId).filter(Boolean),
            classroomId,
        };

        return reply.status(200).send({ success: true, session: result });
    } catch (error) {
        if ((error as any)?.code === 'CAMBIO_MIENTRAS_TANTO') {
            const choques = (error as any).choques as Array<{ quien: string | null }>;
            const nombres = new Map<string, string>();
            for (const c of choques) if (c.quien && !nombres.has(c.quien)) nombres.set(c.quien, await nombreDe(request.tenantPrisma, c.quien));
            return reply.status(409).send({
                code: 'CAMBIO_MIENTRAS_TANTO',
                que: 'ASISTENCIA',
                error: (error as Error).message,
                choques: choques.map((c) => ({ ...c, quienNombre: c.quien ? nombres.get(c.quien) : null })),
            });
        }
        // Los errores con motivo propio (permisos, no encontrado…) se responden tal
        // cual: convertirlos en 500 esconde por qué se negó.
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        // Con mucha gente a la vez la base puede decir «ahora no»: eso se
        // reintenta (503), no es «no se pudo» (`esUnAhoraNoDeLaBase`).
        if (esUnAhoraNoDeLaBase(error)) return responderAhoraNo(reply);
        logger.error('Error saving live class session', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al guardar la clase' });
    }
}
