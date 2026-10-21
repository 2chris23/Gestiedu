'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Representado } from '@/components/dashboard/cifras-del-inicio';

/**
 * LO QUE PIDE EL INICIO, EN UN SOLO SITIO (octubre 2026)
 *
 * En el ordenador el Inicio se pinta en dos trozos: la franja azul (el
 * promedio y las cifras, que pinta el armazón: `FranjaDelInicio`) y la hoja
 * de abajo (`dashboard/page.tsx`). Los dos usan estas consultas, con la MISMA
 * llave: es una sola petición, y la precarga del teléfono la encuentra donde
 * siempre (`adminDashboard`, `teacherDashboard`…).
 */

interface EventoDelCalendario {
    id: string;
    title: string;
    description?: string | null;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    scope?: string | null;
    isHoliday?: boolean;
}

export interface CalendarioDelInicio {
    currentPeriod?: {
        id: string;
        name: string;
        startDate: string;
        endDate: string;
        daysLeft: number | null;
    } | null;
    events: EventoDelCalendario[];
}

export interface AdminDashboardData {
    kpis: {
        totalStudents: number;
        totalTeachers: number;
        totalClassrooms: number;
        activeAcademicYear: string | null;
    };
    stats: {
        averageAttendance: number;
        studentsAtRisk: number;
        pendingActivities: number;
        promedioGeneral?: number | null;
    };
    eventsCalendar?: CalendarioDelInicio;
}

export interface StudentDashboardData {
    student?: {
        id: string;
        fullName: string;
        currentSection?: { id: string; name: string; academicYearName?: string | null } | null;
    };
    kpis: {
        globalAverage: number;
        failedSubjects: number;
        attendancePercentage: number;
        totalObservations: number;
    };
    subjects: Array<{
        id: string;
        name: string;
        average: number;
        color: string;
        status: string;
    }>;
    periodAverages: Array<{
        periodId: string;
        periodName: string;
        average: number;
    }>;
}

// Lo que el servidor le da a un profesor: lo suyo, no lo del liceo entero.
export interface TeacherDashboardData {
    teacher?: { id: string; firstName: string; lastName: string; specialization?: string };
    classrooms: Array<{ id: string; name: string; studentCount: number }>;
    upcomingActivities: Array<{ id: string; title: string; dueDate: string }>;
    stats: {
        totalStudents: number;
        totalClassrooms: number;
        pendingGrades: number;
        promedioGeneral?: number | null;
        averageAttendance?: number;
        studentsAtRisk?: number;
        isGuideTeacher?: boolean;
    };
    eventsCalendar?: CalendarioDelInicio;
    activeAcademicYear?: string | null;
}

export function useInicioDelAdmin(activo: boolean) {
    return useQuery({
        queryKey: ['adminDashboard'],
        queryFn: async () => (await api.get<{ data: AdminDashboardData }>('/dashboard/admin')).data.data,
        enabled: activo,
        staleTime: 2 * 60 * 1000,
    });
}

export function useInicioDelProfesor(activo: boolean) {
    return useQuery({
        queryKey: ['teacherDashboard'],
        queryFn: async () => (await api.get<{ data: TeacherDashboardData }>('/dashboard/teacher')).data.data,
        enabled: activo,
        staleTime: 2 * 60 * 1000,
    });
}

export function useInicioDelAlumno(activo: boolean) {
    return useQuery({
        queryKey: ['studentDashboard'],
        queryFn: () => api.get<{ data: StudentDashboardData }>('/students/my-dashboard').then((res) => res.data.data),
        enabled: activo,
        retry: false,
    });
}

export function useInicioDelRepresentante(activo: boolean) {
    return useQuery({
        queryKey: ['panelDelRepresentante'],
        queryFn: async () => (await api.get('/dashboard/tutor')).data.data as { children: Representado[] },
        enabled: activo,
        retry: false,
    });
}
