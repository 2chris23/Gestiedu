import { FastifyRequest, FastifyReply } from 'fastify';
import {
    apuntarQuienPuso,
    conNombres,
    cuantasNotas,
    dejarEnEspera,
    nombreDe,
    ponerNotasMirandoAntes,
    quienLaBorro,
    quienesPusieronNotas,
} from '../services/cambios-sin-conexion.service';
import { avisar } from '../services/avisos.service';
import { logger } from '../utils/logger';
import { RequestUser } from '../types/fastify';
import { instituteTimezone, isFutureDate, todayInTimezone } from '../utils/school-time';
import { assertClassroomScope } from '../services/authorization.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { revisarNotas, sumarNotas, arreglarNotasGuardadasComoTexto, Notas } from '../utils/notas-de-clase';
import { clasificar } from '../utils/actividad-del-dia';
import { evaluacionesDeLaFecha } from '../services/evaluacion-de-la-semana.service';
import { instrumentoDeLaActividad, notaAManoProhibida } from '../services/instrumentos.service';
import { maximoDelInstrumento } from '../utils/instrumentos';

/**
 * Parsea una fecha de input <input type="date"> (YYYY-MM-DD) a mediodía LOCAL.
 */
function parseDayDate(value: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    }
    return new Date(value);
}

/** Un id hecho en el teléfono: letras, números, guion y guion bajo (uuid o cuid). */
const ID_DEL_TELEFONO = /^[A-Za-z0-9_-]{16,64}$/;

/** La hora en que se hizo en el teléfono (`X-Hecho-En`), si se puede creer. */
function parseHechoEn(valor: unknown): Date | null {
    if (typeof valor !== 'string') return null;
    const t = Date.parse(valor);
    return Number.isNaN(t) || t > Date.now() + 5 * 60 * 1000 ? null : new Date(t);
}

/**
 * Verifica permisos del profesor para la clase correspondiente.
 */
async function exigirClasePropia(
    request: FastifyRequest,
    classroomId: string,
    subjectId: string | undefined,
    accion: string
): Promise<void> {
    await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, {
        subjectId,
        accion,
    });
}

/**
 * Verifica permisos del profesor para la actividad solicitada.
 */
async function exigirActividadPropia(
    request: FastifyRequest,
    activityId: string,
    accion: string
): Promise<{ classroomId: string; subjectId: string | null } | null> {
    const actividad = await request.tenantPrisma.classActivity.findUnique({
        where: { id: activityId },
        select: { classroomId: true, subjectId: true },
    });
    if (!actividad) return null;

    await assertClassroomScope(request.tenantPrisma, request.user as any, actividad.classroomId, {
        subjectId: actividad.subjectId ?? undefined,
        accion,
    });
    return actividad;
}

import { randomUUID } from 'crypto';

/**
 * La sesión de una clase en un día («YYYY-MM-DD»): la que hay, o una nueva.
 */
async function sesionDelDia(db: any, classroomId: string, subjectId: string, dia: string) {
    const date = new Date(`${dia}T00:00:00.000Z`);
    return db.classSession.upsert({
        where: { classroomId_subjectId_date: { classroomId, subjectId, date } },
        update: {},
        create: { publicId: randomUUID(), classroomId, subjectId, date },
    });
}

/**
 * Obtener actividades de una materia en una sección.
 */
export async function getClassActivities(
    request: FastifyRequest<{ Querystring: { classroomId: string; subjectId: string } }>,
    reply: FastifyReply
) {
    try {
        const { classroomId, subjectId } = request.query;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId) {
            return reply.status(400).send({ error: 'Faltan parámetros: classroomId, subjectId' });
        }

        let targetSubjectId = subjectId;
        const sub = await prisma.subject.findFirst({
            where: { OR: [{ id: subjectId }, { slug: subjectId }] },
            select: { id: true },
        });
        if (sub) targetSubjectId = sub.id;

        await exigirClasePropia(request, classroomId, targetSubjectId, 'ver las actividades');

        const activities = await prisma.classActivity.findMany({
            where: { classroomId, subjectId: targetSubjectId },
            include: {
                classSession: {
                    select: { id: true, date: true, startTime: true, endTime: true },
                },
            },
            orderBy: [{ isDone: 'asc' }, { createdAt: 'desc' }],
        });

        return reply.status(200).send({ activities });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error getting class activities', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al obtener actividades' });
    }
}

