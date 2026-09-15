import { UserRole, ActionType } from '../utils/prisma-enums';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput, UpdateUserInput, UserFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import { RequestUser } from '../types/fastify';
import { invalidateUserSession } from '../middleware/auth.middleware';
import { fueModificadoPorOtro, versionVista, AVISO_MODIFICADO_POR_OTRO } from '../utils/concurrencia';

/**
 * Cuánto cuesta cifrar una contraseña.
 *
 * Cada vuelta dobla el trabajo. Estaba en 10; se sube a 12, que es lo
 * recomendado hoy. Al que entra le cuesta unas décimas de segundo más — no lo
 * nota. A quien intente probar contraseñas a lo bruto le cuesta cuatro veces
 * más, y eso sí lo nota.
 */
const VUELTAS_DE_CIFRADO = 12;

/** Lo mínimo que puede medir una contraseña. */
const MINIMO_DE_CONTRASENA = 8;

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

    // Verificar si ya existe un usuario con la misma cédula / ID
    if (userData.id) {
      const existingUserById = await request.tenantPrisma.user.findUnique({
        where: {
          id: userData.id,
        },
      });

      if (existingUserById) {
        return reply.status(409).send({
          error: 'Ya existe un usuario con este documento de identidad / cédula',
          code: 'DOCUMENT_ALREADY_EXISTS',
          field: ['id'],
        });
      }
    }

    // Nota: Roles en entrada vienen en español; se mapean a Prisma

    // SIN CONTRASEÑA NO SE CREA LA CUENTA
    //
    // Antes esta línea decía `userData.password || 'temporal123'`: si no se
    // mandaba contraseña, se le ponía esa. La misma para todas las cuentas
    // creadas así, y **escrita en el código fuente**.
    //
    // Se reprodujo: crear un alumno sin contraseña y entrar con `temporal123`
    // devolvía 200. Cualquiera que hubiera visto el código —o probado una
    // contraseña común— entraba en esas cuentas.
    //
    // Y era alcanzable: la pantalla de crear usuario borra el campo cuando va
    // vacío, con un comentario que decía "aunque el validador debería atraparlo".
    // Un guardia que "debería" no es un guardia.
    //
    // Ahora se exige y se explica. Es lo correcto para un liceo: el admin pone la
    // contraseña y se la entrega a la persona.
    if (!userData.password || String(userData.password).trim().length < MINIMO_DE_CONTRASENA) {
      return reply.status(400).send({
        error: 'Hace falta una contraseña',
        message: `La contraseña es obligatoria y debe tener al menos ${MINIMO_DE_CONTRASENA} caracteres.`,
        code: 'CONTRASENA_REQUERIDA',
        field: ['password'],
      });
    }

    const hashedPassword = await bcrypt.hash(userData.password, VUELTAS_DE_CIFRADO);

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
  } catch (error: any) {
    logger.error('Error al crear usuario', { error: error instanceof Error ? error.message : String(error) });

    if (error?.code === 'P2002') {
      const target = (error.meta?.target as string[]) || ['campo'];
      return reply.status(409).send({
        error: 'Ya existe un usuario con ese dato único',
        message: `Ya existe un usuario con el mismo valor en: ${target.join(', ')}`,
        code: 'DUPLICATE_ENTRY',
        field: target,
      });
    }

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

    if (search && search.trim()) {
      const terms = search.trim().split(/\s+/).filter(Boolean);
      if (terms.length === 1) {
        where.OR = [
          { firstName: { contains: terms[0], mode: 'insensitive' } },
          { lastName: { contains: terms[0], mode: 'insensitive' } },
          { email: { contains: terms[0], mode: 'insensitive' } },
          { studentCode: { contains: terms[0], mode: 'insensitive' } },
          { id: { contains: terms[0], mode: 'insensitive' } },
        ];
      } else if (terms.length > 1) {
        where.AND = terms.map((term: string) => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { studentCode: { contains: term, mode: 'insensitive' } },
            { id: { contains: term, mode: 'insensitive' } },
          ]
        }));
      }
    }

    if (role && (role as string) !== 'ALL') {
      const { toPrismaUserRole } = await import('../utils/constants');
      where.role = toPrismaUserRole(role as any);
    }

    if (classroomId) {
      where.classroomId = classroomId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const statusParam = (request.query as any).status;
    if (statusParam === 'ARCHIVED') {
      where.status = 'ARCHIVED';
    } else if (statusParam === 'ALL') {
      // No filtrar por status
    } else if (statusParam === 'ACTIVE') {
      where.status = 'ACTIVE';
    } else if (isActive === undefined) {
      // Por defecto listar sólo usuarios activos
      where.status = 'ACTIVE';
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
          status: true,
          archivedAt: true,
          studentCode: true,
          avatar: true,
          isActive: true,
          createdAt: true,
          studentClassrooms: {
            where: { isActive: true },
            orderBy: [
              { academicYear: { startDate: 'desc' } },
              { createdAt: 'desc' }
            ],
            take: 1,
            select: {
              academicYear: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  startDate: true,
                }
              },
              classroom: {
                select: {
                  id: true,
                  name: true,
                  grade: true,
                  section: true,
                  slug: true,
                  academicYear: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                      startDate: true,
                    }
                  }
                }
              }
            }
          },
          subjectTeachings: {
            select: {
              weeklyBlocks: true,
              hoursPerWeek: true,
            }
          }
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
      users: users.map((u: any) => {
        const totalWeeklyBlocks = u.subjectTeachings?.reduce((sum: number, st: any) => sum + (st.weeklyBlocks || 0), 0) || 0;
        const totalWeeklyHours = u.subjectTeachings?.reduce((sum: number, st: any) => sum + (st.hoursPerWeek || ((st.weeklyBlocks || 0) * 45 / 60)), 0) || 0;

        const latestEnrollment = u.studentClassrooms?.[0] || null;
        const activeClassroom = latestEnrollment?.classroom ? {
          ...latestEnrollment.classroom,
          academicYear: latestEnrollment.academicYear || latestEnrollment.classroom?.academicYear || null
        } : null;

        return {
          ...u,
          classroom: activeClassroom,
          totalWeeklyBlocks,
          totalWeeklyHours,
        };
      }),
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
        studentClassrooms: {
          where: { isActive: true },
          orderBy: [
            { academicYear: { startDate: 'desc' } },
            { createdAt: 'desc' }
          ],
          select: {
            id: true,
            createdAt: true,
            academicYear: {
              select: {
                id: true,
                name: true,
                status: true,
                startDate: true,
                endDate: true,
              }
            },
            classroom: {
              select: {
                id: true,
                name: true,
                grade: true,
                section: true,
                slug: true,
                teacher: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  }
                },
                academicYear: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    periods: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                }
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
            id: true,
            weeklyBlocks: true,
            hoursPerWeek: true,
            subject: {
              select: {
                id: true,
                name: true,
                slug: true,
                code: true
              }
            },
            classroom: {
              select: {
                id: true,
                name: true,
                slug: true,
                grade: true,
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
                studentClassrooms: {
                  where: { isActive: true },
                  take: 1,
                  select: {
                    classroom: {
                      select: {
                        name: true
                      }
                    }
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

    // Si es docente, calcular los promedios y carga horaria total
    let teacherAverages: Record<string, number> = {};
    let totalWeeklyBlocks = 0;
    let totalWeeklyHours = 0;

    if (user.role === 'TEACHER') {
      const gradesAgg = await request.tenantPrisma.grade.groupBy({
        by: ['subjectId'],
        where: {
          teacherId: user.id,
          score: { not: null }
        },
        _avg: { score: true }
      });
      gradesAgg.forEach((g: any) => {
        teacherAverages[g.subjectId] = g._avg.score ? Math.round(g._avg.score * 10) / 10 : 0;
      });

      if (user.subjectTeachings) {
        user.subjectTeachings.forEach((st: any) => {
          const blocks = st.weeklyBlocks || 0;
          const hours = st.hoursPerWeek || (blocks * 45 / 60);
          totalWeeklyBlocks += blocks;
          totalWeeklyHours += hours;
        });
      }
    }

    const activeStudentClassroom = (user as any).studentClassrooms?.[0] || null;
    const activeClassroom = activeStudentClassroom?.classroom ? {
      ...activeStudentClassroom.classroom,
      academicYear: activeStudentClassroom.academicYear || activeStudentClassroom.classroom?.academicYear || null
    } : null;

    return reply.status(200).send({
      user: {
        ...user,
        classroom: activeClassroom,
        studentClassrooms: (user as any).studentClassrooms || [],
        teacherAverages,
        totalWeeklyBlocks,
        totalWeeklyHours
      }
    });
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
 * Controlador para archivar un usuario
 */
export async function archiveUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const instituteId = requireTenant(request, reply);
    if (!instituteId) return;

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
    if (!instituteId) return;

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
      message: 'Usuario restaurado correctamente',
      user: updatedUser,
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
    if (!instituteId) return;

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
          const teacherActivities = await tx.activity.findMany({
            where: { createdBy: id },
            select: { id: true, description: true },
          });
          for (const act of teacherActivities) {
            const desc = act.description || '';
            const tag = `[Profesor histórico: ${teacherFullName}]`;
            const newDesc = desc.includes(tag) ? desc : (desc ? `${desc} ${tag}` : tag);
            await tx.activity.update({
              where: { id: act.id },
              data: {
                createdBy: fallbackUserId,
                description: newDesc,
              },
            });
          }

          // 4. Calificaciones dadas por el docente:
          // Reasignar teacherId al fallback y almacenar en metadata el nombre del profesor histórico
          const teacherGrades = await tx.grade.findMany({
            where: { teacherId: id },
            select: { id: true, metadata: true },
          });
          for (const g of teacherGrades) {
            const meta = (typeof g.metadata === 'object' && g.metadata !== null) ? g.metadata : {};
            await tx.grade.update({
              where: { id: g.id },
              data: {
                teacherId: fallbackUserId,
                metadata: {
                  ...meta,
                  historicalTeacherName: teacherFullName,
                  historicalTeacherId: id,
                },
              },
            });
          }

          // 5. Asistencias tomadas por el docente:
          const attendances = await tx.dailyAttendance.findMany({
            where: { teacherId: id },
            select: { id: true, comments: true },
          });
          for (const att of attendances) {
            const comm = att.comments || '';
            const tag = `[Tomada por: ${teacherFullName}]`;
            const newComments = comm.includes(tag) ? comm : (comm ? `${comm} ${tag}` : tag);
            await tx.dailyAttendance.update({
              where: { id: att.id },
              data: {
                teacherId: fallbackUserId,
                comments: newComments,
              },
            });
          }

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
    // El instituto ya lo resolvió el middleware (por token, slug o subdominio).
    // Antes se leía SOLO de la cabecera x-institute-id, que la aplicación no
    // envía: el botón respondía 400 "No se pudo determinar el instituto".
    const instituteId =
      (request as any).institute?.id ??
      (request.user as any)?.instituteId ??
      (request.headers['x-institute-id'] as string | undefined);

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
    // El instituto ya lo resolvió el middleware (por token, slug o subdominio).
    // Antes se leía SOLO de la cabecera x-institute-id, que la aplicación no
    // envía: el botón respondía 400 "No se pudo determinar el instituto".
    const instituteId =
      (request as any).institute?.id ??
      (request.user as any)?.instituteId ??
      (request.headers['x-institute-id'] as string | undefined);

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
      const targetClassroom = await tx.classroom.findUnique({
        where: { id: classroomId },
        select: {
          id: true,
          name: true,
          grade: true,
          section: true,
          academicYearId: true
        }
      });

      if (!targetClassroom || !targetClassroom.academicYearId) {
        throw new Error('Aula no encontrada o sin año académico activo');
      }

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

      const user = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          studentCode: true,
        },
      });

      return {
        ...user,
        classroom: targetClassroom
      };
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
