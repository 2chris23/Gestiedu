// apps/web/src/services/dashboard.service.ts

import axios from 'axios';
import { DashboardKPIs, SectionStats, StudentStats } from '@/types/dashboard.types';
import { API_URL } from '@/config/env';


/**
 * Servicio para obtener datos del dashboard
 * Todos los métodos retornan datos reales de la API
 */
class DashboardService {
    /**
     * Obtener KPIs del dashboard según el rol del usuario
     */
    async getDashboardKPIs(role: string): Promise<DashboardKPIs> {
        try {
            let endpoint = '';

            switch (role) {
                case 'ADMIN':
                    endpoint = '/dashboard/admin';
                    break;
                case 'TEACHER':
                    endpoint = '/dashboard/teacher';
                    break;
                case 'STUDENT':
                    endpoint = '/dashboard/student';
                    break;
                case 'TUTOR':
                    endpoint = '/dashboard/tutor';
                    break;
                default:
                    endpoint = '/dashboard/admin';
            }

            const response = await axios.get(`${API_URL}${endpoint}`, {
                headers: {
                    Authorization: `Bearer ${this.getToken()}`,
                },
            });

            return response.data.data;
        } catch (error) {
            console.error('Error fetching dashboard KPIs:', error);
            throw error;
        }
    }

    /**
     * Obtener estadísticas de una sección específica
     */
    async getSectionStats(sectionId: string, academicYearId: string): Promise<SectionStats> {
        try {
            const response = await axios.get(
                `${API_URL}/classrooms/${sectionId}/stats`,
                {
                    params: { academicYearId },
                    headers: {
                        Authorization: `Bearer ${this.getToken()}`,
                    },
                }
            );

            return response.data.data;
        } catch (error) {
            console.error('Error fetching section stats:', error);
            throw error;
        }
    }

    /**
     * Obtener estadísticas de un estudiante específico
     */
    async getStudentStats(studentId: string): Promise<StudentStats> {
        try {
            const response = await axios.get(
                `${API_URL}/students/${studentId}/stats`,
                {
                    headers: {
                        Authorization: `Bearer ${this.getToken()}`,
                    },
                }
            );

            return response.data.data;
        } catch (error) {
            console.error('Error fetching student stats:', error);
            throw error;
        }
    }

    /**
     * Obtener estadísticas del instituto
     */
    async getInstituteStats(): Promise<DashboardKPIs> {
        try {
            const response = await axios.get(`${API_URL}/dashboard/institute`, {
                headers: {
                    Authorization: `Bearer ${this.getToken()}`,
                },
            });

            return response.data.data;
        } catch (error) {
            console.error('Error fetching institute stats:', error);
            throw error;
        }
    }

    /**
     * Helper para obtener el token de autenticación
     */
    private getToken(): string {
        // Read access token from HttpOnly cookie
        if (typeof document !== 'undefined') {
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {} as Record<string, string>);
            return cookies['access_token'] || '';
        }
        return '';
    }
}

export const dashboardService = new DashboardService();
