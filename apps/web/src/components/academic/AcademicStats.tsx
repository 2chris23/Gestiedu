import { TrendingUp, TrendingDown, Users, AlertTriangle, GraduationCap, Calendar, Bell } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    subtext?: string;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'green' | 'red' | 'blue' | 'amber' | 'indigo';
    icon: React.ElementType;
}

function StatCard({ title, value, subtext, trend, color = 'indigo', icon: Icon }: StatCardProps) {
    const colorClasses = {
        green: 'text-green-600 bg-green-50',
        red: 'text-red-600 bg-red-50',
        blue: 'text-blue-600 bg-blue-50',
        amber: 'text-amber-600 bg-amber-50',
        indigo: 'text-indigo-600 bg-indigo-50',
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 justify-start hover:shadow-md transition-shadow h-full">
            <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate" title={title}>{title}</span>
                <div className={`p-1.5 rounded-lg ${colorClasses[color]}`}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>

            <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
                {trend && (
                    <span className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                        {trend === 'up' ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    </span>
                )}
            </div>

            {subtext && (
                <p className="text-xs text-gray-400 mt-1 truncate">{subtext}</p>
            )}
        </div>
    );
}

interface AcademicStatsProps {
    stats?: {
        average: number;
        minAverage?: number;
        maxAverage?: number;
        riskCount: number;
        occupancy: string;
        attendance: string;
        observations: number;
    };
    isStudentView?: boolean;
}

export default function AcademicStats({ stats, isStudentView = false }: AcademicStatsProps) {
    // Default / Mock Data if no props provided (or for Global view)
    const data = stats || {
        average: 15.4,
        minAverage: 12,
        maxAverage: 18,
        riskCount: 12,
        occupancy: "140/150",
        attendance: "92%",
        observations: 8
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
                title="Promedio Global"
                value={data.average}
                color="blue"
                icon={GraduationCap}
                trend={undefined}
                subtext={!isStudentView && data.minAverage !== undefined
                    ? `Min: ${data.minAverage} / Max: ${data.maxAverage}`
                    : (!isStudentView ? "Ciclo Actual" : undefined)}
            />

            <StatCard
                title="Riesgo Académico"
                value={data.riskCount}
                color="red"
                icon={AlertTriangle}
                subtext={isStudentView ? "Materias reprobadas" : "Estudiantes con promedio < 10"}
            />

            {/* Hide Occupancy for Student View */}
            {!isStudentView && (
                <StatCard
                    title="Ocupación"
                    value={data.occupancy}
                    color="green"
                    icon={Users}
                    subtext="Estudiantes / Capacidad"
                />
            )}

            <StatCard
                title="Asistencia"
                value={data.attendance}
                color="indigo"
                icon={Calendar}
                trend={undefined}
                subtext={isStudentView ? "Acumulada" : "Promedio general"}
            />

            <StatCard
                title="Observaciones"
                value={data.observations}
                color="amber"
                icon={Bell}
                trend={undefined}
                subtext={isStudentView ? "Total acumulado" : "Total registrado"}
            />
        </div>
    );
}
