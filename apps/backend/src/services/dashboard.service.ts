import { PrismaClient } from '@prisma/client';
import { AdminDashboardDto, TeacherDashboardDto, StudentDashboardDto, TutorDashboardDto } from '../dto/dashboard-response.dto';
import { inicioDelAdmin } from './inicio/inicio-del-admin';
import { inicioDelProfesor } from './inicio/inicio-del-profesor';
import { inicioDelAlumno } from './inicio/inicio-del-alumno';
import { inicioDelRepresentante } from './inicio/inicio-del-representante';

/**
 * El Inicio de cada rol. Cada uno vive en su archivo de `services/inicio/`
 * (lo común —la ventana del lapso, la asistencia— en `inicio/comun.ts`).
 */
export class DashboardService {
    async getAdminDashboard(db: PrismaClient, instituteId?: string): Promise<AdminDashboardDto> {
        return inicioDelAdmin(db, instituteId);
    }

    async getTeacherDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<TeacherDashboardDto> {
        return inicioDelProfesor(userId, db, instituteId);
    }

    async getStudentDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<StudentDashboardDto> {
        return inicioDelAlumno(userId, db, instituteId);
    }

    async getTutorDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<TutorDashboardDto> {
        return inicioDelRepresentante(userId, db, instituteId);
    }
}
