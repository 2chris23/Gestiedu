/// <reference path="../../types/fastify.d.ts" />
import { VUELTAS_DE_CIFRADO, requireTenant, datosParaElMinisterio } from './comun';
import { UserRole, ActionType } from '../../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput } from '../../utils/validators';
import { logger } from '../../utils/logger';
import bcrypt from 'bcrypt';
import {
    incrementStudentCount,
    incrementTeacherCount,
} from '../../middleware/plan-limits.middleware';
import { avisarSiFalla } from '../../utils/sin-callar';
import { encargarElPaquete } from '../../services/paquete-de-precarga.service';

/** Lo mínimo que puede medir una contraseña. */
const MINIMO_DE_CONTRASENA = 8;

interface CreateUserRequest {
  Body: CreateUserInput;
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
    if (!instituteId) return reply;

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

    // LA CÉDULA ES LA LLAVE DE LA CUENTA
    //
    // `User.id` es la cédula y no tiene valor por defecto: sin ella la base
    // rechaza la fila y salía un 500. Crear pide lo mínimo (nombre, apellido,
    // correo, cédula, contraseña, rol y sexo); esto sí hace falta.
    if (!userData.id || !String(userData.id).trim()) {
      return reply.status(400).send({
        error: 'Hace falta la cédula',
        message: 'La cédula es la llave de la cuenta: escríbela (o arma la cédula escolar).',
        code: 'CEDULA_REQUERIDA',
        field: ['id'],
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
    const { toPrismaUserRole } = await import('../../utils/constants');
    const prismaRole = toPrismaUserRole(userData.role as any);

    // Crear el usuario con TODOS los campos necesarios
    const user = await request.tenantPrisma.user.create({
      data: {
        id: String(userData.id).trim(),
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
        ...datosParaElMinisterio(userData as any, userData.id),
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

    if (user.role === UserRole.STUDENT) {
      incrementStudentCount(instituteId).catch(avisarSiFalla('users.controller'));
    } else if (user.role === UserRole.TEACHER || user.role === UserRole.ADMIN) {
      if (user.role === UserRole.TEACHER) {
        incrementTeacherCount(instituteId).catch(avisarSiFalla('users.controller'));
      }
      encargarElPaquete(instituteId, user.id).catch(avisarSiFalla('encargar-paquete-nuevo-personal'));
    }

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
