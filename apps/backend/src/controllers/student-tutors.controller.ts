import { FastifyReply, FastifyRequest } from 'fastify';
import { ActionType, UserRole } from '../utils/prisma-enums';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { sanitizeText } from '../utils/sanitize';
import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';
import { logger } from '../utils/logger';

/**
 * ASIGNAR REPRESENTANTES A UN ALUMNO
 *
 * La tabla `student_tutors` decide qué ve cada representante —`canSeeStudent`
 * la consulta en cada petición—, pero hasta ahora **solo se llenaba con el guion
 * de datos de prueba**. En un liceo real no había forma de decir «esta señora es
 * la madre de Ana»: un tutor recién creado entraba y no veía a nadie.
 *
 * Solo el administrador asigna y quita (la ruta lo exige). Aquí se comprueba lo
 * demás: que los dos existan en este liceo, que cada uno tenga el rol que dice, y
 * que ninguno esté archivado.
 */

/** Un alumno con más representantes que esto es un error de carga, no una familia. */
const MAXIMO_DE_REPRESENTANTES = 6;

const LARGO_DEL_PARENTESCO = { min: 2, max: 40 };

type Params = { studentId: string; tutorId?: string };

function liceoDe(request: FastifyRequest): string | null {
    return request.institute?.id ?? (request.user as any)?.instituteId ?? null;
}

function quienLlama(request: FastifyRequest): string | undefined {
    return (request.user as any)?.userId ?? (request.user as any)?.id;
}

const DATOS_DEL_REPRESENTANTE = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
} as const;

/**
 * Lo guardado de una persona se tira entero. Hace falta hacerlo a mano con quien
 * **deja** de representar: el aviso automático de cambios busca a los
 * representantes actuales del alumno, y ese ya no lo es — su pantalla seguiría
 * enseñando al alumno que acaban de quitarle.
 */
async function olvidarLoGuardadoDe(instituteId: string, userIds: string[]) {
    await conLiceo(instituteId, () =>
        RedisCache.clearPatterns(userIds.map((id) => `cache:${instituteId}:*:${id}:*`))
    ).catch(() => undefined);
}

