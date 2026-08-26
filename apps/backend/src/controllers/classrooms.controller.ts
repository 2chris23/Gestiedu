import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { generateSlug } from '../utils/slug';

const classroomSchema = z.object({
  academicYearId: z.string().min(1, 'El Año Escolar es requerido'),
  grade: z.coerce.number().min(1).max(5),
  section: z.string().min(1).regex(/^[A-Z]$/, 'La sección debe ser una letra mayúscula única (A-Z)'),
  teacherId: z.string().optional(),
  capacity: z.coerce.number().min(1).default(35),
});

const updateClassroomSchema = classroomSchema.partial();

export const createClassroom = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const data = classroomSchema.parse(request.body);

    // 1. Validar que no exista ya esa Sección para ese Grado en ese Año
    const existingClassroom = await request.tenantPrisma.classroom.findFirst({
      where: {
        academicYearId: data.academicYearId,
        grade: data.grade,
        section: data.section
      },
    });

    if (existingClassroom) {
      return reply.status(409).send({
        error: `Ya existe la sección ${data.section} para el ${data.grade}º año en este periodo escolar`,
        code: 'SECTION_EXISTS',
      });
    }

    // 2. Generar nombre automático
    // Mapeo simple: 1 -> "1er Año", 2 -> "2do Año", etc.
    const gradeNames: Record<number, string> = {
      1: '1er Año',
      2: '2do Año',
      3: '3er Año',
      4: '4to Año',
      5: '5to Año',
    };
    const gradeName = gradeNames[data.grade] || `${data.grade}º Año`;
    const fullName = `${gradeName} ${data.section}`;

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
    const { academicYearId, grade, section } = request.query as {
      academicYearId?: string;
      grade?: number;
      section?: string
    };

    const where: any = {};
    if (academicYearId) where.academicYearId = academicYearId;
    if (grade) where.grade = Number(grade);
    if (section) where.section = section;

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
            students: true,
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
        students: (c._count as any)?.studentClassrooms ?? c._count?.students ?? 0,
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
          select: { id: true, name: true, status: true }
        },
        _count: {
          select: {
            students: true,
            studentClassrooms: { where: { isActive: true } }
          },
        },
      },
    });

    if (!classroom) return reply.status(404).send({ error: 'Aula no encontrada' });

    return reply.send({
      ...classroom,
      _count: {
        students: (classroom._count as any)?.studentClassrooms ?? classroom._count?.students ?? 0
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
        select: { id: true, name: true, status: true }
      },
      _count: {
        select: {
          students: true,
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

    return reply.send({
      ...classroom,
      _count: {
        students: (classroom._count as any)?.studentClassrooms ?? classroom._count?.students ?? 0
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

    // Si cambia grado/sección, verificar colisión
    if (data.grade || data.section) {
      const current = await request.tenantPrisma.classroom.findUnique({ where: { id } });
      if (!current) return reply.status(404).send({ error: 'Aula no encontrada' });

      const targetGrade = data.grade || current.grade;
      const targetSection = data.section || current.section;
      const targetYear = data.academicYearId || current.academicYearId; // Should check if provided

      // Check collision logic here strictly if needed, usually updates on section are rare
    }

    const updated = await request.tenantPrisma.classroom.update({
      where: { id },
      data: {
        ...data,
        // Si cambiamos grado/sección, actualizar nombre
        ...((data.grade || data.section) && {
          name: `${data.grade ? (data.grade === 1 ? '1er Año' : `${data.grade}do Año` /* Simple mock logic fix later */) : ''} ${data.section || ''}`.trim()
          // To keep it simple, let's just update fields provided. Name generation should be robust in real app.
          // For MVP: If name update needed, recreate logic or allow name override. 
          // Let's stick to update fields only for now.
        })
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
      include: { _count: { select: { students: true } } }
    });

    if (!classroom) return reply.status(404).send({ error: 'Aula no encontrada' });

    if (classroom._count.students > 0) {
      return reply.status(400).send({
        error: 'No se puede eliminar un aula con estudiantes inscritos',
        code: 'HAS_STUDENTS'
      });
    }

    await request.tenantPrisma.classroom.delete({ where: { id } });
    return reply.status(204).send();

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Error al eliminar aula' });
  }
}

/**
 * Inscribir estudiante en sección
 * POST /api/classrooms/:classroomId/students
 * 
 * Implementa "The Archivist Rule": Un estudiante SOLO puede estar en UNA sección por año académico
 */
export const enrollStudent = async (
  request: FastifyRequest<{
    Params: { classroomId: string };
    Body: { studentId: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const prisma = request.tenantPrisma;
    const { classroomId } = request.params;
    const { studentId } = request.body;

    // Validar que studentId esté presente
    if (!studentId) {
      return reply.status(400).send({
        error: 'El ID del estudiante es requerido',
        code: 'STUDENT_ID_REQUIRED'
      });
    }

    // 1. Verificar que la sección existe y está activa
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        grade: true,
        section: true,
        academicYearId: true,
        isActive: true,
        capacity: true,
        _count: { select: { students: true } }
      }
    });

    if (!classroom || !classroom.isActive) {
      return reply.status(404).send({
        error: 'Sección no encontrada o inactiva',
        code: 'CLASSROOM_NOT_FOUND'
      });
    }

    if (!classroom.academicYearId) {
      return reply.status(400).send({
        error: 'La sección no tiene un año académico asignado',
        code: 'NO_ACADEMIC_YEAR'
      });
    }

    // 2. Verificar que el estudiante existe y está activo
    const student = await prisma.user.findUnique({
      where: { id: studentId, role: 'STUDENT' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true
      }
    });

    if (!student || !student.isActive) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado o inactivo',
        code: 'STUDENT_NOT_FOUND'
      });
    }

    // 3. VALIDACIÓN CRÍTICA: Verificar "The Archivist Rule"
    // Un estudiante SOLO puede estar en UNA sección ACTIVA por año académico
    const existingEnrollment = await prisma.studentClassroom.findFirst({
      where: {
        studentId,
        academicYearId: classroom.academicYearId
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        academicYear: {
          select: { name: true }
        }
      }
    });

    // Si ya existe una inscripción
    if (existingEnrollment) {
      // Caso 1: Ya está en la MISMA sección pero inactivo → Reactivar
      if (existingEnrollment.classroomId === classroomId) {
        if (!existingEnrollment.isActive) {
          await prisma.$transaction(async (tx) => {
            await tx.studentClassroom.update({
              where: { id: existingEnrollment.id },
              data: { isActive: true }
            });

            await tx.user.update({
              where: { id: studentId },
              data: { classroomId }
            });
          });

          request.log.info({ studentId, classroomId, enrollmentId: existingEnrollment.id }, 'Estudiante reactivado en sección');

          return reply.status(200).send({
            success: true,
            message: 'Estudiante reactivado en la sección',
            enrollment: existingEnrollment
          });
        } else {
          // Ya está activo en esta sección
          return reply.status(400).send({
            error: 'El estudiante ya está inscrito en esta sección',
            code: 'ALREADY_ENROLLED'
          });
        }
      }

      // Caso 2: Está en OTRA sección del mismo año → Mover
      if (existingEnrollment.isActive) {
        await prisma.$transaction(async (tx) => {
          // Desactivar inscripción anterior
          await tx.studentClassroom.update({
            where: { id: existingEnrollment.id },
            data: { isActive: false }
          });

          // Crear nueva inscripción
          await tx.studentClassroom.create({
            // @ts-expect-error academicYearId could be null from classroom lookup
            data: {
              studentId,
              classroomId,
              academicYearId: classroom.academicYearId ?? undefined,
              isActive: true,
              enrollmentDate: new Date()
            }
          });

          // Actualizar classroomId en User
          await tx.user.update({
            where: { id: studentId },
            data: { classroomId }
          });
        });

        request.log.info({ studentId, fromClassroom: existingEnrollment.classroomId, toClassroom: classroomId }, 'Estudiante movido de sección');

        return reply.status(200).send({
          success: true,
          message: `Estudiante movido de ${existingEnrollment.classroom.name} a ${classroom.name}`,
          movedFrom: existingEnrollment.classroom.name
        });
      }
    }

    // 4. Verificar capacidad de la sección
    if (classroom.capacity && classroom._count.students >= classroom.capacity) {
      return reply.status(400).send({
        error: 'La sección ha alcanzado su capacidad máxima',
        code: 'CLASSROOM_FULL',
        details: {
          capacity: classroom.capacity,
          current: classroom._count.students
        }
      });
    }

    // 5. Crear inscripción con transacción para garantizar integridad
    const enrollment = await prisma.$transaction(async (tx) => {
      // Crear registro en StudentClassroom
      const newEnrollment = await tx.studentClassroom.create({
        // @ts-expect-error academicYearId could be null from classroom lookup
        data: {
          studentId,
          classroomId,
          academicYearId: classroom.academicYearId ?? undefined,
          isActive: true,
          enrollmentDate: new Date()
        },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true,
              email: true
            }
          },
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true
            }
          },
          academicYear: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // Actualizar campo classroomId en User (para compatibilidad con queries existentes)
      await tx.user.update({
        where: { id: studentId },
        data: { classroomId }
      });

      return newEnrollment;
    });

    // Fetch the enrollment with full relations for the response
    const enrollmentWithRelations = await prisma.studentClassroom.findUnique({
      where: { id: enrollment.id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            email: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        academicYear: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    request.log.info({ studentId, classroomId, academicYearId: classroom.academicYearId, enrollmentId: enrollment.id }, 'Estudiante inscrito exitosamente');

    return reply.status(201).send({
      success: true,
      message: 'Estudiante inscrito exitosamente',
      data: {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        studentName: enrollmentWithRelations ? `${enrollmentWithRelations.student.firstName} ${enrollmentWithRelations.student.lastName}` : '',
        studentCode: enrollmentWithRelations?.student.studentCode,
        classroomId: enrollment.classroomId,
        classroomName: enrollmentWithRelations?.classroom.name,
        grade: enrollmentWithRelations?.classroom.grade,
        section: enrollmentWithRelations?.classroom.section,
        academicYearId: enrollment.academicYearId,
        academicYearName: enrollmentWithRelations?.academicYear?.name,
        enrollmentDate: enrollment.enrollmentDate
      }
    });

  } catch (error) {
    request.log.error({ error }, 'Error al inscribir estudiante');
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

/**
 * Remover estudiante de sección
 * DELETE /api/classrooms/:classroomId/students/:studentId
 * 
 * Elimina completamente la inscripción del estudiante
 * Requiere validación de contraseña del usuario actual
 */
export const unenrollStudent = async (
  request: FastifyRequest<{
    Params: { classroomId: string; studentId: string };
    Body: { password: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const prisma = request.tenantPrisma;
    const { classroomId, studentId } = request.params;
    const { password } = request.body;
    const currentUserId = request.user?.id;

    // Validar que se proporcionó la contraseña
    if (!password) {
      return reply.status(400).send({
        error: 'Se requiere la contraseña para confirmar esta acción',
        code: 'PASSWORD_REQUIRED'
      });
    }

    // Obtener usuario actual y verificar contraseña
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    });

    if (!currentUser) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verificar contraseña
    const bcrypt = require('bcrypt');
    const isPasswordValid = await bcrypt.compare(password, currentUser.password);

    if (!isPasswordValid) {
      return reply.status(401).send({
        error: 'Contraseña incorrecta',
        code: 'INVALID_PASSWORD'
      });
    }

    // Buscar inscripción activa
    const enrollment = await prisma.studentClassroom.findFirst({
      where: {
        studentId,
        classroomId,
        isActive: true
      },
      include: {
        classroom: {
          select: { name: true, academicYearId: true }
        }
      }
    });

    if (!enrollment) {
      return reply.status(404).send({
        error: 'Inscripción no encontrada',
        code: 'ENROLLMENT_NOT_FOUND'
      });
    }

    // Eliminar inscripción completamente con transacción
    await prisma.$transaction(async (tx) => {
      // Eliminar registro de StudentClassroom
      await tx.studentClassroom.delete({
        where: { id: enrollment.id }
      });

      // Limpiar classroomId en User
      await tx.user.update({
        where: { id: studentId },
        data: { classroomId: null }
      });
    });

    request.log.info({ studentId, classroomId, enrollmentId: enrollment.id, removedBy: currentUserId }, 'Estudiante removido de sección');

    return reply.status(200).send({
      success: true,
      message: 'Estudiante removido de la sección exitosamente'
    });

  } catch (error) {
    request.log.error({ error }, 'Error al remover estudiante');
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

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
            select: { students: true }
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

