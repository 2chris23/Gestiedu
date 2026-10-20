/// <reference path="../../types/fastify.d.ts" />
import { VUELTAS_DE_CIFRADO, requireTenant, datosParaElMinisterio } from './comun';
import { UserRole, ActionType } from '../../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { UpdateUserInput } from '../../utils/validators';
import { logger } from '../../utils/logger';
import bcrypt from 'bcrypt';
import { RequestUser } from '../../types/fastify';
import { invalidateUserSession } from '../../middleware/auth.middleware';
import { fueModificadoPorOtro, versionVista, AVISO_MODIFICADO_POR_OTRO } from '../../utils/concurrencia';
import { cambiarLaCedula } from '../../services/cambiar-cedula.service';
interface UpdateUserRequest {
  Params: { id: string };
  Body: UpdateUserInput;
}

/**
 * Controlador para actualizar un usuario
 */
export async function updateUser(
  request: FastifyRequest<UpdateUserRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const updateData = request.body;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return reply;

    // Verificar permisos
    const reqUser = request.user as RequestUser;
    const userRole = reqUser?.role;
    const requestingUserId = reqUser?.userId;

    if (userRole === UserRole.STUDENT && requestingUserId !== id) {
      return reply.status(403).send({
        error: 'Solo puedes actualizar tu propio perfil',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Verificar que el usuario existe
    const existingUser = await request.tenantPrisma.user.findFirst({
      where: {
        id,
        instituteId,
      },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    // DOS PERSONAS, LA MISMA FICHA
    //
    // Dos administrativos corrigiendo al mismo alumno se pisaban sin enterarse.
    // Si la pantalla mandó la versión que tenía a la vista y ya cambió, se avisa.
    if (fueModificadoPorOtro(versionVista(request as any), existingUser.updatedAt)) {
      return reply.status(409).send({
        ...AVISO_MODIFICADO_POR_OTRO,
        actual: { updatedAt: existingUser.updatedAt },
      });
    }

    // Verificar email único si se está cambiando
    if ((updateData as any).email && (updateData as any).email !== existingUser.email) {
      const emailExists = await request.tenantPrisma.user.findUnique({
        where: {
          email: (updateData as any).email,
        },
      });

      if (emailExists) {
        return reply.status(409).send({
          error: 'Ya existe un usuario con este email',
          code: 'EMAIL_EXISTS',
        });
      }
    }

    // Verificar código de estudiante único si se está cambiando
    if ((updateData as any).studentCode && (updateData as any).studentCode !== (existingUser as any).studentCode) {
      const codeExists = await request.tenantPrisma.user.findFirst({
        where: {
          studentCode: (updateData as any).studentCode,
          instituteId,
        },
      });

      if (codeExists) {
        return reply.status(409).send({
          error: 'Ya existe un estudiante con este código',
          code: 'STUDENT_CODE_EXISTS',
        });
      }
    }

    // Si se asigna a un aula, verificar que existe
    if ((updateData as any).classroomId) {
      const classroom = await request.tenantPrisma.classroom.findFirst({
        where: {
          id: (updateData as any).classroomId,
          instituteId,
        },
      });

      if (!classroom) {
        return reply.status(404).send({
          error: 'Aula no encontrada',
          code: 'CLASSROOM_NOT_FOUND',
        });
      }
    }

    // Prepara datos para actualización
    const dataToUpdate: any = { ...updateData };

    // 1. Hashear password si existe
    if (dataToUpdate.password) {
      dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, VUELTAS_DE_CIFRADO);
    } else {
      delete dataToUpdate.password; // Evitar enviar undefined/null/empty si no se actualiza
    }

    // 2. Convertir birthDate a Date si existe y es string
    if (dataToUpdate.birthDate && typeof dataToUpdate.birthDate === 'string') {
      dataToUpdate.birthDate = new Date(dataToUpdate.birthDate);
    }
    Object.assign(dataToUpdate, datosParaElMinisterio(updateData as any));

    // 3. Mapear Rol si existe
    if (dataToUpdate.role) {
      const { toPrismaUserRole } = await import('../../utils/constants');
      dataToUpdate.role = toPrismaUserRole(dataToUpdate.role);
    }

    // 4. Eliminar campos que no deben actualizarse directamente o limpiar basura
    delete dataToUpdate.id;
    delete dataToUpdate.instituteId;
    delete dataToUpdate.createdAt;
    delete dataToUpdate.updatedAt;

    // Actualizar el usuario y sincronizar inscripción si es estudiante
    const updatedUser = await request.tenantPrisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: dataToUpdate,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          studentCode: true,
          phone: true,
          address: true,
          birthDate: true,
          nacionalidad: true,
          lugarDeNacimiento: true,
          entidadDeNacimiento: true,
          tipoDeCedula: true,
          specialization: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (user.role === 'STUDENT' && dataToUpdate.classroomId) {
        const targetClassroom = await tx.classroom.findUnique({
          where: { id: dataToUpdate.classroomId },
          select: { id: true, academicYearId: true }
        });

        if (targetClassroom && targetClassroom.academicYearId) {
          await tx.studentClassroom.upsert({
            where: {
              studentId_academicYearId: {
                studentId: id,
                academicYearId: targetClassroom.academicYearId
              }
            },
            update: { classroomId: targetClassroom.id, isActive: true },
            create: {
              studentId: id,
              classroomId: targetClassroom.id,
              academicYearId: targetClassroom.academicYearId,
              isActive: true
            }
          });
        }
      }

      return user;
    });

    // Registrar el evento de actualización (Fail-safe)
    try {
      await request.tenantPrisma.auditLog.create({
        data: {
          instituteId,
          action: ActionType.UPDATE,
          entity: 'USER',
          entityType: 'USER',
          entityId: updatedUser.id,
          metadata: {
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            changes: updateData as any,
          },
          userId: (request.user as any)?.id,
        },
      });
    } catch (auditError) {
      logger.error('Error al crear log de auditoría en update', { error: auditError });
      // No lanzamos el error para no afectar la respuesta al cliente
    }

    logger.info('Usuario actualizado', { userId: updatedUser.id });

    // Invalidar caché de sesión: rol/estado/contraseña pudieron cambiar
    await invalidateUserSession(
      request.institute?.id ?? (request.user as any)?.instituteId,
      updatedUser.id
    );

    return reply.status(200).send({ user: updatedUser });
  } catch (error) {
    logger.error('Error al actualizar usuario', {
      error: error instanceof Error ? error.message : String(error),
      userId: request.params.id
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * PUT /users/:id/cedula — cambia la cédula de una persona (la escolar por la de
 * identidad, o una mal escrita). Se escribe dos veces, como se hace con lo que
 * no tiene vuelta atrás fácil.
 */
export async function cambiarCedula(
  request: FastifyRequest<{ Params: { id: string }; Body: { nueva: string; confirmacion: string; tipo?: 'IDENTIDAD' | 'ESCOLAR' } }>,
  reply: FastifyReply
) {
  const { nueva, confirmacion, tipo } = request.body;
  if (String(nueva).trim().toUpperCase() !== String(confirmacion).trim().toUpperCase()) {
    return reply.status(400).send({ error: 'La cédula nueva y su confirmación no son iguales.', code: 'CONFIRMACION_DISTINTA' });
  }
  const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
  const quien = (request.user as any)?.userId ?? (request.user as any)?.id;
  try {
    const hecho = await cambiarLaCedula(request.tenantPrisma, instituteId, { vieja: request.params.id, nueva, tipo, quien });
    return reply.send({ success: true, data: hecho });
  } catch (error: any) {
    if (error?.statusCode) return reply.status(error.statusCode).send({ error: error.message, code: error.code });
    throw error;
  }
}
