import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { generateSlug } from '../utils/slug';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { canSeeClassroom } from '../services/authorization.service';
import { materiasDeSuAno } from '../services/secciones-de-la-materia.service';

/**
 * MIRAR UNA SECCIÓN ES DE QUIEN TIENE QUE VER CON ELLA
 *
 * La ficha de una sección y sus números los pedía cualquiera con sesión: el
 * alumno de 1.º B la de 1.º A, y alumnos y representantes, el PROMEDIO de la
 * sección, que es lo que el liceo había dicho que no ven
 * (`quien-puede-que.test.ts`). La ficha, quien la mira (`canSeeClassroom`);
 * los números, el administrador y el guía de esa sección.
 */
async function puedeMirarLaSeccion(request: FastifyRequest, classroomId: string): Promise<boolean> {
  return canSeeClassroom(request.tenantPrisma, request.user as any, classroomId);
}

const classroomSchema = z.object({
  academicYearId: z.string().min(1, 'El Año Escolar es requerido'),
  grade: z.coerce.number().min(1).max(6),
  section: z.string().min(1).regex(/^[A-Z]$/, 'La sección debe ser una letra mayúscula única (A-Z)'),
  teacherId: z.string().optional(),
  capacity: z.coerce.number().min(1).default(35),
  shift: z.enum(['MANANA', 'TARDE', 'INTEGRAL']).default('MANANA'),
});

const updateClassroomSchema = classroomSchema.partial();

export const createClassroom = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const data = classroomSchema.parse(request.body);

    // 1. Validar que no exista ya esa Sección para ese Grado y Turno en ese Año
    const existingClassroom = await request.tenantPrisma.classroom.findFirst({
      where: {
        academicYearId: data.academicYearId,
        grade: data.grade,
        section: data.section,
        shift: data.shift || 'MANANA',
      },
    });

    if (existingClassroom) {
      const shiftLabel = data.shift === 'TARDE' ? ' (Turno Tarde)' : data.shift === 'INTEGRAL' ? ' (Turno Integral)' : ' (Turno Mañana)';
      return reply.status(409).send({
        error: `Ya existe la sección ${data.section} para el ${data.grade}º año${shiftLabel} en este periodo escolar`,
        code: 'SECTION_EXISTS',
      });
    }

    // 2. Generar nombre automático
    // Mapeo: 1 -> "1er Año", ..., 6 -> "6to Año"
    const gradeNames: Record<number, string> = {
      1: '1er Año',
      2: '2do Año',
      3: '3er Año',
      4: '4to Año',
      5: '5to Año',
      6: '6to Año',
    };
    const gradeName = gradeNames[data.grade] || `${data.grade}º Año`;
    const shiftSuffix = data.shift === 'TARDE' ? ' (Tarde)' : data.shift === 'INTEGRAL' ? ' (Integral)' : '';
    const fullName = `${gradeName} ${data.section}${shiftSuffix}`;

    // Obtener nombre del año académico para slug único
    const academicYear = await request.tenantPrisma.academicYear.findUnique({
      where: { id: data.academicYearId },
      select: { name: true },
    });
    const yearSuffix = academicYear?.name || data.academicYearId;
    const uniqueSlug = generateSlug(`${fullName} ${yearSuffix}`);

    // 3. Crear aula
    const newClassroom = await request.tenantPrisma.classroom.create({
      data: {
        name: fullName,
        slug: uniqueSlug,
        section: data.section,
        grade: data.grade,
        shift: data.shift || 'MANANA',
        capacity: data.capacity,
        academicYearId: data.academicYearId,
        teacherId: data.teacherId || null
      },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        academicYear: {
          select: { name: true }
        }
      },
    });

    // 4. Si se asignó un profesor, crear también la relación en TeacherClassroom para historial/permisos explícitos
    if (data.teacherId) {
      // Verificar si ya existe la relación para no duplicar (aunque Prisma create maneja esto, es bueno ser explícito)
      // Por simplicidad del MVP, solo creamos el classroom. La tabla TeacherClassroom es Many-to-Many puede llenarse después 
      // o si queremos sincronizar:
      await request.tenantPrisma.teacherClassroom.create({
        data: {
          teacherId: data.teacherId,
          classroomId: newClassroom.id,
          isMainTeacher: true
        }
      }).catch(() => {
        // Ignorar error si ya existe (aunque id es nuevo)
      });
    }

    // 5. Las materias de su año (las de sus hermanas), sin profesor: la sección
    // ya no añade materias; eso se hace en Materias (SECC-MAT-04).
    const liceo = String((request.user as any)?.instituteId ?? (request as any).institute?.id ?? '');
    await materiasDeSuAno(request.tenantPrisma, liceo, newClassroom.id);

    return reply.status(201).send(newClassroom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Datos inválidos', details: error.errors });
    }
    // Manejar constraint de slug duplicado
    if ((error as any)?.code === 'P2002') {
      return reply.status(409).send({
        error: 'Ya existe un aula con esa configuración',
        code: 'CLASSROOM_EXISTS',
      });
    }
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al crear aula' });
  }
};

