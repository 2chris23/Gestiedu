import { FastifyReply, FastifyRequest } from 'fastify';
import {
    listarPendientes,
    pendientesDelAlumno,
    evaluarMomento,
    quitarMomento,
    asignarProfesor,
    actaDeCompromiso,
    ponerOpcion,
    quitarOpcion,
    pendientesDeLaClase,
    pendientesDeLaSeccion,
    moverDeClase,
    cronograma,
    guardarCronograma,
    type MomentoDelCronograma,
} from '../services/materias-pendientes.service';
import { canSeeStudent } from '../services/authorization.service';
import {
    planYEncuentrosDeLaClase,
    guardarPlanDelMomento,
    ponerNotaDelPlan,
    crearEncuentro,
    editarEncuentro,
    borrarEncuentro,
    pasarAsistencia,
    type EvaluacionDelPlan,
    type DatosDelEncuentro,
} from '../services/plan-de-pendientes.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LAS MATERIAS PENDIENTES (`services/materias-pendientes.service.ts`).
 * Quién puede qué:
 *   - la lista: el admin, todas; el profesor, las que evalúa él;
 *   - poner o quitar un momento o una opción: el profesor de su clase (o el
 *     puesto a mano), o el admin;
 *   - la clase: el admin y su profesor; la sección: el admin y su guía;
 *   - pasarla a otra clase, cambiar el profesor y las fechas: el admin (lo
 *     protege la ruta);
 *   - las de un alumno y su acta: quien puede ver a ese alumno (él mismo, su
 *     representante, el personal que le da clase, el admin).
 */

const instituteIdDe = (request: FastifyRequest): string =>
    String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
const quienDe = (request: FastifyRequest) => ({
    id: String((request.user as any)?.userId ?? (request.user as any)?.id ?? ''),
    role: String((request.user as any)?.role ?? ''),
});

