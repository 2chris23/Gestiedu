import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Sistema de Gestión Escolar API',
        description: 'API para el Sistema de Gestión Escolar con soporte multitenancy',
        version: '1.0.0',
        contact: {
          name: 'Soporte',
          email: 'soporte@gestionescolar.com',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Servidor de desarrollo local',
        },
        {
          url: 'https://api.gestionescolar.com',
          description: 'Servidor de producción',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              message: { type: 'string', example: 'Error message' },
              error: { type: 'string', example: 'Error details' },
            },
          },
          Success: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'Operation successful' },
              data: { type: 'object', example: {} },
            },
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              role: { type: 'string', enum: ['ADMIN', 'PROFESOR', 'ESTUDIANTE'] },
              status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Course: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string' },
              code: { type: 'string' },
              credits: { type: 'integer' },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Classroom: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              capacity: { type: 'integer' },
              location: { type: 'string' },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Activity: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              description: { type: 'string' },
              type: { type: 'string', enum: ['TAREA', 'EXAMEN', 'PROYECTO', 'OTRO'] },
              dueDate: { type: 'string', format: 'date-time' },
              maxScore: { type: 'number', format: 'float' },
              courseId: { type: 'string', format: 'uuid' },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Grade: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              score: { type: 'number', format: 'float' },
              feedback: { type: 'string' },
              activityId: { type: 'string', format: 'uuid' },
              studentId: { type: 'string', format: 'uuid' },
              courseId: { type: 'string', format: 'uuid' },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Attendance: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              date: { type: 'string', format: 'date-time' },
              status: { type: 'string', enum: ['PRESENTE', 'AUSENTE', 'TARDANZA', 'JUSTIFICADO'] },
              notes: { type: 'string' },
              studentId: { type: 'string', format: 'uuid' },
              classroomId: { type: 'string', format: 'uuid' },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Notification: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              message: { type: 'string' },
              type: { type: 'string', enum: ['INFO', 'WARNING', 'ERROR', 'SUCCESS'] },
              read: { type: 'boolean' },
              userId: { type: 'string', format: 'uuid' },
              tenantId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          Tenant: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              domain: { type: 'string' },
              status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Autenticación y autorización' },
        { name: 'Users', description: 'Gestión de usuarios' },
        { name: 'Courses', description: 'Gestión de cursos' },
        { name: 'Classrooms', description: 'Gestión de aulas' },
        { name: 'Activities', description: 'Gestión de actividades académicas' },
        { name: 'Grades', description: 'Gestión de calificaciones' },
        { name: 'Attendance', description: 'Gestión de asistencia' },
        { name: 'Notifications', description: 'Gestión de notificaciones' },
        { name: 'Tenants', description: 'Gestión de inquilinos (multitenancy)' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}