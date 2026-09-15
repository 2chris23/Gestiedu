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
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow h-full">
            <div>
                <div className="flex items-start justify-between gap-1 mb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight leading-tight" title={title}>
                        {title}
                    </span>
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${colorClasses[color]}`}>
                        <Icon className="w-3.5 h-3.5" />
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
            </div>

            {subtext && (
                <p className="text-[10px] text-gray-400 mt-2 truncate" title={subtext}>
                    {subtext}
                </p>
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
    averageTitle?: string;
    riskSubtext?: string;
    className?: string;
}

export default function AcademicStats({
    stats,
    isStudentView = false,
    averageTitle = "Promedio Global",
    riskSubtext,
    className
}: AcademicStatsProps) {
    // Si no se suministran datos aún, mostrar estado neutro
    const data = stats || {
        average: 0,
        minAverage: 0,
        maxAverage: 0,
        riskCount: 0,
        occupancy: "0/0",
        attendance: "0%",
        observations: 0
    };

    return (
        <div className={className || "grid grid-cols-2 md:grid-cols-5 gap-4"}>
            <StatCard
                title={averageTitle}
                value={data.average}
                color="blue"
                icon={GraduationCap}
                trend={undefined}
                subtext={!isStudentView && data.minAverage !== undefined && data.minAverage > 0
                    ? `Min: ${data.minAverage} / Max: ${data.maxAverage}`
                    : (!isStudentView ? "Ciclo Actual" : undefined)}
            />

            <StatCard
                title="Riesgo Académico"
                value={data.riskCount}
                color="red"
                icon={AlertTriangle}
                subtext={riskSubtext || (isStudentView ? "Materias reprobadas" : "Alumnos con materias < 10 pts")}
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
