import { FastifyReply, FastifyRequest } from 'fastify';
import { assertClassroomScope } from '../services/authorization.service';
import {
    abrirPase,
    aprobarRegistro,
    AsistenciaQrError,
    cerrarPase,
    ConfigAsistenciaQr,
    escanearAlAlumno,
    escanearComoAlumno,
    guardarConfigQr,
    leerConfigQr,
    miCodigo,
    ponerElFaro,
    quitarRegistro,
    ubicacionValida,
    vistaDelPase,
} from '../services/asistencia-qr.service';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { AppErrors } from '../middleware/error.middleware';

/**
 * LAS PUERTAS DE LA ASISTENCIA POR QR
 *
 * Todo lo que decide está en `services/asistencia-qr.service.ts`. Aquí solo se
 * pregunta quién llama y si eso es suyo:
 *
 *  · abrir, ver, aprobar, quitar, cerrar y escanear al alumno → el profesor
 *    de ESA clase (o el guía, o el admin): `assertClassroomScope`;
 *  · escanear el QR del profesor y pedir el propio QR → solo un alumno;
 *  · el teléfono registrado de un alumno → solo el admin.
 *
 * El aviso en vivo al profesor NO lleva datos: dice «tu pase cambió» y su
 * pantalla vuelve a pedirlo por aquí, con sus guardias (como `datos:cambiaron`).
 */

function elLiceo(request: FastifyRequest): string {
    const id = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    if (!id) throw new Error('No se pudo determinar el liceo');
    return id;
}

function quien(request: FastifyRequest) {
    const u = request.user as any;
    return { id: u?.userId ?? u?.id, role: u?.role };
}

function responderError(reply: FastifyReply, e: unknown) {
    if (e instanceof AsistenciaQrError) {
        return reply.status(e.statusCode).send({ error: e.message, code: e.code });
    }
    throw e;
}

/** Al profesor que abrió el pase: «vuelve a pedirlo». */
function avisarAlProfesor(request: FastifyRequest, pase: { id: string; abiertoPorId: string }) {
    try {
        request.server.io?.to(`user:${elLiceo(request)}:${pase.abiertoPorId}`).emit('asistencia-qr:cambio', { paseId: pase.id });
    } catch {
        // Sin tiempo real, la pantalla del profesor se pone al día al pedir el código.
    }
}

async function elPaseSiEsSuyo(request: FastifyRequest, paseId: string) {
    const pase = await request.tenantPrisma.paseDeLista.findUnique({ where: { id: paseId } });
    if (!pase) throw AppErrors.NotFound('Ese pase de lista no existe');
    await assertClassroomScope(request.tenantPrisma, request.user as any, pase.classroomId, {
        subjectId: pase.subjectId,
        accion: 'pasar asistencia',
    });
    return pase;
}

// ─── Configuración ──────────────────────────────────────────────────────────

export async function verConfiguracion(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ success: true, data: await leerConfigQr(elLiceo(request)) });
}

export async function guardarConfiguracion(
    request: FastifyRequest<{ Body: Partial<ConfigAsistenciaQr> }>,
    reply: FastifyReply
) {
    const data = await guardarConfigQr(elLiceo(request), request.body || {});
    return reply.send({ success: true, data });
}

// ─── El profesor ────────────────────────────────────────────────────────────

export async function abrir(
    request: FastifyRequest<{ Body: { classroomId: string; subjectId: string; fecha?: string; ubicacion?: unknown } }>,
    reply: FastifyReply
) {
    const { classroomId, subjectId, fecha, ubicacion } = request.body;
    await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, {
        subjectId,
        accion: 'pasar asistencia',
    });
    try {
        const pase = await abrirPase({
            prisma: request.tenantPrisma,
            instituteId: elLiceo(request),
            quien: quien(request),
            classroomId,
            subjectId,
            fecha,
            ubicacion: ubicacionValida(ubicacion),
        });
        // Abrir un pase no cambia la asistencia de nadie: que no salgan a
        // recargar las pantallas de los alumnos (sin esto se avisa a todo el
        // liceo, y la ventana de la clase que el alumno tenía abierta se movía).
        request.aQuienAfecta = { studentIds: [], classroomId };
        return reply.status(201).send({ success: true, data: await vistaDelPase(request.tenantPrisma, pase) });
    } catch (e) {
        return responderError(reply, e);
    }
}

export async function ver(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const pase = await elPaseSiEsSuyo(request, request.params.id);
    return reply.header('Cache-Control', 'no-store').send({ success: true, data: await vistaDelPase(request.tenantPrisma, pase) });
}

export async function faro(request: FastifyRequest<{ Params: { id: string }; Body: { ubicacion?: unknown } }>, reply: FastifyReply) {
    const pase = await elPaseSiEsSuyo(request, request.params.id);
    const puesto = await ponerElFaro(request.tenantPrisma, pase, ubicacionValida(request.body?.ubicacion));
    request.aQuienAfecta = { studentIds: [], classroomId: pase.classroomId };
    return reply.send({ success: true, data: await vistaDelPase(request.tenantPrisma, puesto) });
}

export async function aprobar(request: FastifyRequest<{ Params: { id: string; registroId: string } }>, reply: FastifyReply) {
    const pase = await elPaseSiEsSuyo(request, request.params.id);
    const r = await aprobarRegistro(request.tenantPrisma, pase, request.params.registroId, quien(request));
    request.aQuienAfecta = { studentIds: [r.studentId], classroomId: pase.classroomId };
    avisarAlProfesor(request, pase);
    return reply.send({ success: true, data: await vistaDelPase(request.tenantPrisma, pase) });
}