async function anotar(
    request: FastifyRequest,
    instituteId: string,
    accion: ActionType,
    metadata: Record<string, unknown>
) {
    try {
        await request.tenantPrisma.auditLog.create({
            data: {
                instituteId,
                action: accion,
                entity: 'STUDENT_TUTOR',
                entityType: 'STUDENT_TUTOR',
                entityId: String(metadata.studentId ?? ''),
                metadata: { ip: request.ip, ...metadata },
                userId: quienLlama(request),
            },
        });
    } catch (error) {
        logger.error('No se pudo anotar en la bitácora el cambio de representante', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/** GET /users/:studentId/tutors */
export async function listStudentTutors(
    request: FastifyRequest<{ Params: Params }>,
    reply: FastifyReply
) {
    const instituteId = liceoDe(request);
    if (!instituteId) return reply.status(400).send({ error: 'No se pudo determinar el instituto' });

    const alumno = await request.tenantPrisma.user.findFirst({
        where: { id: request.params.studentId, instituteId, role: UserRole.STUDENT as any },
        select: { id: true },
    });
    if (!alumno) return reply.status(404).send({ error: 'Estudiante no encontrado', code: 'STUDENT_NOT_FOUND' });

    const vinculos = await request.tenantPrisma.studentTutor.findMany({
        where: { studentId: alumno.id },
        select: { relationship: true, createdAt: true, tutor: { select: DATOS_DEL_REPRESENTANTE } },
        orderBy: { createdAt: 'asc' },
    });

    return reply.send({ tutors: vinculos });
}

/** POST /users/:studentId/tutors  { tutorId, relationship } */
export async function assignStudentTutor(
    request: FastifyRequest<{ Params: Params; Body: { tutorId: string; relationship: string } }>,
    reply: FastifyReply
) {
    const instituteId = liceoDe(request);
    if (!instituteId) return reply.status(400).send({ error: 'No se pudo determinar el instituto' });

    const { studentId } = request.params;
    const tutorId = String(request.body?.tutorId ?? '').trim();
    const parentesco = sanitizeText(String(request.body?.relationship ?? '')).trim();

    if (parentesco.length < LARGO_DEL_PARENTESCO.min || parentesco.length > LARGO_DEL_PARENTESCO.max) {
        return reply.status(400).send({
            error: `El parentesco debe tener entre ${LARGO_DEL_PARENTESCO.min} y ${LARGO_DEL_PARENTESCO.max} caracteres`,
            code: 'INVALID_RELATIONSHIP',
        });
    }

    const [alumno, tutor] = await Promise.all([
        request.tenantPrisma.user.findFirst({
            where: { id: studentId, instituteId },
            select: { id: true, role: true, status: true },
        }),
        request.tenantPrisma.user.findFirst({
            where: { id: tutorId, instituteId },
            select: { id: true, role: true, status: true },
        }),
    ]);

    // Mismo mensaje para "no existe" y "existe con otro rol": no se le cuenta a
    // nadie qué cédulas hay en el liceo.
    if (!alumno || alumno.role !== (UserRole.STUDENT as any)) {
        return reply.status(404).send({ error: 'Estudiante no encontrado', code: 'STUDENT_NOT_FOUND' });
    }
    if (!tutor || tutor.role !== (UserRole.TUTOR as any)) {
        return reply.status(404).send({ error: 'Representante no encontrado', code: 'TUTOR_NOT_FOUND' });
    }
    if (alumno.status === 'ARCHIVED' || tutor.status === 'ARCHIVED') {
        return reply.status(409).send({
            error: 'No se puede asignar un representante a una cuenta archivada',
            code: 'USER_ARCHIVED',
        });
    }

    const [yaEsta, cuantos] = await Promise.all([
        request.tenantPrisma.studentTutor.findUnique({
            where: { studentId_tutorId: { studentId, tutorId } },
            select: { id: true },
        }),
        request.tenantPrisma.studentTutor.count({ where: { studentId } }),
    ]);

    if (yaEsta) {
        return reply.status(409).send({
            error: 'Ese representante ya está asignado a este estudiante',
            code: 'TUTOR_ALREADY_ASSIGNED',
        });
    }
    if (cuantos >= MAXIMO_DE_REPRESENTANTES) {
        return reply.status(409).send({
            error: `Un estudiante puede tener como máximo ${MAXIMO_DE_REPRESENTANTES} representantes`,
            code: 'TOO_MANY_TUTORS',
        });
    }

    let vinculo;
    try {
        vinculo = await request.tenantPrisma.studentTutor.create({
            data: { studentId, tutorId, relationship: parentesco },
            select: { relationship: true, createdAt: true, tutor: { select: DATOS_DEL_REPRESENTANTE } },
        });
    } catch (error: any) {
        // Dos clics a la vez: el segundo choca con la llave única.
        if (error?.code === 'P2002') {
            return reply.status(409).send({
                error: 'Ese representante ya está asignado a este estudiante',
                code: 'TUTOR_ALREADY_ASSIGNED',
            });
        }
        throw error;
    }

    // El aviso automático alcanza al alumno y a todos sus representantes,
    // el nuevo incluido: ya está en la tabla cuando se resuelve.
    request.aQuienAfecta = { studentIds: [studentId] };
    await olvidarLoGuardadoDe(instituteId, [studentId, tutorId]);
    await anotar(request, instituteId, ActionType.CREATE, { studentId, tutorId, relationship: parentesco });

    return reply.status(201).send({ tutor: vinculo });
}

/** DELETE /users/:studentId/tutors/:tutorId */
export async function removeStudentTutor(
    request: FastifyRequest<{ Params: Params }>,
    reply: FastifyReply
) {
    const instituteId = liceoDe(request);
    if (!instituteId) return reply.status(400).send({ error: 'No se pudo determinar el instituto' });

    const { studentId, tutorId } = request.params;
    if (!tutorId) return reply.status(400).send({ error: 'Falta el representante' });

    // El vínculo tiene que ser de dos personas de ESTE liceo.
    const alumno = await request.tenantPrisma.user.findFirst({
        where: { id: studentId, instituteId },
        select: { id: true },
    });
    if (!alumno) return reply.status(404).send({ error: 'Estudiante no encontrado', code: 'STUDENT_NOT_FOUND' });

    const borrados = await borrarGuardandoCopia(
        request.tenantPrisma as any,
        'studentTutor',
        { studentId, tutorId },
        quienBorra(request as any)
    );
    if (borrados === 0) {
        return reply.status(404).send({ error: 'Ese representante no está asignado', code: 'TUTOR_NOT_ASSIGNED' });
    }

    request.aQuienAfecta = { studentIds: [studentId] };
    // El que se va ya no sale entre los representantes: se le limpia a mano.
    await olvidarLoGuardadoDe(instituteId, [studentId, tutorId]);
    await anotar(request, instituteId, ActionType.DELETE, { studentId, tutorId });

    return reply.send({ message: 'Representante quitado' });
}
