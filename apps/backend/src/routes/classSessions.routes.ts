import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import {
    getClassSessionById,
    updateClassSession,
    createClassSession,
    getLiveClassDetail,
    saveLiveClassSession,
    getClassActivities,
    createClassActivity,
    updateClassActivity,
    deleteClassActivity,
    saveClassActivityGrades,
    suspendClassSession,
    getLiveOverview,
    searchStudentsForSession,
    savePlanWeekRow,
} from '../controllers/classSessions.controller';

export async function classSessionsRoutes(fastify: FastifyInstance) {
    // Rutas protegidas - requieren autenticación
    fastify.register(async (authenticatedRoutes) => {
        authenticatedRoutes.addHook('onRequest', authenticate);

        // Detalle en vivo de una clase (horario en vivo)
        authenticatedRoutes.get(
            '/live-detail',
            { onRequest: [requireTeacher] },
            getLiveClassDetail as any
        );

        /**
         * Resumen en vivo (tema de la semana y actividades) de una seccion.
         *
         * Sin `requireTeacher` A PROPOSITO: el alumno tiene que ver el contenido
         * de SU horario y el representante el de su representado. Quien puede
         * mirar esa seccion lo decide `assertCanSeeClassroom` dentro del
         * controlador, que es donde se sabe de que seccion se habla.
         */
        authenticatedRoutes.get('/live-overview', getLiveOverview as any);

        // Guardar sesión + asistencia de una clase en vivo
        authenticatedRoutes.post(
            '/live-save',
            { onRequest: [requireTeacher] },
            saveLiveClassSession as any
        );

        // Actividades/tareas de una materia en una sección
        authenticatedRoutes.get(
            '/activities',
            { onRequest: [requireTeacher] },
            getClassActivities as any
        );
        authenticatedRoutes.post(
            '/activities',
            { onRequest: [requireTeacher] },
            createClassActivity as any
        );
        authenticatedRoutes.put(
            '/activities/:activityId',
            { onRequest: [requireTeacher] },
            updateClassActivity as any
        );
        authenticatedRoutes.post(
            '/activities/:activityId/grades',
            { onRequest: [requireTeacher] },
            saveClassActivityGrades as any
        );
        authenticatedRoutes.delete(
            '/activities/:activityId',
            { onRequest: [requireTeacher] },
            deleteClassActivity as any
        );

        // Suspender una clase (rota actividades a la próxima clase). SOLO el
        // admin: suspender deja a una sección sin su hora y mueve el plan de
        // evaluación de la materia. Antes bastaba ser profesor — de cualquier
        // sección, sin mirar si la clase era suya.
        authenticatedRoutes.post(
            '/suspend',
            { onRequest: [requireAdmin] },
            suspendClassSession as any
        );

        // Buscar estudiantes de todo el instituto para involucrarlos en la clase
        authenticatedRoutes.get(
            '/search-students',
            { onRequest: [requireTeacher] },
            searchStudentsForSession as any
        );

        // Guardar la fila del plan de evaluación de la semana desde la clase en vivo
        authenticatedRoutes.post(
            '/plan-week-save',
            { onRequest: [requireTeacher] },
            savePlanWeekRow as any
        );

        // Obtener detalle de sesión (profesores y administradores)
        authenticatedRoutes.get(
            '/:sessionId',
            { onRequest: [requireTeacher] },
            getClassSessionById as any
        );

        // Crear nueva sesión (profesores)
        authenticatedRoutes.post(
            '/',
            { onRequest: [requireTeacher] },
            createClassSession as any
        );

        // Actualizar sesión (profesores)
        authenticatedRoutes.put(
            '/:sessionId',
            { onRequest: [requireTeacher] },
            updateClassSession as any
        );
    });
}
