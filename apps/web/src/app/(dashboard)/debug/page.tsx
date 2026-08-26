'use client';

import { useStudentDashboard } from '@/hooks/useStudents';
import { useAuthStore } from '@/store/auth.store';

export default function DebugDashboard() {
    const { user } = useAuthStore();
    const { data, isLoading, error } = useStudentDashboard();

    if (isLoading) {
        return (
            <div className="p-8 bg-white">
                <h1 className="text-2xl font-bold mb-4">Debug Dashboard - Cargando...</h1>
                <div className="animate-pulse bg-gray-200 h-64 rounded"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 bg-white">
                <h1 className="text-2xl font-bold mb-4 text-red-600">Debug Dashboard - Error</h1>
                <div className="bg-red-50 border border-red-200 rounded p-4">
                    <p className="text-red-800 font-mono">{error.message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 bg-white min-h-screen">
            <h1 className="text-2xl font-bold mb-4">Debug Dashboard - JSON Crudo</h1>
            <p className="text-gray-600 mb-4">
                Usuario: <span className="font-mono">{user?.firstName} {user?.lastName}</span> ({user?.role})
            </p>

            <div className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-auto max-h-[80vh] font-mono text-sm">
                <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
                <h2 className="font-bold text-blue-900 mb-2">✅ Verificación de Integridad</h2>
                <ul className="space-y-1 text-sm text-blue-800">
                    <li>• kpis.globalAverage: <span className="font-mono">{typeof data?.kpis?.globalAverage}</span> = {data?.kpis?.globalAverage}</li>
                    <li>• kpis.attendancePercentage: <span className="font-mono">{typeof data?.kpis?.attendancePercentage}</span> = {data?.kpis?.attendancePercentage}</li>
                    <li>• subjects: <span className="font-mono">{Array.isArray(data?.subjects) ? `Array[${data.subjects.length}]` : 'NOT AN ARRAY'}</span></li>
                    <li>• recentObservations: <span className="font-mono">{Array.isArray(data?.recentObservations) ? `Array[${data.recentObservations.length}]` : 'NOT AN ARRAY'}</span></li>
                </ul>
                {(data?.kpis?.globalAverage === null || data?.kpis?.globalAverage === undefined || isNaN(data?.kpis?.globalAverage)) && (
                    <p className="mt-2 text-red-600 font-bold">⚠️ ADVERTENCIA: globalAverage es null/undefined/NaN</p>
                )}
            </div>
        </div>
    );
}