/**
 * Crear una actividad/tarea para la clase actual o la próxima.
 */
export async function createClassActivity(
    request: FastifyRequest<{
        Body: {
            classroomId: string;
            subjectId: string;
            title: string;
            description?: string;
            type?: string;
            target?: string;
            tag?: string;
            dueDate?: string;
            maxScore?: number;
            planRowId?: string;
            classSessionId?: string;
            /** El día de la clase que se ve («YYYY-MM-DD»). */
            date?: string;
            /**
             * El id lo pone el teléfono cuando se crea sin conexión: así las
             * notas de esa actividad, hechas también sin conexión, ya saben a
             * cuál van antes de que llegue.
             */
            id?: string;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const {
            id: idDelTelefono,
            classroomId,
            subjectId,
            title,
            description,
            type = 'TAREA',
            target = 'NEXT',
            tag,
            dueDate,
            maxScore = 20,
            planRowId,
            classSessionId,
            date,
        } = request.body;
        const prisma = request.tenantPrisma;

        if (!classroomId || !subjectId || !title) {
            return reply.status(400).send({ error: 'Faltan parámetros requeridos' });
        }
        if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return reply.status(400).send({ error: 'Fecha inválida', code: 'FECHA_INVALIDA' });
        }
        if (idDelTelefono !== undefined) {
            if (typeof idDelTelefono !== 'string' || !ID_DEL_TELEFONO.test(idDelTelefono)) {
                return reply.status(400).send({ error: 'El id de la actividad no es válido', code: 'ID_INVALIDO' });
            }
            if (await prisma.classActivity.findUnique({ where: { id: idDelTelefono }, select: { id: true } })) {
                return reply.status(409).send({ error: 'Ya hay una actividad con ese id', code: 'ID_EN_USO' });
            }
        }

        let targetSubjectId = subjectId;
        const sub = await prisma.subject.findFirst({
            where: { OR: [{ id: subjectId }, { slug: subjectId }] },
            select: { id: true },
        });
        if (sub) targetSubjectId = sub.id;

        await exigirClasePropia(request, classroomId, targetSubjectId, 'dejar actividades');
        const zonaLiceo = await instituteTimezone(prisma);

        let sesion: { id: string; date: Date } | null = null;
        if (classSessionId) {
            sesion = await prisma.classSession.findFirst({
                where: { id: classSessionId, classroomId, subjectId: targetSubjectId },
                select: { id: true, date: true },
            });
            if (!sesion) {
                return reply.status(400).send({ error: 'Esa clase no es de esta sección y materia', code: 'SESION_AJENA' });
            }
        } else if (date) {
            if (isFutureDate(date, zonaLiceo)) {
                return reply.status(400).send({
                    error: 'Esa clase todavía no ha llegado: crea la actividad hoy y ponle fecha de entrega',
                    code: 'FUTURE_DATE',
                    today: todayInTimezone(zonaLiceo),
                });
            }
            sesion = await sesionDelDia(prisma, classroomId, targetSubjectId, date);
        }

        const diaDeLaSemana = dueDate || (sesion ? sesion.date.toISOString().slice(0, 10) : date) || todayInTimezone(zonaLiceo);
        const { evaluaciones, planConPuntos } = await evaluacionesDeLaFecha(
            prisma,
            classroomId,
            targetSubjectId,
            parseDayDate(diaDeLaSemana)
        );
        let fila: string | null = null;
        if (planRowId && evaluaciones.some((e) => e.id === planRowId)) {
            fila = planRowId;
        } else if (evaluaciones.length === 1) {
            fila = evaluaciones[0].id;
        } else if (evaluaciones.length > 1) {
            return reply.status(400).send({
                error: 'Esta semana tiene varias evaluaciones en el plan: elige a cuál suma la actividad',
                code: 'ELIGE_LA_EVALUACION',
                evaluaciones,
            });
        }

        const activity = await prisma.classActivity.create({
            data: {
                ...(idDelTelefono ? { id: idDelTelefono } : {}),
                classroomId,
                subjectId: targetSubjectId,
                title,
                description,
                type,
                target,
                tag: tag || type,
                dueDate: dueDate ? parseDayDate(dueDate) : null,
                maxScore: maxScore ? Number(maxScore) : 20,
                scores: {},
                planRowId: fila,
                classSessionId: sesion?.id ?? null,
            },
        });

        const def = fila ? await instrumentoDeLaActividad(prisma, { id: activity.id, instrumento: null, planRowId: fila }) : null;
        if (def) {
            Object.assign(
                activity,
                await prisma.classActivity.update({ where: { id: activity.id }, data: { instrumento: def as any, maxScore: maximoDelInstrumento(def), detalleDelInstrumento: {} } })
            );
        }

        request.aQuienAfecta = { classroomId };

        const diaVisto = date || (sesion ? sesion.date.toISOString().slice(0, 10) : todayInTimezone(zonaLiceo));
        const { dondeSale } = clasificar({ ...activity, classSession: sesion }, diaVisto, sesion?.id, zonaLiceo);
        return reply.status(201).send({ activity, dondeSale, sumaALaNota: Boolean(fila) || !planConPuntos });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error creating class activity', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al crear actividad' });
    }
}