export const getClassrooms = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { academicYearId, grade, section, shift } = request.query as {
      academicYearId?: string;
      grade?: number;
      section?: string;
      shift?: string;
    };

    const where: any = {};
    if (academicYearId) where.academicYearId = academicYearId;
    if (grade) where.grade = Number(grade);
    if (section) where.section = section;
    if (shift) where.shift = shift;

    /**
     * EL PROFESOR VE SUS SECCIONES, NO EL LICEO ENTERO
     *
     * Esta lista salía completa para cualquiera con sesión, y de ahí venía un
     * fallo con cara de error del sistema: el calendario abre la PRIMERA
     * sección de la lista, y al profesor le tocaba una que no es suya, así que
     * el servidor —con razón— respondía 403 y la pantalla salía rota nada más
     * entrar.
     *
     * Suyas son las que guía y aquellas en las que imparte alguna materia, que
     * es lo mismo que mira `canSeeClassroom`. Al administrador no le cambia
     * nada.
     */
    if (request.user?.role === 'TEACHER') {
      const profesorId = request.user.userId;
      where.OR = [
        { teacherId: profesorId },
        { subjects: { some: { teacherId: profesorId } } },
      ];
    } else if (request.user?.role === 'STUDENT') {
      const studentId = request.user.userId;
      where.studentClassrooms = {
        some: {
          studentId,
          ...(academicYearId ? {} : { isActive: true }),
        },
      };
    } else if (request.user?.role === 'TUTOR') {
      const tutorId = request.user.userId;
      where.studentClassrooms = {
        some: {
          ...(academicYearId ? {} : { isActive: true }),
          student: {
            studentTutorings: {
              some: { tutorId },
            },
          },
        },
      };
    }

    const classrooms = await request.tenantPrisma.classroom.findMany({
      where,
      orderBy: [
        { grade: 'asc' },
        { section: 'asc' }
      ],
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        academicYear: {
          select: { id: true, name: true, status: true }
        },
        _count: {
          select: {
            studentClassrooms: {
              where: { isActive: true }
            }
          },
        },
      },
    });

    const formatted = classrooms.map(c => ({
      ...c,
      _count: {
        students: (c._count as any)?.studentClassrooms ?? 0,
      }
    }));

    return reply.send(formatted);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener aulas' });
  }
};

export const getClassroom = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const classroom = await request.tenantPrisma.classroom.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
            status: true,
            periods: {
              select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
              orderBy: { startDate: 'asc' },
            },
          },
        },
        _count: {
          select: {
            studentClassrooms: { where: { isActive: true } }
          },
        },
      },
    });

    if (!classroom) return reply.status(404).send({ error: 'Aula no encontrada' });
    if (!(await puedeMirarLaSeccion(request, classroom.id))) {
      return reply.status(403).send({ error: 'Esa sección no es tuya', code: 'FORBIDDEN' });
    }

    return reply.send({
      ...classroom,
      _count: {
        students: (classroom._count as any)?.studentClassrooms ?? 0
      },
      academicYearId: classroom.academicYearId
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener el aula' });
  }
}

