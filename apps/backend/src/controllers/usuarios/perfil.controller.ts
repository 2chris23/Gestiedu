/// <reference path="../../types/fastify.d.ts" />
import { UserRole } from '../../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { RequestUser } from '../../types/fastify';
import { NOTAS_QUE_CUENTAN } from '../../services/apreciaciones.service';

/**
 * Perfil del usuario autenticado
 * MODIFICADO: Incluye historial académico multi-ciclo para estudiantes
 */
export async function getUserProfile(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as RequestUser)?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'No autenticado', code: 'UNAUTHORIZED' });
    }

    const user = await request.tenantPrisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        phone: true,
        address: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
    }

    // Si es estudiante, agregar historial académico multi-ciclo
    let academicArchive = undefined;
    if (user.role === UserRole.STUDENT) {
      // Obtener todos los enrollments del estudiante con información del año académico
      const enrollments = await request.tenantPrisma.studentClassroom.findMany({
        where: {
          studentId: userId,
        },
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true,
            },
          },
          academicYear: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: {
          academicYear: {
            startDate: 'desc', // Más reciente primero
          },
        },
      });

      // Construir el historial académico
      academicArchive = await Promise.all(
        enrollments.map(async (enrollment) => {
          let average = 0;

          // Si el año está completado, buscar en AcademicRecord
          if (enrollment.academicYear.status === 'COMPLETED') {
            const academicRecord = await request.tenantPrisma.academicRecord.findUnique({
              where: {
                studentId_academicYearId: {
                  studentId: userId,
                  academicYearId: enrollment.academicYearId,
                },
              },
              select: {
                finalAverage: true,
              },
            });

            average = academicRecord?.finalAverage ?? 0;
          } else {
            // Si está activo o upcoming, calcular promedio actual de las grades
            const gradeAggregate = await request.tenantPrisma.grade.aggregate({
              where: {
                studentId: userId,
                ...NOTAS_QUE_CUENTAN,
                period: {
                  academicYearId: enrollment.academicYearId,
                },
              },
              _avg: {
                score: true,
              },
            });

            average = gradeAggregate._avg.score ?? 0;
          }

          return {
            cycle: enrollment.academicYear.name,
            status: enrollment.academicYear.status,
            grade: enrollment.classroom.grade,
            section: enrollment.classroom.section,
            average: Math.round(average * 100) / 100, // Redondear a 2 decimales
            enrollmentId: enrollment.id,
            classroomName: enrollment.classroom.name,
          };
        })
      );
    }

    return reply.status(200).send({
      user,
      ...(academicArchive && { academicArchive }),
    });
  } catch (error) {
    logger.error('Error al obtener perfil de usuario', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error en el servidor', code: 'INTERNAL_SERVER_ERROR' });
  }
}

/**
 * Actualizar perfil del usuario autenticado
 */
export async function updateUserProfile(
  request: FastifyRequest<{ Body: { firstName?: string; lastName?: string; phone?: string; address?: string } }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as RequestUser)?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'No autenticado', code: 'UNAUTHORIZED' });
    }

    const rawBody = (request.body || {}) as Record<string, unknown>;
    const allowedData: { firstName?: string; lastName?: string; phone?: string; address?: string } = {};

    if (typeof rawBody.firstName === 'string') allowedData.firstName = rawBody.firstName.trim();
    if (typeof rawBody.lastName === 'string') allowedData.lastName = rawBody.lastName.trim();
    if (typeof rawBody.phone === 'string') allowedData.phone = rawBody.phone.trim();
    if (typeof rawBody.address === 'string') allowedData.address = rawBody.address.trim();

    const user = await request.tenantPrisma.user.update({
      where: { id: userId },
      data: allowedData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        phone: true,
        address: true,
        updatedAt: true,
      },
    });

    logger.info('Perfil de usuario actualizado', { userId });
    return reply.status(200).send({ user });
  } catch (error) {
    logger.error('Error al actualizar perfil de usuario', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error en el servidor', code: 'INTERNAL_SERVER_ERROR' });
  }
}
