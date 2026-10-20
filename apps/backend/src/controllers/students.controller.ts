import { ActionType } from '../utils/prisma-enums';
import * as crypto from 'crypto';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput, UpdateUserInput } from '../utils/validators';
import { logger } from '../utils/logger';
 // ✅ SECURITY: Audit logging
import { studentsService } from '../services/students.service';
import { incrementStudentCount } from '../middleware/plan-limits.middleware';
import { avisarSiFalla } from '../utils/sin-callar';

interface CreateStudentRequest {
  Body: CreateUserInput;
}

interface UpdateStudentRequest {
  Params: { id: string };
  Body: UpdateUserInput;
}

interface GetStudentRequest {
  Params: { id: string };
}
/**
 * Controlador para crear un nuevo estudiante
 */
export async function createStudent(
  request: FastifyRequest<CreateStudentRequest>,
  reply: FastifyReply
) {
  const studentData = { ...request.body } as any;

  // El schema JSON declara `birthDate` como 'date' (YYYY-MM-DD) y Prisma espera
  // DateTime. El service no normaliza fechas, así que se hace aquí, que es donde
  // vive el formato de transporte.
  if (studentData.birthDate && !String(studentData.birthDate).includes('T')) {
    studentData.birthDate = new Date(studentData.birthDate).toISOString();
  }

  // `User.id` es la cédula y NO tiene default en Prisma: si el admin no la manda
  // hay que generar algo. Se conserva el comportamiento anterior del controller.
  if (!studentData.id) {
    studentData.id = crypto.randomUUID();
  }

  // La lógica de negocio (duplicados, capacidad del aula y la matrícula real en
  // StudentClassroom) vive SOLO en el service. Los errores de dominio suben al
  // handler central, que ya mapea NotFoundError → 404 y ConflictError → 409.
  const student = await studentsService.createStudent(request.tenantPrisma, studentData);

  await request.tenantPrisma.auditLog.create({
    data: {
      action: ActionType.CREATE,
      entity: 'STUDENT',
      entityType: 'STUDENT',
      entityId: student.id,
      metadata: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      userId: (request.user as any)?.id,
    },
  });

  logger.info('Nuevo estudiante creado', { studentId: student.id });

  const instituteId = (request as any).institute?.id ?? (request.user as any)?.instituteId;
  if (instituteId) {
    incrementStudentCount(instituteId).catch(avisarSiFalla('students.controller'));
  }

  return reply.status(201).send({
    success: true,
    message: 'Estudiante creado exitosamente',
    data: { ...student, password: undefined },
  });
}

/**
 * Controlador para obtener un estudiante por ID
 */
export async function getStudent(
  request: FastifyRequest<GetStudentRequest>,
  reply: FastifyReply
) {
  const { id } = request.params;

  // Este handler tenía el MISMO problema que create/update: pedía
  // `include: { classroom, institute }`, relaciones que la migración eliminó de
  // `User`. `studentsService.getStudentById` ya trae las relaciones vigentes
  // (studentClassrooms → classroom → teacher) y lanza NotFoundError → 404.
  const student = await studentsService.getStudentById(request.tenantPrisma, id);

  return reply.status(200).send({
    student: { ...student, password: undefined },
  });
}

/**
 * Controlador para actualizar un estudiante
 */
export async function updateStudent(
  request: FastifyRequest<UpdateStudentRequest>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const updateData = { ...request.body } as any;

  if (updateData.birthDate && !String(updateData.birthDate).includes('T')) {
    updateData.birthDate = new Date(updateData.birthDate).toISOString();
  }

  // Igual que en `createStudent`: el service es el dueño de la lógica. Su
  // `updateStudent` hace el upsert del StudentClassroom del año académico
  // correspondiente, que es lo que el controller hacía mal contra el modelo viejo.
  const student = await studentsService.updateStudent(request.tenantPrisma, id, updateData);

  await request.tenantPrisma.auditLog.create({
    data: {
      action: ActionType.UPDATE,
      entity: 'STUDENT',
      entityType: 'STUDENT',
      entityId: student.id,
      metadata: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      userId: (request.user as any)?.id,
    },
  });

  logger.info('Estudiante actualizado', { studentId: student.id });

  return reply.status(200).send({
    success: true,
    message: 'Estudiante actualizado exitosamente',
    data: { ...student, password: undefined },
  });
}
