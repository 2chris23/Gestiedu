'use client';

import { Users, AlertTriangle, FileText, TrendingUp, UserCircle } from 'lucide-react';
import Image from 'next/image';

import Link from 'next/link';

interface SubjectStats {
    average: number | null;
    attendance: number;
    observations: number;
    atRiskStudents: number;
}

interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
}

interface SubjectCardProps {
    id: string;
    name: string;
    color: string;
    code: string;
    stats?: SubjectStats;
    teacher?: Teacher;
    hoursPerWeek?: number;
    /** Optional: If provided, use this href instead of global /dashboard/materias */
    sectionHref?: string;
}

export function SubjectCard({ id, name, color, code, stats, teacher, hoursPerWeek, sectionHref }: SubjectCardProps) {
    // Función para obtener el color del promedio (verde brillante a rojo fuerte)
    const getGradeColor = (average: number | null): string => {
        if (average === null) return '#6B7280'; // gray-500 para "Sin calificar"

        // Escala de 0-20 puntos
        // 0pts = rojo fuerte (#DC2626 - red-600)
        // 10pts = amarillo (#F59E0B - amber-500)
        // 20pts = verde brillante (#10B981 - emerald-500)

        if (average >= 15) {
            // Verde brillante
            return '#10B981';
        } else if (average >= 10) {
            // Amarillo/verde
            return '#84CC16'; // lime-500
        } else if (average >= 5) {
            // Amarillo/naranja
            return '#F59E0B';
        } else {
            // Rojo fuerte
            return '#DC2626';
        }
    };

    const gradeColor = getGradeColor(stats?.average ?? null);

    // Default stats if not provided
    const displayStats = stats || {
        average: null,
        attendance: 0,
        observations: 0,
        atRiskStudents: 0
    };

    const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Profesor sin asignar';
    const teacherAvatar = teacher?.avatar;

    return (
        <Link href={sectionHref || `/dashboard/materias/${id}`} className="block">
            <div
                className="rounded-xl shadow-md overflow-hidden transition-all hover:shadow-lg cursor-pointer transform hover:-translate-y-1 duration-200"
                style={{ backgroundColor: color }}
            >
                {/* Header con nombre de materia */}
                <div className="p-4 bg-black bg-opacity-10">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-bold text-white text-lg">{name}</h3>
                        </div>
                        <div className="text-right">
                            <div className="text-white text-opacity-70 text-xs">Horas/semana</div>
                            <div className="font-bold text-white text-lg">
                                {hoursPerWeek ? `${hoursPerWeek}h` : 'Sin asignar'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Contenido principal */}
                <div className="p-4 bg-white">
                    {/* Profesor asignado */}
                    <div className="mb-4 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        {teacherAvatar ? (
                            <Image
                                src={teacherAvatar}
                                alt={teacherName}
                                width={40}
                                height={40}
                                className="rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <UserCircle className="w-6 h-6 text-gray-400" />
                            </div>
                        )}
                        <div className="flex-1">
                            <div className="text-xs text-gray-500">Profesor</div>
                            <div className="font-semibold text-sm text-gray-900">{teacherName}</div>
                        </div>
                    </div>

                    {/* Promedio y Asistencia */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Promedio */}
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">Promedio</div>
                            <div
                                className="text-2xl font-bold"
                                style={{ color: gradeColor }}
                            >
                                {displayStats.average !== null ? `${displayStats.average.toFixed(1)}pts` : 'Sin calificar'}
                            </div>
                        </div>

                        {/* Asistencia */}
                        <div className="flex flex-col items-center justify-center gap-1 p-3 bg-gray-50 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                            <div className="text-xs text-gray-500">Asistencia</div>
                            <div className="font-semibold text-lg text-gray-900">{displayStats.attendance}%</div>
                        </div>
                    </div>

                    {/* Riesgo académico y Observaciones */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Estudiantes en riesgo */}
                        <div className="flex flex-col items-center gap-1 p-3 bg-red-50 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <div className="text-xs text-gray-500 text-center">Estudiantes en riesgo</div>
                            <div className="font-semibold text-lg text-red-900">{displayStats.atRiskStudents}</div>
                        </div>

                        {/* Observaciones */}
                        <div className="flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-lg">
                            <FileText className="w-5 h-5 text-purple-600" />
                            <div className="text-xs text-gray-500">Observaciones</div>
                            <div className="font-semibold text-lg text-gray-900">{displayStats.observations}</div>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