export async function listar(request: FastifyRequest<{ Querystring: { cicloId?: string } }>, reply: FastifyReply) {
    try {
        const datos = await listarPendientes(request.tenantPrisma, instituteIdDe(request), quienDe(request), { cicloId: request.query?.cicloId });
        return reply.send({ success: true, data: datos });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function delAlumno(request: FastifyRequest<{ Params: { studentId: string } }>, reply: FastifyReply) {
    try {
        if (!(await canSeeStudent(request.tenantPrisma, request.user as any, request.params.studentId))) {
            return reply.status(403).send({ error: 'Solo puedes consultar a tus estudiantes', code: 'FORBIDDEN' });
        }
        return reply.send({ success: true, data: await pendientesDelAlumno(request.tenantPrisma, request.params.studentId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function acta(request: FastifyRequest<{ Params: { studentId: string }; Querystring: { cicloId?: string } }>, reply: FastifyReply) {
    try {
        if (!(await canSeeStudent(request.tenantPrisma, request.user as any, request.params.studentId))) {
            return reply.status(403).send({ error: 'Solo puedes consultar a tus estudiantes', code: 'FORBIDDEN' });
        }
        return reply.send({ success: true, data: await actaDeCompromiso(request.tenantPrisma, request.params.studentId, request.query?.cicloId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerMomento(
    request: FastifyRequest<{ Params: { id: string; momento: string }; Body: { nota: number; fecha?: string; observaciones?: string } }>,
    reply: FastifyReply
) {
    try {
        const prisma: any = request.tenantPrisma;
        const hecho = await evaluarMomento(prisma, instituteIdDe(request), quienDe(request), {
            id: request.params.id,
            momento: Number(request.params.momento),
            nota: request.body.nota,
            fecha: request.body.fecha ?? todayInTimezone(await instituteTimezone(prisma)),
            observaciones: request.body.observaciones?.slice(0, 300) ?? null,
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function borrarMomento(request: FastifyRequest<{ Params: { id: string; momento: string } }>, reply: FastifyReply) {
    try {
        const hecho = await quitarMomento(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.id, Number(request.params.momento));
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function cambiarProfesor(request: FastifyRequest<{ Params: { id: string }; Body: { profesorId: string | null } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await asignarProfesor(request.tenantPrisma, request.params.id, request.body.profesorId ?? null) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerLaOpcion(
    request: FastifyRequest<{
        Params: { id: string; momento: string; opcion: string };
        Body: { nota?: number | null; asistio?: boolean; justificada?: boolean; fecha?: string; observaciones?: string };
    }>,
    reply: FastifyReply
) {
    try {
        const prisma: any = request.tenantPrisma;
        const b = request.body ?? {};
        const hecho = await ponerOpcion(prisma, instituteIdDe(request), quienDe(request), {
            id: request.params.id,
            momento: Number(request.params.momento),
            opcion: Number(request.params.opcion),
            nota: b.nota ?? undefined,
            asistio: b.asistio !== false,
            justificada: b.justificada === true,
            fecha: b.fecha ?? todayInTimezone(await instituteTimezone(prisma)),
            observaciones: b.observaciones ?? null,
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function quitarLaOpcion(request: FastifyRequest<{ Params: { id: string; momento: string; opcion: string } }>, reply: FastifyReply) {
    try {
        const { id, momento, opcion } = request.params;
        return reply.send({ success: true, data: await quitarOpcion(request.tenantPrisma, instituteIdDe(request), quienDe(request), id, Number(momento), Number(opcion)) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function deLaClase(request: FastifyRequest<{ Params: { claseId: string } }>, reply: FastifyReply) {
    try {
        // Las pendientes de la clase (lo que decide si se puede ver) y, con ellas, su plan y sus encuentros.
        const datos = await pendientesDeLaClase(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.claseId);
        return reply.send({ success: true, data: { ...datos, ...(await planYEncuentrosDeLaClase(request.tenantPrisma, request.params.claseId)) } });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function deLaSeccion(request: FastifyRequest<{ Params: { classroomId: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await pendientesDeLaSeccion(request.tenantPrisma, quienDe(request), request.params.classroomId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function cambiarDeClase(request: FastifyRequest<{ Params: { id: string }; Body: { claseId: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await moverDeClase(request.tenantPrisma, request.params.id, request.body.claseId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function verCronograma(request: FastifyRequest<{ Querystring: { cicloId?: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await cronograma(request.tenantPrisma, instituteIdDe(request), request.query?.cicloId) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function guardarElCronograma(
    request: FastifyRequest<{ Querystring: { cicloId: string }; Body: { momentos: MomentoDelCronograma[] } }>,
    reply: FastifyReply
) {
    try {
        const hecho = await guardarCronograma(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.query.cicloId, request.body.momentos);
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function guardarElPlan(
    request: FastifyRequest<{ Params: { claseId: string; momento: string }; Body: { evaluaciones: EvaluacionDelPlan[]; confirmar?: boolean } }>,
    reply: FastifyReply
) {
    try {
        const { claseId, momento } = request.params;
        const hecho = await guardarPlanDelMomento(request.tenantPrisma, instituteIdDe(request), quienDe(request), claseId, Number(momento), request.body.evaluaciones, {
            confirmar: request.body.confirmar === true,
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function ponerLaNotaDelPlan(
    request: FastifyRequest<{ Params: { id: string; evaluacionId: string; opcion: string }; Body: { nota?: number | null; marcas?: Record<string, any> | null } }>,
    reply: FastifyReply
) {
    try {
        const { id, evaluacionId, opcion } = request.params;
        const hecho = await ponerNotaDelPlan(request.tenantPrisma, instituteIdDe(request), quienDe(request), {
            id,
            evaluacionId,
            opcion: Number(opcion),
            nota: request.body?.nota ?? null,
            marcas: request.body?.marcas ?? null,
        });
        return reply.send({ success: true, data: hecho });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function nuevoEncuentro(request: FastifyRequest<{ Params: { claseId: string }; Body: DatosDelEncuentro }>, reply: FastifyReply) {
    try {
        return reply.status(201).send({ success: true, data: await crearEncuentro(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.claseId, request.body) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function cambiarEncuentro(request: FastifyRequest<{ Params: { id: string }; Body: DatosDelEncuentro }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await editarEncuentro(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.id, request.body) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function quitarEncuentro(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
        return reply.send({ success: true, data: await borrarEncuentro(request.tenantPrisma, quienDe(request), request.params.id) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}

export async function asistenciaDelEncuentro(
    request: FastifyRequest<{ Params: { id: string }; Body: { asistencias: Array<{ materiaPendienteId: string; estado: 'PRESENTE' | 'AUSENTE' | 'JUSTIFICADO' }> } }>,
    reply: FastifyReply
) {
    try {
        return reply.send({ success: true, data: await pasarAsistencia(request.tenantPrisma, instituteIdDe(request), quienDe(request), request.params.id, request.body.asistencias) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
}
