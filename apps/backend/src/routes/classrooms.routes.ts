import { FastifyPluginAsync } from 'fastify';
import {
  getClassrooms,
  getClassroom,
  getClassroomBySlug,
  getClassroomStats,
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
    protectedRoutes.get('/:id/stats', getClassroomStats);
    protectedRoutes.get('/:id', getClassroom);
    protectedRoutes.get('/slug/:slug', getClassroomBySlug);

    /**
     * INSCRIBIR Y DESINSCRIBIR: PROFESOR O ADMIN
     *
     * Aquí ponía «(Teacher/Admin)» en un comentario y **el código no lo
     * cumplía**: las dos rutas solo pedían `authenticate`. Con eso, un alumno
     * con su sesión normal podía meter a cualquier compañero en cualquier
     * sección, y sacarlo de la suya poniendo su PROPIA contraseña —que
     * obviamente tiene—, porque el controlador comprueba la contraseña de quien
     * llama pero nunca su rol.
     *
     * Lo cazó `puertas-sin-cerradura` (PUERTA-01 y PUERTA-02), y hasta entonces
     * ninguna de las 696 pruebas pasaba por aquí.
     */
    // POST /api/classrooms/:classroomId/students
    //
    // `authenticate` va TAMBIÉN aquí, y no solo en el gancho de arriba, porque
    // los guardias se adelantan a `onRequest` (ver `middleware/guardias.ts`):
    // sin él, `requireTeacher` corría antes de que nadie hubiera preguntado
    // quién llama y respondía 401 hasta al administrador.
    //
    // INSCRIBIR Y SACAR ALUMNOS ES DEL ADMINISTRADOR (control de estudios).
    // Pedía solo «ser profesor»: cualquier profesor metía a un alumno en una
    // sección ajena o lo sacaba de la suya (bastaba su propia contraseña), y
    // con eso cambiaba quién ve sus notas y a quién se las pone
    // (`quien-puede-que.test.ts`).
    protectedRoutes.post(
      '/:classroomId/students',
      { preHandler: [authenticate, requireAdmin] },
      enrollStudent as any
    );

    // DELETE /api/classrooms/:classroomId/students/:studentId
    protectedRoutes.delete(
      '/:classroomId/students/:studentId',
      { preHandler: [authenticate, requireAdmin] },
      unenrollStudent as any
    );

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