export const getClassroomBySlug = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { slug } = request.params as { slug: string };
    const { academicYear } = request.query as { academicYear?: string };
    const include = {
      teacher: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      academicYear: {
        select: {
          id: true,
          name: true,
          status: true,
          periods: {
            select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
            orderBy: { startDate: 'asc' as const },
          },
        },
      },
      _count: {
        select: {
          studentClassrooms: { where: { isActive: true } }
        },
      },
    };

    // Si se especifica el año académico (nombre o id), resolverlo para filtrar
    let academicYearId: string | undefined;
    if (academicYear) {
      const year = await request.tenantPrisma.academicYear.findFirst({
        where: { OR: [{ id: academicYear }, { name: academicYear }] },
        select: { id: true },
      });
      academicYearId = year?.id;
    }

    // Try exact match first
    let classroom = await request.tenantPrisma.classroom.findUnique({ where: { slug }, include });

    // Fallback: prefix search (slug without year suffix, e.g. "1er-ano-a" → "1er-ano-a-2025-2026")
    if (!classroom) {
      classroom = await request.tenantPrisma.classroom.findFirst({
        where: {
          slug: { startsWith: `${slug}-` },
          ...(academicYearId ? { academicYearId } : {}),
        },
        include
      });
    }

    if (!classroom) {
      return reply.status(404).send({ error: 'Aula no encontrada' });
    }
    if (!(await puedeMirarLaSeccion(request, classroom.id))) {
      return reply.status(403).send({ error: 'Esa sección no es tuya', code: 'FORBIDDEN' });
    }

    return reply.send({
      ...classroom,
      _count: {
        students: (classroom._count as any)?.studentClassrooms ?? 0
      },
      academicYearId: classroom.academicYearId
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al obtener el aula' });
  }
}

export const updateClassroom = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const data = updateClassroomSchema.parse(request.body);

    // Si cambia grado/sección/turno, verificar colisión y recalcular nombre
    let updatedName: string | undefined = undefined;
    if (data.grade || data.section || data.shift) {
      const current = await request.tenantPrisma.classroom.findUnique({ where: { id } });
      if (!current) return reply.status(404).send({ error: 'Aula no encontrada' });

      const targetGrade = data.grade ?? current.grade;
      const targetSection = data.section ?? current.section;
      const targetShift = data.shift ?? current.shift;
      const targetYear = data.academicYearId ?? current.academicYearId;

      const collision = await request.tenantPrisma.classroom.findFirst({
        where: {
          academicYearId: targetYear,
          grade: targetGrade,
          section: targetSection,
          shift: targetShift,
          NOT: { id }
        }
      });

      if (collision) {
        const shiftLabel = targetShift === 'TARDE' ? ' (Turno Tarde)' : targetShift === 'INTEGRAL' ? ' (Turno Integral)' : ' (Turno Mañana)';
        return reply.status(409).send({
          error: `Ya existe la sección ${targetSection} para el ${targetGrade}º año${shiftLabel} en este periodo escolar`,
          code: 'SECTION_EXISTS',
        });
      }

      const gradeNames: Record<number, string> = {
        1: '1er Año',
        2: '2do Año',
        3: '3er Año',
        4: '4to Año',
        5: '5to Año',
        6: '6to Año',
      };
      const gradeName = gradeNames[targetGrade] || `${targetGrade}º Año`;
      const shiftSuffix = targetShift === 'TARDE' ? ' (Tarde)' : targetShift === 'INTEGRAL' ? ' (Integral)' : '';
      updatedName = `${gradeName} ${targetSection}${shiftSuffix}`;
    }

    const updated = await request.tenantPrisma.classroom.update({
      where: { id },
      data: {
        ...data,
        ...(updatedName ? { name: updatedName } : {})
      }
    });

    // Sync TeacherClassroom if teacherId changed
    if (data.teacherId) {
      // Remove old main teacher relation or unset isMainTeacher
      await request.tenantPrisma.teacherClassroom.updateMany({
        where: { classroomId: id, isMainTeacher: true },
        data: { isMainTeacher: false }
      });

      // Add new
      await request.tenantPrisma.teacherClassroom.upsert({
        where: {
          teacherId_classroomId: {
            teacherId: data.teacherId,
            classroomId: id
          }
        },
        update: { isMainTeacher: true },
        create: {
          teacherId: data.teacherId,
          classroomId: id,
          isMainTeacher: true
        }
      });
    }

    return reply.send(updated);

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al actualizar aula' });
  }
}