export async function quitar(request: FastifyRequest<{ Params: { id: string; registroId: string } }>, reply: FastifyReply) {
    const pase = await elPaseSiEsSuyo(request, request.params.id);
    const r = await quitarRegistro(request.tenantPrisma, pase, request.params.registroId, {
        ...quien(request),
        ...quienBorra(request as any),
    });
    request.aQuienAfecta = { studentIds: [r.studentId], classroomId: pase.classroomId };
    avisarAlProfesor(request, pase);
    return reply.send({ success: true, data: await vistaDelPase(request.tenantPrisma, pase) });
}

export async function cerrar(
    request: FastifyRequest<{ Params: { id: string }; Body: { presentesAMano?: string[] } }>,
    reply: FastifyReply
) {
    const pase = await elPaseSiEsSuyo(request, request.params.id);
    const resultado = await cerrarPase(request.tenantPrisma, pase, request.body?.presentesAMano ?? []);
    // Cerrar mueve la asistencia de toda la sección.
    request.aQuienAfecta = { studentIds: [], classroomId: pase.classroomId };
    return reply.send({ success: true, data: resultado });
}

export async function escanearAlumno(
    request: FastifyRequest<{ Params: { id: string }; Body: { codigo: string } }>,
    reply: FastifyReply
) {
    const pase = await elPaseSiEsSuyo(request, request.params.id);
    try {
        const r = await escanearAlAlumno({
            prisma: request.tenantPrisma,
            instituteId: elLiceo(request),
            pase,
            codigo: request.body?.codigo,
        });
        request.aQuienAfecta = { studentIds: [r.alumno.id], classroomId: pase.classroomId };
        avisarAlProfesor(request, pase);
        return reply.send({ success: true, data: r });
    } catch (e) {
        return responderError(reply, e);
    }
}

// ─── El alumno ──────────────────────────────────────────────────────────────

export async function escanear(
    request: FastifyRequest<{
        Body: { codigo: string; aparato?: { id?: string; descripcion?: string }; ubicacion?: unknown };
    }>,
    reply: FastifyReply
) {
    const alumno = quien(request);
    const prisma = request.tenantPrisma;
    try {
        const r = await escanearComoAlumno({
            prisma,
            instituteId: elLiceo(request),
            studentId: alumno.id,
            codigo: request.body?.codigo,
            aparato: request.body?.aparato ?? null,
            ubicacion: ubicacionValida(request.body?.ubicacion),
        });
        return reply.send({ success: true, data: r });
    } catch (e) {
        return responderError(reply, e);
    } finally {
        // Aceptado, por confirmar o rechazado: el profesor lo ve en su lista.
        const codigo = String(request.body?.codigo ?? '');
        const paseId = codigo.startsWith('GQP1.') ? codigo.split('.')[1] : null;
        if (paseId) {
            const pase = await prisma.paseDeLista
                .findUnique({ where: { id: paseId }, select: { id: true, abiertoPorId: true, classroomId: true } })
                .catch(() => null);
            if (pase) {
                avisarAlProfesor(request, pase);
                request.aQuienAfecta = { studentIds: [alumno.id], classroomId: pase.classroomId };
            }
        }
    }
}

export async function miQr(request: FastifyRequest, reply: FastifyReply) {
    return reply.header('Cache-Control', 'no-store').send({ success: true, data: miCodigo(elLiceo(request), quien(request).id) });
}

// ─── El teléfono de cada alumno (admin) ─────────────────────────────────────

export async function verAparato(request: FastifyRequest<{ Params: { studentId: string } }>, reply: FastifyReply) {
    const aparato = await request.tenantPrisma.aparatoDelAlumno.findUnique({
        where: { studentId: request.params.studentId },
        select: { descripcion: true, registradoEn: true, ultimoUso: true },
    });
    return reply.send({ success: true, data: aparato });
}

/**
 * Desbloquear: el alumno cambió de teléfono. El siguiente desde el que pase
 * asistencia queda registrado. Queda anotado quién, cuándo y a quién.
 */
export async function desbloquearAparato(request: FastifyRequest<{ Params: { studentId: string } }>, reply: FastifyReply) {
    const prisma = request.tenantPrisma;
    const { studentId } = request.params;
    const aparato = await prisma.aparatoDelAlumno.findUnique({ where: { studentId } });
    if (!aparato) return reply.send({ success: true, data: { desbloqueado: false } });

    await borrarGuardandoCopia(prisma, 'aparatoDelAlumno', { studentId }, quienBorra(request as any));
    await prisma.auditLog.create({
        data: {
            action: 'DESBLOQUEAR_TELEFONO',
            entity: 'APARATO_DEL_ALUMNO',
            entityType: 'APARATO_DEL_ALUMNO',
            entityId: studentId,
            oldValues: { descripcion: aparato.descripcion, registradoEn: aparato.registradoEn.toISOString() },
            ipAddress: request.ip,
            userAgent: String(request.headers['user-agent'] ?? '').slice(0, 250),
            level: 'SECURITY',
            userId: quien(request).id,
        },
    });
    return reply.send({ success: true, data: { desbloqueado: true } });
}
