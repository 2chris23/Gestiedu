import { FastifyPluginAsync } from 'fastify';
import {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  getDashboardStats,
  getAvailableStudents,
} from '../controllers/students.controller';
import { getStudentCompleteHistory } from '../controllers/student-history.controller';
import { getStudentGrades } from '../controllers/grades.controller';
import { getStudentAttendance } from '../controllers/attendance.controller';
import { getStudentDashboard } from '../controllers/dashboard.controller';
import { authenticate, requireAdmin, requireTeacher, requireStudent, requireSelfOrAdmin } from '../middleware/auth.middleware';
import { validateParams, validateCUID } from '../middleware/validation.middleware';
import { FastifyRequest, FastifyReply } from 'fastify';

// Thin wrappers to adapt "my-*" and profile routes to existing controllers using the authenticated userId
async function getMyProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any)?.userId || (request.user as any)?.id;
  (request as any).params = { id: userId };
  return getStudent(request as any, reply);
}

async function updateMyProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any)?.userId || (request.user as any)?.id;
  (request as any).params = { id: userId };
  return updateStudent(request as any, reply);
}

async function myGradesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any)?.userId || (request.user as any)?.id;
  (request as any).params = { studentId: userId };
  return getStudentGrades(request as any, reply);
}

async function myAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any)?.userId || (request.user as any)?.id;
  (request as any).params = { studentId: userId };
  return getStudentAttendance(request as any, reply);
}

const studentsRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createStudentSchema = {
    body: {
      type: 'object',
      required: ['email', 'firstName', 'lastName', 'classroomId'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        phone: { type: 'string' },
        birthDate: { type: 'string', format: 'date' },
        gender: { type: 'string', enum: ['MASCULINO', 'FEMENINO', 'OTRO'] },
        address: { type: 'string' },
        isActive: { type: 'boolean', default: true },
        classroomId: { type: 'string' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              classroomId: { type: 'string' },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const updateStudentSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      properties: {
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        phone: { type: 'string' },
        birthDate: { type: 'string', format: 'date' },
        gender: { type: 'string', enum: ['MASCULINO', 'FEMENINO', 'OTRO'] },
        address: { type: 'string' },
        classroomId: { type: 'string' },
        isActive: { type: 'boolean' }
      }
    }
  };

  const getStudentsQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        search: { type: 'string' },
        isActive: { type: 'boolean' },
        classroomId: { type: 'string' }
      }
    }
  };

  const updateProfileSchema = {
    body: {
      type: 'object',
      properties: {
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        phone: { type: 'string' },
        address: { type: 'string' }
      }
    }
  };

  // GET /api/students - List all students (Admin/Teacher only)
  // SEGURIDAD: requireTeacher permite ADMIN+TEACHER. Los estudiantes no deben
  // poder enumerar todos los estudiantes del instituto.
  fastify.get('/', {
    schema: getStudentsQuerySchema,
    preHandler: [authenticate, requireTeacher] // ADMIN + TEACHER (no STUDENT/TUTOR)
  }, getStudents as any);

  // GET /api/students/available - Get available students for enrollment
  fastify.get('/available', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          academicYearId: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireTeacher] // ADMIN + TEACHER (no STUDENT/TUTOR)
  }, getAvailableStudents as any);

  // GET /api/students/:id - Get student by ID
  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireSelfOrAdmin('id')]
  }, getStudent as any);

  // Nueva ruta para el Dashboard de Estudiante
  fastify.get('/:id/dashboard', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireSelfOrAdmin('id')] // ✅ SECURITY FIX: Re-enabled authentication
  }, getDashboardStats as any);

  // Nueva ruta para Historial Académico Completo
  fastify.get('/:id/complete-history', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireSelfOrAdmin('id')]
  }, getStudentCompleteHistory as any);

  fastify.post('/', {
    schema: createStudentSchema,
    preHandler: [authenticate, requireAdmin]
  }, createStudent as any);

  fastify.put('/:id', {
    schema: updateStudentSchema,
    preHandler: [authenticate, requireAdmin, validateCUID('id')]
  }, updateStudent as any);

  fastify.delete('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin, validateCUID('id')]
  }, deleteStudent as any);

  // Rutas de perfil personal de estudiantes
  fastify.get('/profile/me', {
    preHandler: [authenticate, requireStudent]
  }, getMyProfileHandler);

  fastify.put('/profile/me', {
    schema: updateProfileSchema,
    preHandler: [authenticate, requireStudent]
  }, updateMyProfileHandler);

  // Rutas académicas para estudiantes
  fastify.get('/my-grades', {
    preHandler: [authenticate, requireStudent]
  }, myGradesHandler);

  fastify.get('/my-attendance', {
    preHandler: [authenticate, requireStudent]
  }, myAttendanceHandler);

  // TODO: Implementar handler de "my-subjects" cuando exista un controlador/servicio expuesto

  // Dashboard de estudiantes
  fastify.get('/my-dashboard', {
    preHandler: [authenticate, requireStudent]
  }, getStudentDashboard);
};

export default studentsRoutes;
export { studentsRoutes };
