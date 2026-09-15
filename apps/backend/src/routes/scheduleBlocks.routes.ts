import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import {
    getClassroomSchedule,
    createScheduleBlock,
    updateScheduleBlock,
    deleteScheduleBlock,
    bulkUpdateSchedule,
    autoGenerateSchedule,
    getScheduleSummary,
    getTeacherScheduleBlocks,
    getTeacherClassroomSubjects,
    bulkUpdateTeacherSchedule,
    autoFillTeacherSchedule,
    createPersonalBlock,
    updatePersonalBlock,
    deletePersonalBlock,
    getClassSessionsByDate,
} from '../controllers/scheduleBlocks.controller';

export async function scheduleBlocksRoutes(fastify: FastifyInstance) {
    // Rutas protegidas - requieren autenticación
    fastify.register(async (authenticatedRoutes) => {
        authenticatedRoutes.addHook('onRequest', authenticate);

        // Obtener horario completo de una sección (profesores y admins)
        authenticatedRoutes.get(
            '/schedules/classroom/:classroomId',
            { onRequest: [requireTeacher] },
            getClassroomSchedule as any
        );

        // Obtener historial de clases por fecha
        authenticatedRoutes.get(
            '/schedules/classroom/:classroomId/history',
            { onRequest: [requireTeacher] },
            getClassSessionsByDate as any
        );

        // Obtener resumen de horarios por ciclo escolar
        authenticatedRoutes.get(
            '/schedules/summary/:academicYearId',
            { onRequest: [requireTeacher] },
            getScheduleSummary as any
        );

        // Obtener horario de un profesor
        authenticatedRoutes.get(
            '/schedules/teacher/:teacherId/blocks',
            { onRequest: [requireTeacher] },
            getTeacherScheduleBlocks as any
        );

        // Materias que el admin le asignó al profesor, con sus bloques semanales
        authenticatedRoutes.get(
            '/schedules/teacher/:teacherId/subjects',
            { onRequest: [requireTeacher] },
            getTeacherClassroomSubjects as any
        );

        // Rutas solo para administradores
        authenticatedRoutes.register(async (adminRoutes) => {
            adminRoutes.addHook('onRequest', requireAdmin);

            // Crear bloque de horario
            adminRoutes.post(
                '/schedules/classroom/:classroomId/blocks',
                createScheduleBlock
            );

            // Actualizar bloque de horario
            adminRoutes.put(
                '/schedules/blocks/:id',
                updateScheduleBlock
            );

            // Eliminar bloque de horario
            adminRoutes.delete(
                '/schedules/blocks/:id',
                deleteScheduleBlock
            );

            // Actualización masiva de horario (drag & drop)
            adminRoutes.post(
                '/schedules/classroom/:classroomId/bulk',
                bulkUpdateSchedule
            );

            // Generación automática de horario
            adminRoutes.post(
                '/schedules/classroom/:classroomId/auto-generate',
                autoGenerateSchedule
            );

            // Guardar el horario editado desde la vista de UN profesor.
            // Mueve los mismos ScheduleBlock que ve la sección (fuente única).
            adminRoutes.post(
                '/schedules/teacher/:teacherId/bulk',
                bulkUpdateTeacherSchedule as any
            );

            // Colocar al azar los bloques pendientes del profesor
            adminRoutes.post(
                '/schedules/teacher/:teacherId/auto-fill',
                autoFillTeacherSchedule as any
            );

            // Horas personales del profesor (planificación, guardia…).
            // Solo el admin las crea y edita.
            adminRoutes.post(
                '/schedules/teacher/:teacherId/personal-blocks',
                createPersonalBlock as any
            );
            adminRoutes.put(
                '/schedules/personal-blocks/:id',
                updatePersonalBlock as any
            );
            adminRoutes.delete(
                '/schedules/personal-blocks/:id',
                deletePersonalBlock as any
            );
        });
    });
}
