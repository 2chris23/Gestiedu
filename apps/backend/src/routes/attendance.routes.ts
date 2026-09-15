import { FastifyPluginAsync } from 'fastify';
import { authenticate, requireTeacher, verifyInstitute as verifyTenant } from '../middleware/auth.middleware';
import { assertClassroomScope } from '../services/authorization.service';
import {
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendance,
  getAttendances,
  getStudentAttendance,
  markClassAttendance,
} from '../controllers/attendance.controller';

const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  // Using function-based controllers exported from attendance.controller.ts

  // Esquema para crear/actualizar un registro de asistencia
  const attendanceSchema = {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']
      },
      // `comments`, igual que la columna: con `comment` el texto se perdía
      comments: { type: 'string', nullable: true },
      date: { type: 'string', format: 'date' },
      // BUG FIX: los IDs de estudiantes/aulas son cédulas/cuids, NO uuids.
      // El format 'uuid' rechazaba cualquier request real.
      studentId: { type: 'string' },
      classroomId: { type: 'string' },
    },
    required: ['status', 'date', 'studentId', 'classroomId'],
  };

  // Esquema para respuesta de asistencia
  const attendanceResponseSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string' },
      // `comments`, igual que la columna: con `comment` el texto se perdía
      comments: { type: 'string', nullable: true },
      date: { type: 'string', format: 'date-time' },
      studentId: { type: 'string' },
      classroomId: { type: 'string' },
      tenantId: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  };

  // Esquema para respuesta de múltiples registros de asistencia
  const attendancesResponseSchema = {
    type: 'array',
    items: attendanceResponseSchema,
  };

  // Crear un registro de asistencia
  fastify.post(
    '/',
    {
      schema: {
        body: attendanceSchema,
        response: {
          201: attendanceResponseSchema,
        },
      },
      preHandler: [authenticate, requireTeacher, verifyTenant],
    },
    createAttendance as any
  );

  // Actualizar un registro de asistencia
  fastify.put(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']
            },
            comment: { type: 'string', nullable: true },
          },
          required: ['status'],
        },
        response: {
          200: attendanceResponseSchema,
        },
      },
      preHandler: [authenticate, requireTeacher, verifyTenant],
    },
    updateAttendance as any
  );

  // Eliminar un registro de asistencia
  fastify.delete(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', },
          },
          required: ['id'],
        },
        response: {
          204: {
            type: 'null',
          },
        },
      },
      preHandler: [authenticate, requireTeacher, verifyTenant],
    },
    deleteAttendance as any
  );

  // Obtener un registro de asistencia por ID
  fastify.get(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', },
          },
          required: ['id'],
        },
        response: {
          200: attendanceResponseSchema,
        },
      },
      preHandler: [authenticate, verifyTenant],
    },
    getAttendance as any
  );

  // Obtener registros de asistencia por aula y fecha
  fastify.get(
    '/classroom/:classroomId/date/:date',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            classroomId: { type: 'string', },
            date: { type: 'string', format: 'date' },
          },
          required: ['classroomId', 'date'],
        },
        
      },
      preHandler: [authenticate, verifyTenant],
    },
    async (request, reply) => {
      // Delegate to getAttendances by adapting query
      const { classroomId, date } = request.params as { classroomId: string; date: string };
      (request as any).query = { classroomId, startDate: date, endDate: date, page: 1, limit: 100 };
      return getAttendances(request as any, reply);
    }
  );

  // Obtener registros de asistencia por estudiante
  fastify.get(
    '/student/:studentId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            studentId: { type: 'string', },
          },
          required: ['studentId'],
        },
        querystring: {
          type: 'object',
          properties: {
            classroomId: { type: 'string', },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
        
      },
      preHandler: [authenticate, verifyTenant],
    },
    getStudentAttendance as any
  );

  // Obtener registros de asistencia por aula
  fastify.get(
    '/classroom/:classroomId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            classroomId: { type: 'string', },
          },
          required: ['classroomId'],
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
        
      },
      preHandler: [authenticate, verifyTenant],
    },
    /**
     * LA ASISTENCIA DE UNA SECCIÓN ES DE QUIEN LA LLEVA
     *
     * Esta ruta solo preguntaba «¿quién eres?». Con eso, un alumno con su
     * sesión normal leía la asistencia completa de cualquier sección del liceo
     * —quién falta, quién llega tarde, las justificaciones— y un profesor, la de
     * secciones que no imparte.
     *
     * `assertClassroomScope` deja pasar al administrador y al profesor que
     * imparte ahí o es su guía, y a nadie más. El alumno ve la SUYA, que tiene
     * su propia ruta (`/api/attendance/student/:studentId`).
     *
     * Lo cazó `puertas-sin-cerradura` (PUERTA-04 y PUERTA-05).
     */
    async (request, reply) => {
      const { classroomId } = request.params as { classroomId: string };
      const { startDate, endDate } = (request.query || {}) as { startDate?: string; endDate?: string };

      await assertClassroomScope(
        (request as any).tenantPrisma,
        request.user as any,
        classroomId,
        { accion: 'ver la asistencia' }
      );

      (request as any).query = { classroomId, startDate, endDate, page: 1, limit: 100 };
      return getAttendances(request as any, reply);
    }
  );

  // Obtener resumen de asistencia por estudiante
  fastify.get(
    '/summary/student/:studentId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            studentId: { type: 'string', },
          },
          required: ['studentId'],
        },
        querystring: {
          type: 'object',
          properties: {
            classroomId: { type: 'string', },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
        /**
         * SIN PLANTILLA DE RESPUESTA, A PROPÓSITO
         *
         * Aquí había una que decía que la respuesta era
         * `{ studentId, totalDays, present, absent, late, justified, ... }`,
         * todo en el primer nivel. Pero el código que la atiende
         * (`getStudentAttendance`, el mismo de `/student/:studentId`) devuelve
         * `{ student, attendances, summary }`.
         *
         * Fastify solo deja pasar lo que la plantilla declara. Como no coincidía
         * ni un solo campo, la ruta respondía **200 con `{}`**: el resumen de
         * asistencia de un alumno se pedía, contestaba "todo bien" y no traía
         * nada. Un 200 vacío es peor que un error, porque nadie lo mira.
         *
         * Se quita, como en la ruta hermana de arriba, que nunca la tuvo. Lo
         * vigila CAL-06.
         */
      },
      preHandler: [authenticate, verifyTenant],
    },
    getStudentAttendance as any
  );

  // Obtener resumen de asistencia por aula
  fastify.get(
    '/summary/classroom/:classroomId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            classroomId: { type: 'string', },
          },
          required: ['classroomId'],
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              classroomId: { type: 'string', },
              totalStudents: { type: 'integer' },
              totalDays: { type: 'integer' },
              averagePresentPercentage: { type: 'number' },
              averageAbsentPercentage: { type: 'number' },
              averageLatePercentage: { type: 'number' },
              averageJustifiedPercentage: { type: 'number' },
              studentSummaries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    studentId: { type: 'string', },
                    studentName: { type: 'string' },
                    present: { type: 'integer' },
                    absent: { type: 'integer' },
                    late: { type: 'integer' },
                    justified: { type: 'integer' },
                    presentPercentage: { type: 'number' },
                    absentPercentage: { type: 'number' },
                    latePercentage: { type: 'number' },
                    justifiedPercentage: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate, verifyTenant],
    },
    async (request, reply) => {
      // Fallback: return list filtered by classroom to keep route functional
      const { classroomId } = request.params as { classroomId: string };
      const { startDate, endDate } = (request.query || {}) as { startDate?: string; endDate?: string };
      (request as any).query = { classroomId, startDate, endDate, page: 1, limit: 100 };
      return getAttendances(request as any, reply);
    }
  );

  // Registrar asistencia masiva para un aula y fecha
  fastify.post(
    '/bulk',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            classroomId: { type: 'string', },
            date: { type: 'string', format: 'date' },
            attendances: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  studentId: { type: 'string', },
                  status: {
                    type: 'string',
                    enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']
                  },
                  comment: { type: 'string', nullable: true },
                },
                required: ['studentId', 'status'],
              },
            },
          },
          required: ['classroomId', 'date', 'attendances'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              count: { type: 'integer' },
              message: { type: 'string' },
            },
          },
        },
      },
      preHandler: [authenticate, requireTeacher, verifyTenant],
    },
    markClassAttendance as any
  );
};

export default attendanceRoutes;
export { attendanceRoutes };