/**
 * Actualizar una actividad (marcar hecha, editar título/descripción/puntajes).
 */
export async function updateClassActivity(
    request: FastifyRequest<{
        Params: { activityId: string };
        Body: {
            title?: string;
            description?: string;
            type?: string;
            target?: string;
            tag?: string;
            dueDate?: string;
            maxScore?: number;
            scores?: Record<string, any>;
            isDone?: boolean;
            carriedOver?: boolean;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { activityId } = request.params;
        const {
            title,
            description,
            type,
            target,
            tag,
            dueDate,
            maxScore,
            scores,
            isDone,
            carriedOver
        } = request.body;
        const prisma = request.tenantPrisma;

        const propia = await exigirActividadPropia(request, activityId, 'cambiar actividades');
        if (!propia) {
            return reply.status(404).send({ error: 'Actividad no encontrada' });
        }

        if (scores !== undefined) {
            const noSe = await notaAManoProhibida(prisma, activityId, Object.keys(scores || {}));
            if (noSe) {
                return reply.status(409).send({
                    error: 'Esta actividad se califica con el instrumento de su evaluación del plan: marca sus casillas',
                    code: 'NOTA_POR_INSTRUMENTO',
                });
            }
            const actual = await prisma.classActivity.findUnique({
                where: { id: activityId },
                select: { maxScore: true, scores: true },
            });
            const escala = maxScore !== undefined ? (maxScore ? Number(maxScore) : 20) : (actual?.maxScore ?? 20);
            const problema = revisarNotas(scores, escala);
            if (problema) {
                return reply.status(400).send({ error: problema, code: 'NOTA_NO_VALIDA' });
            }
            await arreglarNotasGuardadasComoTexto(prisma as any, activityId, actual?.scores);
            await sumarNotas(prisma as any, activityId, scores as Notas);
            await apuntarQuienPuso(prisma, activityId, Object.keys(scores || {}), (request.user as RequestUser).id);
        }

        const activity = await prisma.classActivity.update({
            where: { id: activityId },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(type !== undefined && { type }),
                ...(target !== undefined && { target }),
                ...(tag !== undefined && { tag }),
                ...(dueDate !== undefined && { dueDate: dueDate ? parseDayDate(dueDate) : null }),
                ...(maxScore !== undefined && { maxScore: maxScore ? Number(maxScore) : 20 }),
                ...(isDone !== undefined && { isDone }),
                ...(carriedOver !== undefined && { carriedOver }),
            },
        });

        request.aQuienAfecta = { classroomId: propia.classroomId };

        return reply.status(200).send({ activity });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error updating class activity', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al actualizar actividad' });
    }
}

/**
 * Guardar o actualizar calificaciones de una actividad de clase.
 */
