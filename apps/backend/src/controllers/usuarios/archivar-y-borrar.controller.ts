/// <reference path="../../types/fastify.d.ts" />
import { requireTenant } from './comun';
import { UserRole, ActionType } from '../../utils/prisma-enums';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { RequestUser } from '../../types/fastify';
import { invalidateUserSession } from '../../middleware/auth.middleware';
import {
    decrementStudentCount,
    decrementTeacherCount,
} from '../../middleware/plan-limits.middleware';
import { avisarSiFalla } from '../../utils/sin-callar';

interface DeleteUserRequest {
  Params: { id: string };
}

/**
 * Controlador para archivar un usuario
 */
export async function archiveUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return reply;

    const existingUser = await request.tenantPrisma.user.findFirst({
      where: { id, instituteId },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    const updatedUser = await request.tenantPrisma.user.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        isActive: false,
        archivedAt: new Date(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        archivedAt: true,
      },
    });

    // UN ALUMNO ARCHIVADO ES UN ALUMNO RETIRADO: deja su sección.
    //
    // Archivar apagaba solo la cuenta y la inscripción seguía activa: el alumno
    // que ya no viene contaba en el total de la sección, ocupaba cupo, y al
    // cerrar el ciclo se le proponía para el año siguiente (RET-01…03). La
    // inscripción NO se borra: queda inactiva, con sus notas y su historial,
    // y vuelve si se le desarchiva (RET-04). Los ciclos ya cerrados no se tocan.
    if (existingUser.role === 'STUDENT') {
      await request.tenantPrisma.studentClassroom.updateMany({
        where: { studentId: id, isActive: true, academicYear: { status: { not: 'COMPLETED' } } },
        data: { isActive: false },
      });
    }

    // Revocar tokens de refresco y sesiones
    await request.tenantPrisma.refreshToken.deleteMany({
      where: { userId: id },
    });

    await invalidateUserSession(instituteId, id);

    try {
      await request.tenantPrisma.auditLog.create({
        data: {
          instituteId,
          action: ActionType.UPDATE,
          entity: 'USER',
          entityType: 'USER',
          entityId: id,
          metadata: {
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            action: 'ARCHIVE_USER',
            previousStatus: existingUser.status || 'ACTIVE',
          },
          userId: (request.user as any)?.id || (request.user as any)?.userId,
        },
      });
    } catch (auditError) {
      logger.error('Error al crear log de auditoría en archiveUser', { error: auditError });
    }

    logger.info('Usuario archivado exitosamente', { userId: id });

    return reply.status(200).send({
      message: 'Usuario archivado correctamente',
      user: updatedUser,
    });
  } catch (error) {
    logger.error('Error al archivar usuario', {
      error: error instanceof Error ? error.message : String(error),
      userId: request.params.id,
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para desarchivar / restaurar un usuario
 */
export async function unarchiveUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return reply;

    const existingUser = await request.tenantPrisma.user.findFirst({
      where: { id, instituteId },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    const updatedUser = await request.tenantPrisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        isActive: true,
        archivedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        archivedAt: true,
      },
    });

    await invalidateUserSession(instituteId, id);

    // Vuelve a la sección que dejó al archivarlo, si sigue habiendo sitio.
    // Si está llena, se queda fuera y se dice: el admin lo inscribe donde toque.
    let volvioASuSeccion: boolean | null = null;
    if (existingUser.role === 'STUDENT') {
      const dejadas = await request.tenantPrisma.studentClassroom.findMany({
        where: { studentId: id, isActive: false, academicYear: { status: { not: 'COMPLETED' } } },
        include: {
          classroom: {
            select: { capacity: true, isActive: true, _count: { select: { studentClassrooms: { where: { isActive: true } } } } },
          },
        },
      });
      for (const insc of dejadas) {
        const c = insc.classroom as any;
        const hayCupo = c?.isActive !== false && (!c?.capacity || (c._count?.studentClassrooms ?? 0) < c.capacity);
        if (hayCupo) {
          await request.tenantPrisma.studentClassroom.update({ where: { id: insc.id }, data: { isActive: true } });
        }
        volvioASuSeccion = (volvioASuSeccion ?? true) && hayCupo;
      }
    }

    try {
      await request.tenantPrisma.auditLog.create({
        data: {
          instituteId,
          action: ActionType.UPDATE,
          entity: 'USER',
          entityType: 'USER',
          entityId: id,
          metadata: {
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            action: 'UNARCHIVE_USER',
            previousStatus: existingUser.status || 'ARCHIVED',
          },
          userId: (request.user as any)?.id || (request.user as any)?.userId,
        },
      });
    } catch (auditError) {
      logger.error('Error al crear log de auditoría en unarchiveUser', { error: auditError });
    }

    logger.info('Usuario desarchivado / restaurado exitosamente', { userId: id });

    return reply.status(200).send({
      message: volvioASuSeccion === false
        ? 'Usuario restaurado. Su sección está llena: inscríbalo desde la sección que corresponda.'
        : 'Usuario restaurado correctamente',
      user: updatedUser,
      volvioASuSeccion,
    });
  } catch (error) {
    logger.error('Error al desarchivar usuario', {
      error: error instanceof Error ? error.message : String(error),
      userId: request.params.id,
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para eliminar un usuario con reglas diferenciadas:
 * - Estudiante: Eliminación total en cascada de sus notas, asistencias, matrículas e historial para no dejar datos huérfanos.
 * - Profesor: Desvinculación de aulas activas, pero preservación de su nombre completo en el historial de actividades, notas y sesiones.
 * - Tutor / Admin: Limpieza de relaciones directas y eliminación.
 * En todos los casos, la cédula y el email quedan completamente liberados para su recreación exacta.
 */
export async function deleteUser(
  request: FastifyRequest<DeleteUserRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return reply;

    // Verificar que el usuario existe Y pertenece al instituto del request
    const existingUser = await request.tenantPrisma.user.findFirst({
      where: { id, instituteId },
    });

    if (!existingUser) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    const callerUser = request.user as RequestUser;
    const callerId = callerUser?.userId || callerUser?.id;

    const quien = quienBorra(request as any);

    if (existingUser.role === UserRole.STUDENT) {
      // Cascada completa para estudiantes: limpiar todos los datos dependientes para no dejar datos huérfanos.
      //
      // Todo pasa antes por la papelera. Borrar un estudiante se lleva sus notas,
      // sus asistencias, sus observaciones y su historial: si fue un error, no se
      // recuperan de ningún otro sitio hasta el respaldo de anoche.
      await request.tenantPrisma.$transaction(async (tx: any) => {
        await borrarGuardandoCopia(tx, 'grade', { studentId: id }, quien);
        await borrarGuardandoCopia(tx, 'dailyAttendance', { studentId: id }, quien);
        await borrarGuardandoCopia(tx, 'studentClassroom', { studentId: id }, quien);
        await borrarGuardandoCopia(tx, 'studentTutor', { studentId: id }, quien);
        await borrarGuardandoCopia(tx, 'observation', { studentId: id }, quien);
        await borrarGuardandoCopia(tx, 'academicRecord', { studentId: id }, quien);
        // Avisos y sesiones no son información del liceo: no van a la papelera.
        await tx.notification.deleteMany({ where: { recipientId: id } });
        await tx.refreshToken.deleteMany({ where: { userId: id } });
        await borrarGuardandoCopia(tx, 'user', { id }, quien);
      }, { timeout: 30000, maxWait: 10000 });
    } else if (existingUser.role === UserRole.TEACHER) {
      const teacherFullName = `${existingUser.firstName} ${existingUser.lastName}`.trim();

      await request.tenantPrisma.$transaction(async (tx: any) => {
        // Buscar usuario fallback administrativo para reasignar llaves foráneas necesarias
        let fallbackUserId = callerId && callerId !== id ? callerId : null;
        if (!fallbackUserId) {
          const adminUser = await tx.user.findFirst({
            where: { instituteId, role: UserRole.ADMIN, NOT: { id } },
            select: { id: true },
          });
          fallbackUserId = adminUser?.id || null;
        }

        // 1. Preservar nombre del docente en metadatos de plan de evaluación
        await tx.evaluationPlanMetadata.updateMany({
          where: { cedulaDocente: id },
          data: { nombreDocente: teacherFullName },
        });

        // 2. Desvincular de aulas activas
        await tx.classroom.updateMany({
          where: { teacherId: id },
          data: { teacherId: null },
        });
        await tx.classroomSubject.updateMany({
          where: { teacherId: id },
          data: { teacherId: null },
        });
        await borrarGuardandoCopia(tx, 'teacherClassroom', { teacherId: id }, quien);
        await borrarGuardandoCopia(tx, 'subjectTeacherHistory', { teacherId: id }, quien);

        // 3. Actividades creadas por el docente:
        // Reasignar creador al fallback y conservar el nombre completo del profesor en la descripción
        if (fallbackUserId) {
          // TODO EN TRES ESCRITURAS, NO UNA POR FILA
          // Esto iba nota a nota y asistencia a asistencia dentro de la
          // transacción. Un profesor con tres años en el liceo son decenas de
          // miles de filas: la transacción se pasaba de sus 30 s, se deshacía,
          // y el profesor no se podía dar de baja. Ahora lo hace PostgreSQL de
          // una vez, con el mismo resultado fila por fila.
          const tagActividad = `[Profesor histórico: ${teacherFullName}]`;
          await tx.$executeRaw`
            UPDATE activities
               SET "createdBy" = ${fallbackUserId},
                   description = CASE
                     WHEN COALESCE(description, '') = '' THEN ${tagActividad}
                     WHEN strpos(description, ${tagActividad}) > 0 THEN description
                     ELSE description || ' ' || ${tagActividad}
                   END,
                   "updatedAt" = NOW()
             WHERE "createdBy" = ${id}`;

          // 4. Calificaciones dadas por el docente: pasan al de reemplazo, y
          // en su metadata queda quién las puso.
          await tx.$executeRaw`
            UPDATE grades
               SET "teacherId" = ${fallbackUserId},
                   metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END)
                              || jsonb_build_object('historicalTeacherName', ${teacherFullName}::text,
                                                    'historicalTeacherId', ${id}::text),
                   "updatedAt" = NOW()
             WHERE "teacherId" = ${id}`;

          // 5. Asistencias tomadas por el docente:
          const tagAsistencia = `[Tomada por: ${teacherFullName}]`;
          await tx.$executeRaw`
            UPDATE daily_attendance
               SET "teacherId" = ${fallbackUserId},
                   comments = CASE
                     WHEN COALESCE(comments, '') = '' THEN ${tagAsistencia}
                     WHEN strpos(comments, ${tagAsistencia}) > 0 THEN comments
                     ELSE comments || ' ' || ${tagAsistencia}
                   END,
                   "updatedAt" = NOW()
             WHERE "teacherId" = ${id}`;

          // 6. Horarios asignados al docente
          await borrarGuardandoCopia(tx, 'schedule', { teacherId: id }, quien);

          // 7. Observaciones creadas por el docente
          await tx.observation.updateMany({
            where: { createdById: id },
            data: { createdById: fallbackUserId },
          });
        } else {
          // Si no hay admin de reemplazo, se eliminan las referencias que apuntan
          // al docente. Este es el camino más destructivo del sistema: se lleva
          // todas las notas que ese profesor puso y todas las asistencias que
          // tomó. Copia en la papelera antes de tocar nada.
          await borrarGuardandoCopia(tx, 'grade', { teacherId: id }, quien);
          await borrarGuardandoCopia(tx, 'dailyAttendance', { teacherId: id }, quien);
          await borrarGuardandoCopia(tx, 'activity', { createdBy: id }, quien);
          await borrarGuardandoCopia(tx, 'schedule', { teacherId: id }, quien);
          await borrarGuardandoCopia(tx, 'observation', { createdById: id }, quien);
        }

        // 8. Notificaciones y tokens
        await tx.notification.deleteMany({ where: { recipientId: id } });
        await tx.refreshToken.deleteMany({ where: { userId: id } });

        // 9. Eliminar usuario docente de users para liberar cédula e email
        await borrarGuardandoCopia(tx, 'user', { id }, quien);
      }, { timeout: 30000, maxWait: 10000 });
    } else {
      // TUTOR o ADMIN u otros roles
      await request.tenantPrisma.$transaction(async (tx: any) => {
        await borrarGuardandoCopia(tx, 'studentTutor', { tutorId: id }, quien);
        await tx.notification.deleteMany({ where: { recipientId: id } });
        await tx.refreshToken.deleteMany({ where: { userId: id } });
        await borrarGuardandoCopia(tx, 'user', { id }, quien);
      }, { timeout: 30000, maxWait: 10000 });
    }

    // Registrar el evento de eliminación (Fail-safe)
    try {
      await request.tenantPrisma.auditLog.create({
        data: {
          instituteId,
          action: ActionType.DELETE,
          entity: 'USER',
          entityType: 'USER',
          entityId: id,
          metadata: {
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            deletedUserEmail: existingUser.email,
            deletedUserRole: existingUser.role,
          },
          userId: (request.user as any)?.id,
        },
      });
    } catch (auditError) {
      logger.error('Error al crear log de auditoría en delete', { error: auditError });
    }

    logger.info('Usuario eliminado con éxito', { userId: id });

    if (existingUser.role === UserRole.STUDENT) {
      decrementStudentCount(instituteId).catch(avisarSiFalla('users.controller'));
    } else if (existingUser.role === UserRole.TEACHER) {
      decrementTeacherCount(instituteId).catch(avisarSiFalla('users.controller'));
    }

    // Invalidar caché de sesión del usuario eliminado
    await invalidateUserSession(
      request.institute?.id ?? (request.user as any)?.instituteId,
      id
    );

    return reply.status(200).send({
      message: 'Usuario eliminado correctamente',
    });
  } catch (error) {
    logger.error('Error al eliminar usuario', {
      error: error instanceof Error ? error.message : String(error),
      userId: request.params.id
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
