import { FastifyReply, FastifyRequest } from 'fastify';
import { UserRole, ActionType } from '../utils/prisma-enums';
import { logger } from '../utils/logger';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { canSeeStudent } from '../services/authorization.service';
import { comprimirFoto, direccionDeLaFoto, PESO_MAXIMO_DE_SUBIDA } from '../services/foto-de-perfil.service';
import { invalidateUserSession } from '../middleware/auth.middleware';

/**
 * RUTAS DE LA FOTO DE PERFIL
 *
 *   GET    /api/users/:id/photo   quien puede ver a esa persona
 *   PUT    /api/users/:id/photo   solo el admin (el alumno no sube nada; el
 *                                 profesor no edita datos personales)
 *   DELETE /api/users/:id/photo   solo el admin
 *
 * Quién ve la foto de quién: la de un ALUMNO, solo quien puede ver a ese alumno
 * (él, sus representantes, sus profesores, el admin). La del personal y los
 * representantes, cualquiera con sesión en el liceo: el alumno tiene que poder
 * reconocer a su profesor.
 */

type ConId = FastifyRequest<{ Params: { id: string } }>;

const liceoDe = (request: FastifyRequest) => request.institute?.id ?? (request.user as any)?.instituteId;

export async function getUserPhoto(request: ConId, reply: FastifyReply) {
    const { id } = request.params;
    const prisma = request.tenantPrisma;

    const persona = await prisma.user.findUnique({ where: { id }, select: { role: true, photo: { select: { data: true, version: true } } } });
    // Misma respuesta para "no existe", "no tiene foto" y "no puedes verla":
    // así nadie averigua qué cédulas hay ni quién tiene foto.
    const noHay = () => reply.status(404).send({ error: 'Sin foto' });
    if (!persona?.photo) return noHay();

    if (persona.role === (UserRole.STUDENT as any) && !(await canSeeStudent(prisma as any, request.user as any, id))) {
        return noHay();
    }

    const etiqueta = `"${persona.photo.version}"`;
    reply
        .header('Content-Type', 'image/webp')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', 'inline')
        .header('ETag', etiqueta)
        // `private`: nunca en una caché compartida (proxy, CDN). La dirección
        // lleva la huella, así que la copia del navegador vale para siempre.
        .header('Cache-Control', 'private, max-age=31536000, immutable');

    if (request.headers['if-none-match'] === etiqueta) return reply.status(304).send();
    return reply.send(Buffer.from(persona.photo.data));
}

export async function putUserPhoto(request: ConId, reply: FastifyReply) {
    const { id } = request.params;
    const prisma = request.tenantPrisma;

    try {
        const persona = await prisma.user.findUnique({ where: { id }, select: { id: true } });
        if (!persona) return reply.status(404).send({ error: 'Usuario no encontrado' });

        const archivo = await (request as any).file({ limits: { fileSize: PESO_MAXIMO_DE_SUBIDA, files: 1 } });
        if (!archivo) return reply.status(400).send({ error: 'No llegó ninguna imagen', code: 'INVALID_PHOTO' });

        const original: Buffer = await archivo.toBuffer();
        if (archivo.file?.truncated) {
            return reply.status(413).send({ error: 'La imagen pesa más de 5 MB', code: 'PHOTO_TOO_LARGE' });
        }

        const foto = await comprimirFoto(original);
        const bytes = new Uint8Array(foto.data);

        await prisma.$transaction([
            prisma.userPhoto.upsert({
                where: { userId: id },
                create: { userId: id, data: bytes, version: foto.version, size: foto.size },
                update: { data: bytes, version: foto.version, size: foto.size },
            }),
            prisma.user.update({ where: { id }, data: { avatar: direccionDeLaFoto(id, foto.version) } }),
        ]);

        try {
            await prisma.auditLog.create({
                data: {
                    instituteId: liceoDe(request),
                    action: ActionType.UPDATE,
                    entity: 'USER_PHOTO',
                    entityType: 'USER_PHOTO',
                    entityId: id,
                    metadata: { ip: request.ip, bytesSubidos: original.length, bytesGuardados: foto.size },
                    userId: (request.user as any)?.userId ?? (request.user as any)?.id,
                },
            });
        } catch {
            // la bitácora no frena la foto
        }

        request.aQuienAfecta = { studentIds: [id] };

        // La sesión guardada lleva el avatar: sin esto la cabecera de la
        // persona seguiría enseñando la foto vieja hasta que caduque.
        await invalidateUserSession(liceoDe(request), id).catch(() => undefined);

        return reply.send({
            avatar: direccionDeLaFoto(id, foto.version),
            bytesSubidos: original.length,
            bytesGuardados: foto.size,
        });
    } catch (error: any) {
        if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
        if (error?.code === 'FST_REQ_FILE_TOO_LARGE') {
            return reply.status(413).send({ error: 'La imagen pesa más de 5 MB', code: 'PHOTO_TOO_LARGE' });
        }
        if (error?.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
            return reply.status(400).send({ error: 'Se esperaba un archivo', code: 'INVALID_PHOTO' });
        }
        logger.error('Error al guardar la foto de perfil', { error: error instanceof Error ? error.message : String(error) });
        return reply.status(500).send({ error: 'Error al guardar la foto' });
    }
}

export async function deleteUserPhoto(request: ConId, reply: FastifyReply) {
    const { id } = request.params;
    const prisma = request.tenantPrisma;

    const borradas = await prisma.$transaction(async (tx: any) => {
        const n = await borrarGuardandoCopia(tx, 'userPhoto', { userId: id }, quienBorra(request as any));
        if (n > 0) await tx.user.update({ where: { id }, data: { avatar: null } });
        return n;
    });
    if (borradas === 0) return reply.status(404).send({ error: 'Sin foto' });

    request.aQuienAfecta = { studentIds: [id] };
    await invalidateUserSession(liceoDe(request), id).catch(() => undefined);
    return reply.send({ message: 'Foto quitada' });
}
