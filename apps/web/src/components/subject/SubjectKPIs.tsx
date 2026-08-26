import { Users, TrendingUp, BookOpen, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPIProps {
    totalStudents: number;
    averageGrade: number;
    approvalRate: number;
    activeSections: number;
}

export function SubjectKPIs({ totalStudents, averageGrade, approvalRate, activeSections }: KPIProps) {
    const isGoodAverage = averageGrade >= 15;
    const isBadAverage = averageGrade < 10;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Total Students */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow duration-200">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Users size={24} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Estudiantes</p>
                    <p className="font-bold text-gray-900 text-2xl">{totalStudents}</p>
                </div>
            </div>

            {/* Average Grade */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow duration-200">
                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    isGoodAverage ? "bg-emerald-50 text-emerald-600" :
                        isBadAverage ? "bg-red-50 text-red-600" :
                            "bg-amber-50 text-amber-600"
                )}>
                    <TrendingUp size={24} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Promedio General</p>
                    <div className="flex items-baseline gap-2">
                        <p className={cn(
                            "font-bold text-2xl",
                            isGoodAverage ? "text-emerald-600" :
                                isBadAverage ? "text-red-600" :
                                    "text-amber-600"
                        )}>
                            {averageGrade.toFixed(1)}
                        </p>
                        <span className="text-xs text-gray-400 font-medium">/ 20</span>
                    </div>
                </div>
            </div>

            {/* Approval Rate */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow duration-200">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <GraduationCap size={24} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Tasa Aprobación</p>
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 text-2xl">{approvalRate}%</p>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${approvalRate}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Sections */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow duration-200">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                    <BookOpen size={24} />
                </div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Secciones Activas</p>
                    <p className="font-bold text-gray-900 text-2xl">{activeSections}</p>
                </div>
            </div>
        </div>
    );
}
