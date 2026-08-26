import { UserRole, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput, UpdateUserInput, UserFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';

interface CreateTeacherRequest {
  Body: CreateUserInput;
}

interface UpdateTeacherRequest {
  Params: { id: string };
  Body: UpdateUserInput;
}

interface GetTeacherRequest {
  Params: { id: string };
}

interface GetTeachersRequest {
  Querystring: UserFiltersInput & PaginationInput;
}

interface DeleteTeacherRequest {
  Params: { id: string };
}

interface AssignSubjectsRequest {
  Params: { id: string };
  Body: {
    subjectIds: string[];
  };
}

/**
 * Controlador para crear un nuevo profesor
 */
export async function createTeacher(
  request: FastifyRequest<CreateTeacherRequest>,
  reply: FastifyReply
) {
  try {
    const teacherData = { ...request.body, role: UserRole.TEACHER };

    // Verificar si el profesor ya existe
    const existingTeacher = await request.tenantPrisma.user.findUnique({
      where: {
        id: teacherData.id,
      },
    });

    if (existingTeacher) {
      return reply.status(409).send({
        error: 'El profesor ya existe',
        code: 'TEACHER_EXISTS',
      });
    }

    const teacher = await request.tenantPrisma.user.create({
      data: {
        ...(teacherData as any),
      },
      include: {
        institute: {
          select: {
            id: true,
            name: true,
          },
        },
        subjectTeachings: {
          include: {
            subject: true,
            classroom: { select: { id: true, name: true } },
          },
        },
        classroomsAsTeacher: {
          select: {
            id: true,
            name: true,
            grade: true,
          },
        },
      },
    });

    // Registrar el evento de creación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.CREATE,
        entity: 'TEACHER',
        entityType: 'TEACHER',
        entityId: teacher.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Nuevo profesor creado', { teacherId: teacher.id });

    return reply.status(201).send({
      teacher: {
        ...teacher,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al crear profesor', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener todos los profesores
 */
export async function getTeachers(
  request: FastifyRequest<GetTeachersRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      isActive = true,
    } = request.query;


    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
      role: UserRole.TEACHER,
      isActive,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Obtener profesores y total
    const [teachers, total] = await Promise.all([
      request.tenantPrisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          institute: {
            select: {
              id: true,
              name: true,
            },
          },
          subjectTeachings: {
            include: {
              subject: {
                select: {
                  id: true,
                  name: true,
                },
              },
              classroom: {
                select: { id: true, name: true }
              }
            },
          },
          classroomsAsTeacher: {
            select: {
              id: true,
              name: true,
              grade: true,
              _count: {
                select: {
                  students: true,
                },
              },
            },
          },
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
      teachers: teachers.map(teacher => ({
        ...teacher,
        password: undefined, // No devolver la contraseña
      })),
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
    logger.error('Error al obtener profesores', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener un profesor por ID
 */
export async function getTeacher(
  request: FastifyRequest<GetTeacherRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    const teacher = await request.tenantPrisma.user.findUnique({
      where: {
        id,
      },
      include: {
        institute: {
          select: {
            id: true,
            name: true,
          },
        },
        subjectTeachings: {
          include: {
            subject: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
            classroom: { select: { id: true, name: true } }
          },
        },
        classroomsAsTeacher: {
          include: {
            _count: {
              select: {
                students: true,
              },
            },
          },
        },
        gradesGiven: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            subject: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 20, // Últimas 20 calificaciones dadas
        },
      },
    });

    if (!teacher || teacher.role !== UserRole.TEACHER) {
      return reply.status(404).send({
        error: 'Profesor no encontrado',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    return reply.status(200).send({
      teacher: {
        ...teacher,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al obtener profesor', { error, teacherId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para actualizar un profesor
 */
export async function updateTeacher(
  request: FastifyRequest<UpdateTeacherRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    // Excluir 'role' para evitar conflicto de tipo RoleES vs UserRole
    const { role: _ignoredRole, ...updateData } = request.body as any;

    // Verificar que el profesor existe
    const existingTeacher = await request.tenantPrisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!existingTeacher || existingTeacher.role !== UserRole.TEACHER) {
      return reply.status(404).send({
        error: 'Profesor no encontrado',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    // Actualizar el profesor
    const teacher = await request.tenantPrisma.user.update({
      where: {
        id,
      },
      data: {
        ...updateData,
      },
      include: {
        institute: {
          select: {
            id: true,
            name: true,
          },
        },
        subjectTeachings: {
          include: {
            subject: true,
            classroom: { select: { id: true, name: true } },
          },
        },
        classroomsAsTeacher: {
          select: {
            id: true,
            name: true,
            grade: true,
          },
        },
      },
    });

    // Registrar el evento de actualización
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'TEACHER',
        entityType: 'TEACHER',
        entityId: teacher.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Profesor actualizado', { teacherId: teacher.id });

    return reply.status(200).send({
      teacher: {
        ...teacher,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al actualizar profesor', { error, teacherId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para eliminar (desactivar) un profesor
 */
export async function deleteTeacher(
  request: FastifyRequest<DeleteTeacherRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Verificar que el profesor existe
    const existingTeacher = await request.tenantPrisma.user.findUnique({
      where: { id },
      include: { classroomsAsTeacher: true },
    });

    if (!existingTeacher || existingTeacher.role !== UserRole.TEACHER) {
      return reply.status(404).send({
        error: 'Profesor no encontrado',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    // Verificar si el profesor tiene aulas asignadas
    if (existingTeacher.classroomsAsTeacher.length > 0) {
      return reply.status(400).send({
        error: 'No se puede eliminar un profesor que tiene aulas asignadas',
        code: 'TEACHER_HAS_CLASSROOMS',
        metadata: {
          classrooms: existingTeacher.classroomsAsTeacher.length,
        },
      });
    }

    // Desactivar el profesor en lugar de eliminarlo
    const teacher = await request.tenantPrisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Registrar el evento de eliminación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.DELETE,
        entity: 'TEACHER',
        entityType: 'TEACHER',
        entityId: teacher.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Profesor desactivado', { teacherId: teacher.id });

    return reply.status(200).send({
      message: 'Profesor eliminado correctamente',
    });
  } catch (error) {
    logger.error('Error al eliminar profesor', { error, teacherId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para asignar materias a un profesor
 */
export async function assignSubjectsToTeacher(
  request: FastifyRequest<AssignSubjectsRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { subjectIds } = request.body;

    // Verificar que el profesor existe
    const existingTeacher = await request.tenantPrisma.user.findUnique({
      where: { id },
    });

    if (!existingTeacher || existingTeacher.role !== UserRole.TEACHER) {
      return reply.status(404).send({
        error: 'Profesor no encontrado',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    // Verificar que todas las materias existen
    const subjects = await request.tenantPrisma.subject.findMany({
      where: { id: { in: subjectIds } },
    });

    if (subjects.length !== subjectIds.length) {
      return reply.status(404).send({
        error: 'Una o más materias no encontradas',
        code: 'SUBJECTS_NOT_FOUND',
      });
    }

    // Nota: En el esquema actual, la asignación de materias a profesores
    // se modela a través de ClassroomSubject (relación con aula y materia).
    // Aquí no contamos con classroomId, por lo que este endpoint no puede
    // recrearse directamente. Dejamos la validación y devolvemos 400.
    return reply.status(400).send({
      error: 'Asignación de materias requiere contexto de aula (classroomId)',
      code: 'ASSIGN_SUBJECTS_UNSUPPORTED_SINGLE_TENANT',
    });

    // Obtener el profesor actualizado con las materias
    // No se ejecuta código adicional porque ya retornamos 400 arriba
  } catch (error) {
    logger.error('Error al asignar materias al profesor', { error, teacherId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener las materias de un profesor
 */
export async function getTeacherSubjects(
  request: FastifyRequest<GetTeacherRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Verificar que el profesor existe
    const teacher = await request.tenantPrisma.user.findUnique({
      where: { id },
      include: {
        subjectTeachings: {
          include: {
            subject: true,
            classroom: true,
          },
        },
      },
    });

    if (!teacher || teacher.role !== UserRole.TEACHER) {
      return reply.status(404).send({
        error: 'Profesor no encontrado',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    return reply.status(200).send({
      subjects: teacher.subjectTeachings.map(ts => ts.subject),
    });
  } catch (error) {
    logger.error('Error al obtener materias del profesor', { error, teacherId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