export async function saveClassActivityGrades(
    request: FastifyRequest<{
        Params: { activityId: string };
        Body: {
            scores: Record<string, number | null>;
            maxScore?: number;
            antes?: Record<string, number | null>;
            decision?: 'la-mia';
        };
    }>,
    reply: FastifyReply
) {
    try {
        const { activityId } = request.params;
        const { scores = {}, maxScore, antes, decision } = request.body;
        const prisma = request.tenantPrisma;
        const user = request.user as RequestUser;

        const activity = await prisma.classActivity.findUnique({ where: { id: activityId } });
        if (!activity) {
            const borrada = request.headers['x-cambio'] || antes ? await quienLaBorro(prisma, 'classActivity', activityId) : null;
            if (borrada?.contenido?.classroomId) {
                await assertClassroomScope(prisma, user as any, borrada.contenido.classroomId, {
                    subjectId: borrada.contenido.subjectId ?? undefined,
                    accion: 'dar notas',
                });
                const titulo = String(borrada.contenido.title ?? 'la actividad');
                const autor = await nombreDe(prisma, user.id);
                const espera = await dejarEnEspera(prisma, request.server.io as any, user.instituteId, {
                    autorId: user.id,
                    decideId: borrada.borradoPor,
                    tipo: 'NOTAS_A_ACTIVIDAD_BORRADA',
                    objetivo: activityId,
                    datos: { scores, maxScore, titulo, classroomId: borrada.contenido.classroomId },
                    motivo: 'La actividad se borró mientras estas notas esperaban para enviarse',
                    hechoEn: parseHechoEn(request.headers['x-hecho-en']),
                    titulo: `Notas para «${titulo}», que borraste`,
                    mensaje: `${autor} le había puesto nota a ${Object.keys(scores).length} alumno(s) en «${titulo}» sin conexión, y la borraste antes de que llegaran. ¿La recuperas con esas notas?`,
                });
                return reply.status(202).send({
                    code: 'EN_ESPERA',
                    esperaId: espera.id,
                    esperaA: await nombreDe(prisma, borrada.borradoPor),
                    error: `«${titulo}» se borró mientras tanto. Tus notas esperan a que quien la borró decida si la recupera.`,
                });
            }
            return reply.status(404).send({ error: 'Actividad no encontrada' });
        }

        await exigirActividadPropia(request, activityId, 'dar notas');

        const noSe = await notaAManoProhibida(prisma, activityId, Object.keys(scores || {}));
        if (noSe) {
            return reply.status(409).send({
                error: 'Esta actividad se califica con el instrumento de su evaluación del plan: marca sus casillas',
                code: 'NOTA_POR_INSTRUMENTO',
            });
        }

        const escala = maxScore !== undefined ? Number(maxScore) : (activity.maxScore ?? 20);
        const problema = revisarNotas(scores, escala);
        if (problema) {
            return reply.status(400).send({ error: problema, code: 'NOTA_NO_VALIDA' });
        }

        const { choques } = await ponerNotasMirandoAntes(
            prisma,
            activityId,
            scores as Notas,
            maxScore,
            decision === 'la-mia' ? undefined : antes,
            user.id
        );
        if (choques.length) {
            return reply.status(409).send({
                code: 'CAMBIO_MIENTRAS_TANTO',
                que: 'NOTAS',
                error: 'Mientras tanto otra persona cambió estas notas: elige cuál queda',
                actividad: { id: activityId, title: activity.title },
                choques: await conNombres(prisma, choques),
            });
        }
        const updated = await prisma.classActivity.findUnique({ where: { id: activityId } });

        request.aQuienAfecta = {
            studentIds: Object.keys(scores || {}),
            classroomId: (activity as any)?.classroomId || undefined,
        };

        return reply.status(200).send({ success: true, activity: updated });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error saving activity grades', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al guardar calificaciones de la actividad' });
    }
}

/**
 * EVALUAR A UN ALUMNO DE OTRA FORMA EN UNA ACTIVIDAD
 */
