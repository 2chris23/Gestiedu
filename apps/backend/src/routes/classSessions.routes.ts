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

        // Resumen en vivo (tema generador por materia) para el horario en vivo
        authenticatedRoutes.get(
            '/live-overview',
            { onRequest: [requireTeacher] },
            getLiveOverview as any
        );

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

        // Suspender una clase (rota actividades a la próxima clase)
        authenticatedRoutes.post(
            '/suspend',
            { onRequest: [requireTeacher] },
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
