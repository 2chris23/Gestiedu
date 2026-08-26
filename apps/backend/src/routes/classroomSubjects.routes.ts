import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import {
    getClassroomSubjects,
    getClassroomSubjectDetail,
    assignSubjectToClassroom,
    updateClassroomSubject,
    assignTeacherToSubject,
    getTeacherHistory,
    removeSubjectFromClassroom,
    getAvailableSubjects,
    getClassroomSubjectsStats,
} from '../controllers/classroomSubjects.controller';

export async function classroomSubjectsRoutes(fastify: FastifyInstance) {
    // Rutas protegidas - requieren autenticación
    fastify.register(async (authenticatedRoutes) => {
        authenticatedRoutes.addHook('onRequest', authenticate);

        // IMPORTANTE: Usar nombres que no causen conflicto con :subjectId
        // Obtener materias disponibles para asignar (no asignadas aún)
        authenticatedRoutes.get(
            '/classrooms/:classroomId/subjects-available',
            { onRequest: [requireTeacher] },
            getAvailableSubjects as any
        );

        // Obtener materias de una sección (profesores y admins)
        // Si incluye ?stats=true, devuelve estadísticas en lugar de la lista
        authenticatedRoutes.get(
            '/classrooms/:classroomId/subjects',
            { onRequest: [requireTeacher] },
            async (request: any, reply: any) => {
                const { stats } = request.query as { stats?: string };
                if (stats === 'true') {
                    return getClassroomSubjectsStats(request, reply);
                }
                return getClassroomSubjects(request, reply);
            }
        );

        // Obtener historial de profesores de una materia
        authenticatedRoutes.get(
            '/classrooms/:classroomId/subjects/:subjectId/teacher-history',
            { onRequest: [requireTeacher] },
            getTeacherHistory as any
        );

        // Obtener detalle de una materia en una sección (debe ir después de rutas específicas)
        authenticatedRoutes.get(
            '/classrooms/:classroomId/subjects/:subjectId',
            { onRequest: [requireTeacher] },
            getClassroomSubjectDetail as any
        );

        // Asignar materia a sección (profesores y admins)
        authenticatedRoutes.post(
            '/classrooms/:classroomId/subjects',
            { onRequest: [requireTeacher] },
            assignSubjectToClassroom as any
        );

        // Rutas solo para administradores
        authenticatedRoutes.register(async (adminRoutes) => {
            adminRoutes.addHook('onRequest', requireAdmin);

            // Actualizar configuración de materia (bloques semanales, etc.)
            adminRoutes.patch(
                '/classrooms/:classroomId/subjects/:subjectId',
                updateClassroomSubject
            );

            // Asignar/cambiar profesor de una materia
            adminRoutes.patch(
                '/classrooms/:classroomId/subjects/:subjectId/teacher',
                assignTeacherToSubject
            );

            // Remover materia de sección
            adminRoutes.delete(
                '/classrooms/:classroomId/subjects/:subjectId',
                removeSubjectFromClassroom
            );
        });
    });
}
