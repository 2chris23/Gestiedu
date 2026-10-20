/// <reference path="../../types/fastify.d.ts" />
import { getInstituteId } from './comun';
import { UserRole } from '../../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { UserFiltersInput, PaginationInput } from '../../utils/validators';
import { logger } from '../../utils/logger';
import { RequestUser } from '../../types/fastify';
import { NOTAS_QUE_CUENTAN } from '../../services/apreciaciones.service';
import { cargaDeLosProfesores, estadoDeLaCarga, horasDeCargoDe, reglasDeCargaHoraria } from '../../services/personal.service';

interface GetUserRequest {
  Params: { id: string };
}

interface GetUsersRequest {
  Querystring: UserFiltersInput & PaginationInput;
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
      const { toPrismaUserRole } = await import('../../utils/constants');
      where.role = toPrismaUserRole(role as any);
    }

    // Los inscritos en esa sección. `users` no tiene columna `classroomId`:
    // filtrar así era un 500 (barrido de privacidad, 2026-10-11).
    if (classroomId) {
      where.studentClassrooms = { some: { classroomId, isActive: true } };
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

    // «Les falta algo»: alumnos sin algún dato para el Ministerio o sin algún
    // recaudo de la inscripción (`services/inscripcion.service.ts`).
    if ((request.query as any).faltan === true) {
      const { condicionDeLesFalta } = await import('../../services/inscripcion.service');
      const instituteId = String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
      where.AND = [...(where.AND ?? []), await condicionDeLesFalta(instituteId)];
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
          horasDelCargo: true,
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

    // La carga de los profesores de esta página, con la cuenta de siempre
    // (`personal.service`: el año en curso y la hora de clase de su turno),
    // en una consulta. Antes: 45 min fijos y los años pasados sumados.
    const liceo = getInstituteId(request) ?? '';
    const profes = users.filter((u: any) => u.role === 'TEACHER').map((u: any) => u.id);
    const [cargas, reglas] = profes.length
      ? await Promise.all([cargaDeLosProfesores(request.tenantPrisma, liceo, profes), reglasDeCargaHoraria(liceo)])
      : [new Map(), null];

    return reply.status(200).send({
      users: users.map((u: any) => {
        const carga = cargas.get(u.id);
        const totalWeeklyBlocks = carga?.bloques ?? 0;
        const totalWeeklyHours = carga?.total ?? 0;
        const cargaHoraria = carga && reglas
          ? { total: carga.total, cargo: horasDeCargoDe(reglas, u.horasDelCargo), horasDelCargo: u.horasDelCargo ?? null, estado: estadoDeLaCarga(carga.total, reglas, u.horasDelCargo) }
          : undefined;

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
          cargaHoraria,
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
        nacionalidad: true,
        lugarDeNacimiento: true,
        entidadDeNacimiento: true,
        tipoDeCedula: true,
        cedulaEscolar: true,
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
          score: { not: null },
          ...NOTAS_QUE_CUENTAN,
        },
        _avg: { score: true }
      });
      gradesAgg.forEach((g: any) => {
        teacherAverages[g.subjectId] = g._avg.score ? Math.round(g._avg.score * 10) / 10 : 0;
      });

      // La carga, con la cuenta de siempre (`personal.service`).
      const carga = (await cargaDeLosProfesores(request.tenantPrisma, getInstituteId(request) ?? '', [user.id])).get(user.id);
      totalWeeklyBlocks = carga?.bloques ?? 0;
      totalWeeklyHours = carga?.total ?? 0;
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