export async function evaluarDeOtraForma(
    request: FastifyRequest<{
        Params: { activityId: string; studentId: string };
        Body?: { metodo?: string; motivo?: string | null };
    }>,
    reply: FastifyReply
) {
    try {
        const { activityId, studentId } = request.params;
        const prisma = request.tenantPrisma;

        const propia = await exigirActividadPropia(request, activityId, 'dar notas');
        if (!propia) return reply.status(404).send({ error: 'Actividad no encontrada' });

        const metodo = typeof request.body?.metodo === 'string' ? request.body.metodo.trim() : '';
        const motivo = typeof request.body?.motivo === 'string' ? request.body.motivo.trim() : '';
        const quitar = request.method === 'DELETE' || metodo === '';

        if (!quitar) {
            if (metodo.length > 60) {
                return reply.status(400).send({ error: 'Cómo se le evalúa: 60 letras como mucho', code: 'METODO_MUY_LARGO' });
            }
            if (motivo.length > 200) {
                return reply.status(400).send({ error: 'El motivo: 200 letras como mucho', code: 'MOTIVO_MUY_LARGO' });
            }
            const inscrito = await prisma.studentClassroom.findFirst({
                where: { studentId, classroomId: propia.classroomId, isActive: true },
                select: { id: true },
            });
            if (!inscrito) {
                return reply.status(400).send({ error: 'Ese alumno no es de esta sección', code: 'ALUMNO_AJENO' });
            }
        }

        if (quitar) {
            await prisma.$executeRaw`
                UPDATE "class_activities"
                   SET "evaluadoDeOtraForma" = COALESCE("evaluadoDeOtraForma", '{}'::jsonb) - ${studentId}::text,
                       "updatedAt" = now()
                 WHERE id = ${activityId}`;
        } else {
            const valor = JSON.stringify({ metodo, ...(motivo ? { motivo } : {}) });
            await prisma.$executeRaw`
                UPDATE "class_activities"
                   SET "evaluadoDeOtraForma" = COALESCE("evaluadoDeOtraForma", '{}'::jsonb) || jsonb_build_object(${studentId}::text, ${valor}::jsonb),
                       "updatedAt" = now()
                 WHERE id = ${activityId}`;
        }

        const actividad = await prisma.classActivity.findUnique({ where: { id: activityId } });
        request.aQuienAfecta = { studentIds: [studentId], classroomId: propia.classroomId };
        return reply.status(200).send({ success: true, activity: actividad });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error anotando la otra forma de evaluar', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'No se pudo guardar cómo se le evalúa' });
    }
}

/**
 * Eliminar una actividad.
 */
export async function deleteClassActivity(
    request: FastifyRequest<{ Params: { activityId: string }; Querystring: { notasVistas?: string; decision?: string } }>,
    reply: FastifyReply
) {
    try {
        const { activityId } = request.params;
        const prisma = request.tenantPrisma;
        const user = request.user as RequestUser;

        const propia = await exigirActividadPropia(request, activityId, 'borrar actividades');
        if (!propia) {
            if (request.headers['x-cambio'] && (await quienLaBorro(prisma, 'classActivity', activityId))) {
                return reply.status(200).send({ success: true, yaEstabaBorrada: true });
            }
            return reply.status(404).send({ error: 'Actividad no encontrada' });
        }

        const actual = await prisma.classActivity.findUnique({ where: { id: activityId }, select: { title: true, scores: true, notasPuestasPor: true } });
        const hay = cuantasNotas(actual?.scores);
        const vistas = request.query?.notasVistas !== undefined ? Number(request.query.notasVistas) : null;
        if (vistas !== null && Number.isFinite(vistas) && hay > vistas && request.query?.decision !== 'borrar') {
            const quienes = quienesPusieronNotas(actual?.notasPuestasPor, user.id);
            return reply.status(409).send({
                code: 'CAMBIO_MIENTRAS_TANTO',
                que: 'NOTAS_NUEVAS',
                error: 'Mientras tanto le pusieron notas a esta actividad: ¿aún quieres borrarla?',
                actividad: { id: activityId, title: actual?.title },
                notas: hay,
                notasVistas: vistas,
                quienes: await Promise.all(quienes.map((q) => nombreDe(prisma, q))),
            });
        }

        await borrarGuardandoCopia(prisma, 'classActivity', { id: activityId }, quienBorra(request as any));

        const avisados = quienesPusieronNotas(actual?.notasPuestasPor, user.id);
        if (avisados.length && hay > 0 && user.instituteId) {
            await avisar(prisma, user.instituteId, request.server.io as any, {
                a: avisados,
                titulo: `Se borró «${actual?.title ?? 'una actividad'}»`,
                mensaje: `${await nombreDe(prisma, user.id)} borró «${actual?.title ?? 'la actividad'}» con las notas que tenía. Quedan en la papelera del liceo.`,
                tipo: 'INFO',
            });
        }

        request.aQuienAfecta = { classroomId: propia.classroomId };

        return reply.status(200).send({ success: true });
    } catch (error) {
        if ((error as any)?.statusCode) {
            return reply.status((error as any).statusCode).send({
                error: (error as any).message || 'No autorizado',
                code: (error as any).code || 'FORBIDDEN',
            });
        }
        logger.error('Error deleting class activity', {
            error: error instanceof Error ? error.message : String(error),
        });
        return reply.status(500).send({ error: 'Error al eliminar actividad' });
    }
}