export const deleteClassroom = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };

    const classroom = await request.tenantPrisma.classroom.findUnique({
      where: { id },
      include: { _count: { select: { studentClassrooms: { where: { isActive: true } } } } }
    });

    if (!classroom) return reply.status(404).send({ error: 'Aula no encontrada' });

    if ((classroom as any)._count.studentClassrooms > 0) {
      return reply.status(400).send({
        error: 'No se puede eliminar un aula con estudiantes inscritos',
        code: 'HAS_STUDENTS'
      });
    }

    await borrarGuardandoCopia(request.tenantPrisma, 'classroom', { id }, quienBorra(request as any));
    return reply.status(204).send();

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al eliminar aula' });
  }
}

/**
 * Asignar profesor guía a una sección
 * PATCH /api/classrooms/:id/teacher
 */
export const assignTeacher = async (
  request: FastifyRequest<{
    Params: { id: string };
    Body: { teacherId: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const prisma = request.tenantPrisma;
    const { id } = request.params;
    const { teacherId } = request.body;

    // Validar que teacherId esté presente
    if (!teacherId) {
      return reply.status(400).send({
        error: 'El ID del profesor es requerido',
        code: 'TEACHER_ID_REQUIRED'
      });
    }

    // Verificar que la sección existe
    const classroom = await prisma.classroom.findUnique({
      where: { id }
    });

    if (!classroom) {
      return reply.status(404).send({
        error: 'Sección no encontrada',
        code: 'CLASSROOM_NOT_FOUND'
      });
    }

    // Verificar que el profesor existe y está activo
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId, role: 'TEACHER' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true
      }
    });

    if (!teacher || !teacher.isActive) {
      return reply.status(404).send({
        error: 'Profesor no encontrado o inactivo',
        code: 'TEACHER_NOT_FOUND'
      });
    }

    // Actualizar sección con transacción
    const updatedClassroom = await prisma.$transaction(async (tx) => {
      // Actualizar teacherId en Classroom
      const updated = await tx.classroom.update({
        where: { id },
        data: { teacherId },
        include: {
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          },
          academicYear: {
            select: { id: true, name: true, status: true }
          },
          _count: {
            select: { studentClassrooms: { where: { isActive: true } } }
          }
        }
      });

      // Desactivar relaciones anteriores de profesor principal
      await tx.teacherClassroom.updateMany({
        where: { classroomId: id, isMainTeacher: true },
        data: { isMainTeacher: false }
      });

      // Crear o actualizar relación en TeacherClassroom
      await tx.teacherClassroom.upsert({
        where: {
          teacherId_classroomId: {
            teacherId,
            classroomId: id
          }
        },
        update: { isMainTeacher: true },
        create: {
          teacherId,
          classroomId: id,
          isMainTeacher: true
        }
      });

      return updated;
    });

    request.log.info({ classroomId: id, teacherId, classroomName: updatedClassroom.name }, 'Profesor asignado a sección');

    return reply.status(200).send(updatedClassroom);

  } catch (error) {
    request.log.error({ error }, 'Error al asignar profesor');
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

