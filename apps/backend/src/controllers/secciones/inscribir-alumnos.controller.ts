import { FastifyReply, FastifyRequest } from 'fastify';
import { borrarGuardandoCopia, quienBorra } from '../../utils/papelera';

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
        _count: { select: { studentClassrooms: { where: { isActive: true } } } }
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

    // El cupo cuenta a los inscritos ACTIVOS de la sección de destino. Vale
    // igual para inscribir, para reactivar y para cambiar de sección: antes el
    // cambio se saltaba esta comprobación (SEC-02).
    const currentStudentsCount = (classroom as any)._count?.studentClassrooms ?? 0;
    const seccionLlena = () =>
      reply.status(400).send({
        error: 'La sección ha alcanzado su capacidad máxima',
        code: 'CLASSROOM_FULL',
        details: {
          capacity: classroom.capacity,
          current: currentStudentsCount
        }
      });
    const hayCupo = !classroom.capacity || currentStudentsCount < classroom.capacity;

    // Si ya existe una inscripción
    if (existingEnrollment) {
      // Caso 1: Ya está en la MISMA sección pero inactivo → Reactivar
      if (existingEnrollment.classroomId === classroomId) {
        if (!existingEnrollment.isActive) {
          if (!hayCupo) return seccionLlena();
          await prisma.$transaction(async (tx) => {
            await tx.studentClassroom.update({
              where: { id: existingEnrollment.id },
              data: { isActive: true }
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

      // Caso 2: Tiene inscripción en OTRA sección del mismo año (activa o no)
      // → se cambia de sección.
      //
      // Hay UNA inscripción por alumno y ciclo (`@@unique([studentId,
      // academicYearId])`). Esto desactivaba la anterior y CREABA otra: la base
      // lo rechazaba y el liceo veía un 500 al cambiar a un alumno de sección
      // (SEC-01), y otro al volver a inscribir a uno que quedó inactivo en otra
      // (SEC-03). Se cambia la misma fila de sitio; sus notas no dependen de
      // ella (ver `gradesService.buildCriteriaForStudent`).
      if (!hayCupo) return seccionLlena();
      await prisma.studentClassroom.update({
        where: { id: existingEnrollment.id },
        data: { classroomId, isActive: true }
      });

      request.log.info({ studentId, fromClassroom: existingEnrollment.classroomId, toClassroom: classroomId }, 'Estudiante movido de sección');

      return reply.status(200).send({
        success: true,
        message: existingEnrollment.isActive
          ? `Estudiante movido de ${existingEnrollment.classroom.name} a ${classroom.name}`
          : `Estudiante inscrito en ${classroom.name}`,
        movedFrom: existingEnrollment.isActive ? existingEnrollment.classroom.name : null
      });
    }

    // 4. Verificar capacidad de la sección
    if (!hayCupo) return seccionLlena();

    // 5. Crear inscripción con transacción para garantizar integridad
    const enrollment = await prisma.$transaction(async (tx) => {
      // Crear registro en StudentClassroom
      const newEnrollment = await tx.studentClassroom.create({
        data: {
          studentId,
          classroomId,
          academicYearId: classroom.academicYearId as string,
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
    // Dos inscripciones del mismo alumno a la vez (doble clic, dos pestañas):
    // la base deja entrar solo una por ciclo. La segunda no es un fallo del
    // servidor sino «ya está inscrito».
    if ((error as any)?.code === 'P2002') {
      return reply.status(409).send({
        error: 'El estudiante ya tiene una inscripción en este ciclo',
        code: 'ALREADY_ENROLLED'
      });
    }
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
    // Un DELETE puede llegar sin cuerpo: antes reventaba con 500 al
    // desestructurar, en vez de pedir la contraseña de confirmación.
    const { password } = (request.body ?? {}) as { password?: string };
    const currentUserId = request.user?.id ?? (request.user as any)?.userId;

    // Validar que se proporcionó la contraseña
    if (!password) {
      return reply.status(400).send({
        error: 'Se requiere la contraseña para confirmar esta acción',
        code: 'PASSWORD_REQUIRED'
      });
    }

    if (!currentUserId) {
      return reply.status(401).send({
        error: 'No autenticado',
        code: 'UNAUTHORIZED'
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
      // Eliminar registro de StudentClassroom (con copia en la papelera)
      await borrarGuardandoCopia(tx, 'studentClassroom', { id: enrollment.id }, quienBorra(request as any));
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
