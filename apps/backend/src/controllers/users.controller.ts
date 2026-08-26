import { UserRole, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput, UpdateUserInput, UserFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import { RequestUser } from '../types/fastify';
import { invalidateUserSession } from '../middleware/auth.middleware';

/** Resuelve el instituto actual del request (inyectado por identifyTenant). */
function getInstituteId(request: FastifyRequest): string | null {
  return request.institute?.id ?? (request.user as any)?.instituteId ?? null;
}

/** Guard para operaciones que requieren tenant resuelto (fail closed, no hardcode). */
function requireTenant(request: FastifyRequest, reply: FastifyReply): string | null {
  const instituteId = getInstituteId(request);
  if (!instituteId || !request.tenantPrisma) {
    reply.status(400).send({
      error: 'No se pudo determinar el instituto',
      code: 'INSTITUTE_REQUIRED',
    });
    return null;
  }
  return instituteId;
}

interface CreateUserRequest {
  Body: CreateUserInput;
}

interface UpdateUserRequest {
  Params: { id: string };
  Body: UpdateUserInput;
}

interface GetUserRequest {
  Params: { id: string };
}

interface GetUsersRequest {
  Querystring: UserFiltersInput & PaginationInput;
}

interface DeleteUserRequest {
  Params: { id: string };
}

interface ToggleUserStatusRequest {
  Params: { id: string };
}

interface AssignStudentToClassroomRequest {
  Params: { id: string };
  Body: {
    classroomId: string;
  };
}

/**
 * Controlador para crear un nuevo usuario
 */
export async function createUser(
  request: FastifyRequest<CreateUserRequest>,
  reply: FastifyReply
) {
  try {
    const userData = request.body;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return;

    // Verificar si ya existe un usuario con el mismo email
    const existingUser = await request.tenantPrisma.user.findUnique({
      where: {
        email: userData.email,
      },
    });

    if (existingUser) {
      return reply.status(409).send({
        error: 'Ya existe un usuario con este email',
        code: 'USER_EXISTS',
      });
    }

    // Nota: Roles en entrada vienen en español; se mapean a Prisma

    // Hashear la contraseña (o generar una temporal para MVP)
    const hashedPassword = await bcrypt.hash(userData.password || 'temporal123', 10);

    // Mapear rol ES -> Prisma
    const { toPrismaUserRole } = await import('../utils/constants');
    const prismaRole = toPrismaUserRole(userData.role as any);

    // Crear el usuario con TODOS los campos necesarios
    const user = await request.tenantPrisma.user.create({
      data: {
        // Si no viene ID, dejamos que Prisma genere uno (undefined activa el @default(cuid()))
        id: userData.id || undefined as any,
        email: userData.email.toLowerCase(),
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: prismaRole,
        instituteId, // Resuelto del tenant (request.institute / JWT), no hardcodeado
        gender: userData.gender as any,
        phone: userData.phone,
        address: userData.address,
        birthDate: userData.birthDate ? new Date(userData.birthDate) : undefined,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Registrar el evento de creación
    await request.tenantPrisma.auditLog.create({
      data: {
        instituteId,
        action: ActionType.CREATE,
        entity: 'USER',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'] || 'unknown',
          userRole: user.role,
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Nuevo usuario creado', { userId: user.id, role: user.role });

    return reply.status(201).send({ user });
  } catch (error) {
    logger.error('Error al crear usuario', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener todos los usuarios
 */
export async function getUsers(
  request: FastifyRequest<GetUsersRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      classroomId,
      isActive,
    } = request.query;

    // Verificar permisos basados en el rol (DESHABILITADO PARA MVP)
    // const user = request.user as RequestUser;
    // const userRole = user?.role;
    // if (userRole === UserRole.STUDENT) {
    //   return reply.status(403).send({
    //     error: 'No tienes permisos para ver otros usuarios',
    //     code: 'INSUFFICIENT_PERMISSIONS',
    //   });
    // }

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { id: { contains: search } }, // Permitir búsqueda por cédula
      ];
    }

    if (role) {
      const { toPrismaUserRole } = await import('../utils/constants');
      where.role = toPrismaUserRole(role as any);
    }

    if (classroomId) {
      where.classroomId = classroomId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Obtener usuarios y total
    const [users, total] = await Promise.all([
      request.tenantPrisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      }),
      request.tenantPrisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return reply.status(200).send({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error('Error al obtener usuarios', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener un usuario por ID
 */
export async function getUser(
  request: FastifyRequest<GetUserRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Verificar permisos
    const requestUser = request.user as RequestUser;
    const userRole = requestUser?.role;
    const requestingUserId = requestUser?.userId;

    if (userRole === UserRole.STUDENT && requestingUserId !== id) {
      return reply.status(403).send({
        error: 'Solo puedes ver tu propio perfil',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    const user = await request.tenantPrisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        // Datos específicos de estudiante
        studentCode: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        studentTutorings: {
          select: {
            tutor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              }
            },
            relationship: true,
          }
        },
        // Datos específicos de profesor
        specialization: true,
        subjectTeachings: {
          select: {
            subject: {
              select: {
                name: true,
                code: true
              }
            },
            classroom: {
              select: {
                name: true,
                section: true,
                academicYear: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        },
        teacherClassrooms: {
          select: {
            isMainTeacher: true,
            classroom: {
              select: {
                id: true,
                name: true,
                slug: true,
                section: true,
                grade: true,
                academicYear: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    startDate: true,
                    endDate: true
                  }
                }
              }
            }
          }
        },
        // Datos específicos de tutor
        children: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                classroom: {
                  select: {
                    name: true
                  }
                }
              }
            },
            relationship: true
          }
        },
        // Datos comunes (Notas y Asistencia recientes)
        grades: {
          select: {
            id: true,
            score: true,
            createdAt: true,
            activity: {
              select: {
                title: true,
                type: true,
              },
            },
            subject: {
              select: {
                name: true,
              },
            },
            period: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
        attendance: {
          select: {
            id: true,
            status: true,
            date: true,
          },
          orderBy: {
            date: 'desc',
          },
          take: 5,
        },
      },
    });

    if (!user) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    return reply.status(200).send({ user });
  } catch (error) {
    logger.error('Error al obtener usuario', {
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
 * Obtener usuarios por rol
 */
export async function getUsersByRole(
  request: FastifyRequest<{ Params: { role: string } }>,
  reply: FastifyReply
) {
  try {
    const { role } = request.params;
    const { toPrismaUserRole } = await import('../utils/constants');
    const prismaRole = toPrismaUserRole(role as any);

    const users = await request.tenantPrisma.user.findMany({
      where: { role: prismaRole },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return reply.status(200).send({ users });
  } catch (error) {
    logger.error('Error al obtener usuarios por rol', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

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

    const data = request.body || {};

    const user = await request.tenantPrisma.user.update({
      where: { id: userId },
      data,
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

/**
 * Estadísticas de usuarios
 */
export async function getUserStats(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const [total, active, admins, teachers, students, tutors] = await Promise.all([
      request.tenantPrisma.user.count(),
      request.tenantPrisma.user.count({ where: { isActive: true } }),
      request.tenantPrisma.user.count({ where: { role: UserRole.ADMIN } }),
      request.tenantPrisma.user.count({ where: { role: UserRole.TEACHER } }),
      request.tenantPrisma.user.count({ where: { role: UserRole.STUDENT } }),
      request.tenantPrisma.user.count({ where: { role: UserRole.TUTOR } }),
    ]);

    return reply.status(200).send({
      stats: {
        total,
        active,
        byRole: {
          ADMIN: admins,
          TEACHER: teachers,
          STUDENT: students,
          TUTOR: tutors,
        },
      },
    });
  } catch (error) {
    logger.error('Error al obtener estadísticas de usuarios', {
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Error en el servidor', code: 'INTERNAL_SERVER_ERROR' });
  }
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
    if (!instituteId) return;

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
      dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
    } else {
      delete dataToUpdate.password; // Evitar enviar undefined/null/empty si no se actualiza
    }

    // 2. Convertir birthDate a Date si existe y es string
    if (dataToUpdate.birthDate && typeof dataToUpdate.birthDate === 'string') {
      dataToUpdate.birthDate = new Date(dataToUpdate.birthDate);
    }

    // 3. Mapear Rol si existe
    if (dataToUpdate.role) {
      const { toPrismaUserRole } = await import('../utils/constants');
      dataToUpdate.role = toPrismaUserRole(dataToUpdate.role);
    }

    // 4. Eliminar campos que no deben actualizarse directamente o limpiar basura
    delete dataToUpdate.id;
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
          specialization: true,
          isActive: true,
          updatedAt: true,
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true,
              academicYearId: true
            },
          },
        },
      });

      if (user.role === 'STUDENT' && dataToUpdate.classroomId) {
        if (user.classroom) {
          // Desactivar inscripciones anteriores
          await tx.studentClassroom.updateMany({
            where: { studentId: id, isActive: true },
            data: { isActive: false }
          });

          const existingEnrollment = await tx.studentClassroom.findFirst({
            where: { studentId: id, classroomId: user.classroom.id }
          });

          if (existingEnrollment) {
            await tx.studentClassroom.update({
              where: { id: existingEnrollment.id },
              data: { isActive: true }
            });
          } else {
            await tx.studentClassroom.create({
              data: {
                studentId: id,
                classroomId: user.classroom.id,
                academicYearId: user.classroom.academicYearId as string,
                isActive: true
              }
            });
          }
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
 * Controlador para eliminar un usuario
 */
export async function deleteUser(
  request: FastifyRequest<DeleteUserRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return;

    // Solo administradores pueden eliminar usuarios (DESHABILITADO PARA MVP para facilitar pruebas)
    // if (request.user?.role !== UserRole.ADMIN) {
    //   return reply.status(403).send({
    //     error: 'Solo los administradores pueden eliminar usuarios',
    //     code: 'INSUFFICIENT_PERMISSIONS',
    //   });
    // }

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

    // Eliminar el usuario
    try {
      await request.tenantPrisma.user.delete({
        where: { id },
      });
    } catch (dbError: any) {
      if (dbError.code === 'P2003') {
        logger.warn('Intento de eliminar usuario con relaciones', { userId: id });
        return reply.status(409).send({
          error: 'No se puede eliminar el usuario',
          message: 'El usuario tiene registros relacionados (notas, asistencias, etc.) que impiden su eliminación permanente. Intente desactivar el usuario en su lugar.',
          code: 'FOREIGN_KEY_CONSTRAINT',
        });
      }
      throw dbError;
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

    logger.info('Usuario eliminado', { userId: id });

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

/**
 * Controlador para activar/desactivar un usuario
 */
export async function toggleUserStatus(
  request: FastifyRequest<ToggleUserStatusRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const instituteId = request.headers['x-institute-id'] as string;

    if (!instituteId) {
      return reply.status(400).send({
        error: 'No se pudo determinar el instituto',
        code: 'INSTITUTE_REQUIRED',
      });
    }

    // Solo administradores y profesores pueden cambiar estados
    if (
      request.user?.role !== UserRole.ADMIN &&
      request.user?.role !== UserRole.TEACHER
    ) {
      return reply.status(403).send({
        error: 'No tienes permisos para cambiar el estado de usuarios',
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

    // Cambiar el estado
    const user = await request.tenantPrisma.user.update({
      where: { id },
      data: { isActive: !existingUser.isActive },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    // Registrar el evento
    await request.tenantPrisma.auditLog.create({
      data: {
        instituteId: (request.user as any).instituteId,
        action: ActionType.UPDATE,
        entity: 'USER',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          previousStatus: existingUser.isActive,
          newStatus: user.isActive,
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info(
      `Usuario ${user.isActive ? 'activado' : 'desactivado'}`,
      { userId: user.id, isActive: user.isActive }
    );

    // Invalidar caché de sesión: la activación/desactivación debe surtir efecto inmediato
    await invalidateUserSession(
      request.institute?.id ?? (request.user as any)?.instituteId,
      user.id
    );

    return reply.status(200).send({
      message: `Usuario ${user.isActive ? 'activado' : 'desactivado'} correctamente`,
      user,
    });
  } catch (error) {
    logger.error('Error al cambiar estado del usuario', {
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
 * Controlador para asignar un estudiante a un aula
 */
export async function assignStudentToClassroom(
  request: FastifyRequest<AssignStudentToClassroomRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { classroomId } = request.body;
    const instituteId = request.headers['x-institute-id'] as string;

    if (!instituteId) {
      return reply.status(400).send({
        error: 'No se pudo determinar el instituto',
        code: 'INSTITUTE_REQUIRED',
      });
    }

    // Verificar que el estudiante existe
    const student = await request.tenantPrisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Verificar que el aula existe
    const classroom = await request.tenantPrisma.classroom.findFirst({
      where: {
        id: classroomId,
        instituteId,
      },
    });

    if (!classroom) {
      return reply.status(404).send({
        error: 'Aula no encontrada',
        code: 'CLASSROOM_NOT_FOUND',
      });
    }

    // Asignar el estudiante al aula usando transacción para sincronizar inscripción
    const updatedStudent = await request.tenantPrisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { classroomId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          studentCode: true,
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true,
              academicYearId: true
            },
          },
        },
      });

      if (user.classroom) {
        // Desactivar inscripciones anteriores activas
        await tx.studentClassroom.updateMany({
          where: { studentId: id, isActive: true },
          data: { isActive: false }
        });

        // Buscar si ya existe una inscripción
        const existingEnrollment = await tx.studentClassroom.findFirst({
          where: { studentId: id, classroomId: user.classroom.id }
        });

        if (existingEnrollment) {
          await tx.studentClassroom.update({
            where: { id: existingEnrollment.id },
            data: { isActive: true }
          });
        } else {
          await tx.studentClassroom.create({
            data: {
              studentId: id,
              classroomId: user.classroom.id,
              academicYearId: user.classroom.academicYearId as string,
              isActive: true
            }
          });
        }
      }

      return user;
    });

    // Registrar el evento
    await request.tenantPrisma.auditLog.create({
      data: {
        instituteId: (request.user as any).instituteId,
        action: ActionType.UPDATE,
        entity: 'USER',
        entityType: 'USER',
        entityId: id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          classroomId,
          classroomName: classroom.name,
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info(
      'Estudiante asignado al aula',
      { studentId: id, classroomId }
    );

    return reply.status(200).send({
      message: 'Estudiante asignado al aula correctamente',
      student: updatedStudent,
    });
  } catch (error) {
    logger.error('Error al asignar estudiante al aula', {
      error: error instanceof Error ? error.message : String(error),
      studentId: request.params.id
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
