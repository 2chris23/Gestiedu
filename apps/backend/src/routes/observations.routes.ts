import { FastifyInstance } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import {
  createObservation,
  getStudentObservations,
  getClassroomObservations,
  getSubjectObservations,
  getSessionObservations,
  deleteObservation,
} from '../controllers/observations.controller';

export async function observationsRoutes(fastify: FastifyInstance) {
  fastify.register(async (authenticatedRoutes) => {
    authenticatedRoutes.addHook('onRequest', authenticate);

    // Crear observación (individual o grupal)
    authenticatedRoutes.post(
      '/',
      { onRequest: [requireTeacher] },
      createObservation as any
    );

    // Obtener historial de observaciones de un estudiante
    authenticatedRoutes.get(
      '/student/:studentId',
      getStudentObservations as any
    );

    // Obtener observaciones de un aula / sección
    authenticatedRoutes.get(
      '/classroom/:classroomId',
      getClassroomObservations as any
    );

    // Obtener observaciones de una materia en una sección
    authenticatedRoutes.get(
      '/subject/:classroomId/:subjectId',
      getSubjectObservations as any
    );

    // Obtener observaciones de una sesión de clase
    authenticatedRoutes.get(
      '/session/:sessionId',
      getSessionObservations as any
    );

    // Eliminar observación
    authenticatedRoutes.delete(
      '/:id',
      { onRequest: [requireTeacher] },
      deleteObservation as any
    );
  });
}
