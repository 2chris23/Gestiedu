/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { SubjectsService } from '../services/subjects.service';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../utils/constants';
import { createError } from '../middleware/error.middleware';
import { hasPermission } from '../utils/permissions';
import { auditLog } from '../utils/audit';

const subjectsService = new SubjectsService();

export async function getAllSubjects(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = request.query as any;
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:read')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const subjects = await subjectsService.getAllSubjects(query, prisma);

    await auditLog({
      userId,
      action: 'read',
      resource: 'subjects',
      details: 'Listado de asignaturas consultado'
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: subjects
    });
  } catch (error) {
    throw error;
  }
}

export async function getSubjectById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const { academicYearId: rawAcademicYearId, academicYearName } = request.query as { academicYearId?: string; academicYearName?: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:read')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    // Resolve academicYearName to ID if provided (for human-readable URLs)
    let academicYearId = rawAcademicYearId;
    if (!academicYearId && academicYearName) {
      const year = await prisma.academicYear.findFirst({
        where: { name: academicYearName },
        select: { id: true }
      });
      if (year) academicYearId = year.id;
    }

    const subject = await subjectsService.getSubjectById(id, prisma, academicYearId);

    if (!subject) {
      throw createError(404, ERROR_MESSAGES.RECORD_NOT_FOUND);
    }

    await auditLog({
      userId,
      action: 'read',
      resource: 'subjects',
      resourceId: id,
      details: 'Asignatura consultada'
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: subject
    });
  } catch (error) {
    throw error;
  }
}

export async function createSubject(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = request.body as any;
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:create')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const subject = await subjectsService.createSubject(data, prisma);

    await auditLog({
      userId,
      action: 'create',
      resource: 'subjects',
      resourceId: subject.id,
      details: `Asignatura creada: ${subject.name}`
    }, prisma);

    return reply.status(201).send({
      success: true,
      message: SUCCESS_MESSAGES.CREATE_SUCCESS,
      data: subject
    });
  } catch (error: any) {
    // Detectar error de duplicado de Prisma (P2002 = Unique constraint failed)
    if (error.code === 'P2002') {
      return reply.status(400).send({
        success: false,
        error: 'Ya existe una materia con este nombre',
        code: 'DUPLICATE_SUBJECT_NAME'
      });
    }
    throw error;
  }
}

export async function updateSubject(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const data = request.body as any;
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:update')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const subject = await subjectsService.updateSubject(id, {
      ...data,
      updatedBy: userId
    }, prisma);

    await auditLog({
      userId,
      action: 'update',
      resource: 'subjects',
      resourceId: id,
      details: `Asignatura actualizada: ${subject.name}`
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.UPDATE_SUCCESS,
      data: subject
    });
  } catch (error) {
    throw error;
  }
}

export async function deleteSubject(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:delete')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    await subjectsService.deleteSubject(id, prisma);

    await auditLog({
      userId,
      action: 'delete',
      resource: 'subjects',
      resourceId: id,
      details: 'Asignatura eliminada'
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.DELETE_SUCCESS
    });
  } catch (error) {
    throw error;
  }
}

export async function getSubjectsByGrade(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { grade } = request.params as { grade: string };
    const { academicYearId } = request.query as { academicYearId?: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:read')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const subjects = await subjectsService.getSubjectsByGrade(parseInt(grade), prisma, academicYearId);

    await auditLog({
      userId,
      action: 'read',
      resource: 'subjects',
      details: `Asignaturas por grado consultadas: ${grade}`
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: subjects
    });
  } catch (error) {
    throw error;
  }
}

export async function getSubjectTeachers(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:read')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const teachers = await subjectsService.getSubjectTeachers(id, prisma);

    await auditLog({
      userId,
      action: 'read',
      resource: 'subjects',
      resourceId: id,
      details: 'Profesores de asignatura consultados'
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: teachers
    });
  } catch (error) {
    throw error;
  }
}

export async function assignSubjectToGrade(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { grade } = request.params as { grade: string };
    const { subjectId, teacherId, academicYearId } = request.body as { subjectId: string; teacherId: string; academicYearId?: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:update')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const assignment = await subjectsService.assignSubjectToGrade(parseInt(grade), subjectId, teacherId, prisma, academicYearId);

    await auditLog({
      userId,
      action: 'update',
      resource: 'subjects',
      details: `Materia ${subjectId} asignada al grado ${grade} con profesor ${teacherId}`
    }, prisma);

    return reply.status(201).send({
      success: true,
      message: 'Materia asignada al grado exitosamente',
      data: assignment
    });
  } catch (error) {
    throw error;
  }
}

export async function removeSubjectFromGrade(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { grade, subjectId } = request.params as { grade: string; subjectId: string };
    const { academicYearId } = request.query as { academicYearId?: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:update')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    await subjectsService.removeSubjectFromGrade(parseInt(grade), subjectId, prisma, academicYearId);

    await auditLog({
      userId,
      action: 'update',
      resource: 'subjects',
      details: `Materia ${subjectId} removida del grado ${grade}`
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: 'Materia removida del grado exitosamente'
    });
  } catch (error) {
    throw error;
  }
}

export async function getSubjectStudents(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:read')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const students = await subjectsService.getSubjectStudents(id, prisma);

    await auditLog({
      userId,
      action: 'read',
      resource: 'subjects',
      resourceId: id,
      details: 'Estudiantes de asignatura consultados'
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: students
    });
  } catch (error) {
    throw error;
  }
}

export async function getSubjectStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = (request as any).tenantPrisma;
    const userId = request.user?.userId;

    if (!hasPermission(request.user as any, 'subjects:read')) {
      throw createError(403, ERROR_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const stats = await subjectsService.getSubjectStats(prisma);

    await auditLog({
      userId,
      action: 'read',
      resource: 'subjects',
      details: 'Estadísticas de asignaturas consultadas'
    }, prisma);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: stats
    });
  } catch (error) {
    throw error;
  }
}
