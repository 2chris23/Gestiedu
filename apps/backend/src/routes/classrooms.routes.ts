import { FastifyPluginAsync } from 'fastify';
import {
  getClassrooms,
  getClassroom,
  getClassroomBySlug,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  enrollStudent,
  unenrollStudent,
  assignTeacher
} from '../controllers/classrooms.controller';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';

const classroomsRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    // Listar y Ver detalle (Profesor/Admin necesitan ver)
    protectedRoutes.get('/', getClassrooms);
    protectedRoutes.get('/:id', getClassroom);
    protectedRoutes.get('/slug/:slug', getClassroomBySlug);

    // Inscribir/Desinscribir estudiantes (Teacher/Admin)
    // POST /api/classrooms/:classroomId/students
    protectedRoutes.post('/:classroomId/students', enrollStudent);

    // DELETE /api/classrooms/:classroomId/students/:studentId
    protectedRoutes.delete('/:classroomId/students/:studentId', unenrollStudent);

    // Admin Only
    protectedRoutes.register(async (adminRoutes) => {
      adminRoutes.addHook('preHandler', requireAdmin);

      adminRoutes.post('/', createClassroom);
      adminRoutes.put('/:id', updateClassroom);
      adminRoutes.delete('/:id', deleteClassroom);

      // Asignar profesor guía
      adminRoutes.patch('/:id/teacher', assignTeacher);
    });
  });
};

export default classroomsRoutes;
export { classroomsRoutes };
