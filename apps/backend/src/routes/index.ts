import { FastifyInstance } from 'fastify';

// Importar todas las rutas
import { authRoutes } from './auth.routes';
import { usersRoutes } from './users.routes';
import { activitiesRoutes } from './activities.routes';
import { gradesRoutes } from './grades.routes';
import { classroomsRoutes } from './classrooms.routes';
import { academicYearsRoutes } from './academic-years.routes';
import { subjectsRoutes } from './subjects.routes';
import { notificationsRoutes } from './notifications.routes';
import { dashboardRoutes } from './dashboard.routes';
import { institutesRoutes } from './institutes.routes';
import { reportsRoutes } from './reports.routes';
import { schedulesRoutes } from './schedules.routes';
import { studentsRoutes } from './students.routes';
import { teachersRoutes } from './teachers.routes';
import { attendanceRoutes } from './attendance.routes';
import { cycleStatisticsRoutes } from './cycle-statistics.routes';
import { classroomSubjectsRoutes } from './classroomSubjects.routes';
import { scheduleBlocksRoutes } from './scheduleBlocks.routes';
import { classSessionsRoutes } from './classSessions.routes';
import { observationsRoutes } from './observations.routes';
import evaluationPlanRoutes from './evaluation-plan.routes';
import { superAdminAuthRoutes } from './superadmin-auth.routes';
import { superAdminInstitutesRoutes } from './superadmin-institutes.routes';
import { instituteInfoRoutes } from '../controllers/institute-info.controller';
import { cacheMetricsRoutes } from '../controllers/cache-metrics.controller';
import { monitoringRoutes } from './monitoring.routes';
import { schoolEventsRoutes } from './school-events.routes';
import { schoolTimeRoutes } from './school-time.routes';

// Función para registrar todas las rutas
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Rutas de autenticación
  await fastify.register(authRoutes, { prefix: '/api/auth' });

  // Rutas de usuarios
  await fastify.register(usersRoutes, { prefix: '/api/users' });

  // Rutas académicas
  await fastify.register(academicYearsRoutes, { prefix: '/api/academic-years' });
  await fastify.register(classroomsRoutes, { prefix: '/api/classrooms' });
  await fastify.register(evaluationPlanRoutes, { prefix: '/api/evaluation-plan' });
  await fastify.register(activitiesRoutes, { prefix: '/api/activities' });
  await fastify.register(gradesRoutes, { prefix: '/api/grades' });

  await fastify.register(subjectsRoutes, { prefix: '/api/subjects' });
  await fastify.register(classroomSubjectsRoutes, { prefix: '/api' });
  await fastify.register(attendanceRoutes, { prefix: '/api/attendance' });
  // La hora oficial del liceo (el reloj del dispositivo no es de fiar)
  await fastify.register(schoolTimeRoutes, { prefix: '/api/time' });
  await fastify.register(schedulesRoutes, { prefix: '/api/schedules' });
  await fastify.register(scheduleBlocksRoutes, { prefix: '/api' });
  await fastify.register(classSessionsRoutes, { prefix: '/api/sessions' });
  await fastify.register(observationsRoutes, { prefix: '/api/observations' });

  // Rutas por roles específicos
  await fastify.register(studentsRoutes, { prefix: '/api/students' });
  await fastify.register(teachersRoutes, { prefix: '/api/teachers' });

  // Rutas de comunicación
  await fastify.register(notificationsRoutes, { prefix: '/api/notifications' });

  // Rutas de reportes y dashboard
  await fastify.register(reportsRoutes, { prefix: '/api/reports' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });

  // Rutas de estadísticas jerárquicas (School Archivist)
  await fastify.register(cycleStatisticsRoutes, { prefix: '/api/statistics' });

  // Rutas de administración
  await fastify.register(institutesRoutes, { prefix: '/api/institutes' });

  // Rutas públicas de instituto (información por slug)
  await fastify.register(instituteInfoRoutes);

  // Rutas de SuperAdmin
  await fastify.register(superAdminAuthRoutes, { prefix: '/api/superadmin/auth' });
  await fastify.register(superAdminInstitutesRoutes, { prefix: '/api/superadmin/institutes' });

  // Rutas de métricas de cache (SuperAdmin)
  await fastify.register(cacheMetricsRoutes);

  // Rutas de monitoreo: métricas de queries y alertas (SuperAdmin)
  await fastify.register(monitoringRoutes, { prefix: '/api/superadmin/monitoring' });

  // Eventos del liceo (calendario del director): /api/events
  await fastify.register(schoolEventsRoutes, { prefix: '/api' });

  // Rutas de estado del sistema
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };
  });

  // Ruta para verificar que la API está funcionando
  fastify.get('/api', async () => {
    return {
      message: 'API del Sistema de Gestión Escolar',
      version: '1.0.0',
      documentation: '/documentation',
      endpoints: {
        auth: '/api/auth',
        users: '/api/users',
        activities: '/api/activities',
        grades: '/api/grades',
        classrooms: '/api/classrooms',
        subjects: '/api/subjects',
        attendance: '/api/attendance',
        schedules: '/api/schedules',
        students: '/api/students',
        teachers: '/api/teachers',
        notifications: '/api/notifications',
        reports: '/api/reports',
        dashboard: '/api/dashboard',
        institutes: '/api/institutes',
        statistics: '/api/statistics'
      }
    };
  });
}

// Exportar rutas individuales para uso directo si es necesario
export {
  authRoutes,
  usersRoutes,
  activitiesRoutes,
  gradesRoutes,
  classroomsRoutes,
  subjectsRoutes,
  notificationsRoutes,
  dashboardRoutes,
  institutesRoutes,
  attendanceRoutes,
  reportsRoutes,
  schedulesRoutes,
  studentsRoutes,
  teachersRoutes,
  cycleStatisticsRoutes,
  classSessionsRoutes
};
