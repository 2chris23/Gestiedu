
import React from 'react';
import { TrendingUp, TrendingDown, Clock, AlertTriangle, GraduationCap, Award } from 'lucide-react';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';

interface Props {
    average: number;
    attendance: number;
    observations: number;
    riskSubjects: number; // Materias reprobadas o bajo promedio
}

export default function StudentAcademicStats({ average, attendance, observations, riskSubjects }: Props) {
    const { data: academicConfig } = useAcademicConfig();
    const passingGrade = academicConfig?.notaMinimaAprobatoria ?? academicConfig?.passingGrade ?? 10;
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Promedio */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Promedio Global</span>
                    <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                        <GraduationCap size={16} />
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold text-gray-900">{average}</h3>
                    <span className="flex items-center text-xs font-medium text-green-600">
                        <TrendingUp size={12} className="mr-0.5" /> +0.5
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">vs Lapso anterior</p>
            </div>

            {/* Asistencia */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Asistencia</span>
                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                        <Clock size={16} />
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold text-gray-900">{attendance}%</h3>
                    <span className="flex items-center text-xs font-medium text-gray-500">
                        = Promedio
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Total acumulado</p>
            </div>

            {/* Observaciones */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Observaciones</span>
                    <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                        <Award size={16} />
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold text-gray-900">{observations}</h3>
                    <span className="flex items-center text-xs font-medium text-green-600">
                        <TrendingUp size={12} className="mr-0.5" /> Positivas
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">En este lapso</p>
            </div>

            {/* Riesgo / Ranking */}
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Riesgo Académico</span>
                    <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
                        <AlertTriangle size={16} />
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold text-gray-900">{riskSubjects}</h3>
                    <span className="text-xs text-gray-500">Materias</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Con promedio &lt; {passingGrade}</p>
            </div>
        </div>
    );
}
