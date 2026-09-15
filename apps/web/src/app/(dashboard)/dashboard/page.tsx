'use client';

import { Card } from '@/components/ui';
import { DataCard } from '@/components/common/DataCard';
import { TrendChart, StatusBadge } from '@/components/dashboard';
import { useAuthStore } from '@/store/auth.store';
import { useStudentDashboard } from '@/hooks/useStudents';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import {
    Users,
    TrendingUp,
    Clock,
    AlertTriangle,
    BookOpen,
    Calendar,
    Bell,
    GraduationCap,
    School
} from 'lucide-react';

// Tipos para el dashboard de admin
interface AdminDashboardData {
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
    };
}

// Tipos para el dashboard de estudiante
interface StudentDashboardData {
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

export default function DashboardPage() {
    const { user } = useAuthStore();

    // ✅ Usando React Query para caché automático - solo si es estudiante
    const { data: studentStats, isLoading: isLoadingStudent } = useQuery({
        queryKey: ['studentDashboard'],
        queryFn: () => api.get<{ data: StudentDashboardData }>('/students/my-dashboard').then(res => res.data.data),
        enabled: user?.role === 'STUDENT', // Solo ejecutar si es estudiante
        retry: false,
    });

    // Hook para admin/teacher - obtener datos reales del backend
    const { data: adminData, isLoading: isLoadingAdmin } = useQuery({
        queryKey: ['adminDashboard'],
        queryFn: async () => {
            const response = await api.get<{ data: AdminDashboardData }>('/dashboard/admin');
            return response.data.data;
        },
        enabled: user?.role === 'ADMIN' || user?.role === 'TEACHER',
        staleTime: 2 * 60 * 1000, // 2 minutos
    });

    // Datos de evolución REALES: promedio del estudiante por lapso (calculado en el backend)
    const evolutionData = (studentStats?.periodAverages ?? []).map((p) => ({
        label: p.periodName,
        value: p.average,
    }));



    // Preparar tarjetas usando DataCard - SOLO DATOS REALES
    const getCards = () => {
        if (user?.role === 'STUDENT' && studentStats) {
            return [
                {
                    title: 'Promedio General',
                    value: studentStats.kpis.globalAverage.toFixed(1),
                    icon: TrendingUp,
                    color: 'blue' as const,
                    isLoading: isLoadingStudent,
                },
                {
                    title: 'Asistencia',
                    value: `${studentStats.kpis.attendancePercentage}%`,
                    icon: Clock,
                    color: 'indigo' as const,
                    isLoading: isLoadingStudent,
                },
                {
                    title: 'Materias en Riesgo',
                    value: studentStats.kpis.failedSubjects,
                    icon: AlertTriangle,
                    color: 'red' as const,
                    isLoading: isLoadingStudent,
                },
                {
                    title: 'Observaciones',
                    value: studentStats.kpis.totalObservations,
                    icon: BookOpen,
                    color: 'amber' as const,
                    isLoading: isLoadingStudent,
                },
            ];
        }

        // Tarjetas para admin/teacher con datos reales
        if ((user?.role === 'ADMIN' || user?.role === 'TEACHER') && adminData) {
            return [
                {
                    title: 'Total Estudiantes',
                    value: adminData.kpis.totalStudents,
                    icon: Users,
                    color: 'blue' as const,
                    subtitle: adminData.kpis.activeAcademicYear || 'Ciclo actual',
                    isLoading: isLoadingAdmin,
                },
                {
                    title: 'Asistencia Promedio',
                    value: `${adminData.stats.averageAttendance}%`,
                    icon: GraduationCap,
                    color: 'green' as const,
                    subtitle: 'Últimos 30 días',
                    isLoading: isLoadingAdmin,
                },
                {
                    title: 'Estudiantes en Riesgo',
                    value: adminData.stats.studentsAtRisk,
                    icon: AlertTriangle,
                    color: 'red' as const,
                    subtitle: 'Materias < 10',
                    isLoading: isLoadingAdmin,
                },
                {
                    title: 'Total Profesores',
                    value: adminData.kpis.totalTeachers,
                    icon: School,
                    color: 'purple' as const,
                    subtitle: 'Activos',
                    isLoading: isLoadingAdmin,
                },
            ];
        }

        // Sin datos disponibles
        return [];

    };

    const cards = getCards();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        ¡Hola, {user?.firstName || 'Usuario'}! 👋
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Bienvenido al panel de control de {user?.institute?.name || 'tu escuela'}.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                    <Calendar size={16} />
                    {new Date().toLocaleDateString('es-ES', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    })}
                </div>
            </div>

            {/* KPI Cards Grid - ✅ Usando DataCard con datos reales */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card, index) => (
                    <DataCard
                        key={`${card.title}-${index}`}
                        {...card}
                    />
                ))}
            </div>

            {/* Charts Section */}
            {user?.role === 'STUDENT' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Evolution Chart */}
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <TrendingUp size={20} className="text-blue-600" />
                            Evolución del Promedio
                        </h3>
                        {isLoadingStudent ? (
                            <div className="h-[250px] flex items-center justify-center text-gray-500">
                                Cargando promedios...
                            </div>
                        ) : evolutionData.length > 0 ? (
                            <TrendChart
                                data={evolutionData}
                                type="area"
                                height={250}
                                color="#3b82f6"
                            />
                        ) : (
                            <div className="h-[250px] flex items-center justify-center text-gray-500">
                                Aún no hay calificaciones por lapso
                            </div>
                        )}
                    </Card>

                    {/* Subjects Status */}
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <BookOpen size={20} className="text-purple-600" />
                            Estado de Materias
                        </h3>
                        <div className="space-y-3">
                            {isLoadingStudent ? (
                                <p className="text-gray-500 text-center py-8">Cargando materias...</p>
                            ) : studentStats?.subjects?.length ? (
                                studentStats.subjects.map((subject) => (
                                    <div
                                        key={subject.id}
                                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: subject.color }}
                                            />
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{subject.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    Promedio: {subject.average.toFixed(1)}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusBadge
                                            status={subject.average >= 10 ? 'approved' : 'failed'}
                                            size="sm"
                                        />
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-500 text-center py-8">
                                    Aún no hay calificaciones registradas
                                </p>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* Activity Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Schedule Placeholder */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Calendar size={20} className="text-green-600" />
                        Horario de Hoy
                    </h3>
                    <div className="border-2 border-dashed border-gray-200 rounded-lg h-64 flex items-center justify-center bg-gradient-to-br from-gray-50 to-white">
                        <div className="text-center">
                            <Calendar size={48} className="mx-auto text-gray-500 mb-2" />
                            <p className="text-gray-500 font-medium">Calendario interactivo</p>
                            <p className="text-gray-500 text-sm">Próximamente</p>
                        </div>
                    </div>
                </Card>

                {/* Notifications */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell size={20} className="text-orange-600" />
                        Avisos Recientes
                    </h3>
                    <div className="text-center py-8">
                        <Bell size={48} className="mx-auto text-gray-500 mb-2" />
                        <p className="text-gray-500 font-medium">No hay avisos recientes</p>
                        <p className="text-gray-500 text-sm">Los avisos aparecerán aquí cuando estén disponibles</p>
                    </div>
                </Card>
            </div>
        </div>
    );
}
