import { ArrowLeft, GraduationCap, TrendingDown, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface SubjectHeaderProps {
    yearId: string;
    gradeSlug?: string;
    sectionSlug?: string;
    sectionId?: string;
    subjectName: string;
    topic?: string;
}

export default function SubjectHeader({ yearId, gradeSlug, sectionSlug, sectionId, subjectName, topic }: SubjectHeaderProps) {
    const sectionName = sectionSlug?.split('-').pop()?.toUpperCase() || sectionSlug || sectionId || 'Unknown';

    const backLink = gradeSlug && sectionSlug
        ? `/dashboard/academico/${yearId}/${sectionSlug || sectionId}`
        : sectionId
            ? `/dashboard/academico/${yearId}/${sectionId}`
            : '#';

    return (
        <div className="space-y-6">
            {/* Navigation & Title */}
            <div className="space-y-2">
                <Link
                    href={backLink}
                    className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Volver a Sección {sectionName}
                </Link>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{subjectName}</h1>
                        <div className="flex items-center gap-3 mt-2 text-sm">
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
                                3er Lapso
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-600 font-medium">
                                Tema: <span className="text-gray-900">{topic || 'General'}</span>
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="flex items-center gap-1.5 text-red-600 font-medium animate-pulse">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                                </span>
                                En Curso (Quedan 40 min)
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mini-KPIs Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-100 p-3 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Promedio Biología</p>
                        <p className="text-lg font-bold text-gray-900">15.2</p>
                    </div>
                </div>

                <div className="bg-white border border-gray-100 p-3 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                        <TrendingDown className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">En Riesgo</p>
                        <p className="text-lg font-bold text-gray-900">3 Alumnos</p>
                    </div>
                </div>

                <div className="bg-white border border-gray-100 p-3 rounded-xl shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium">Asistencia Hoy</p>
                        <p className="text-lg font-bold text-gray-900">0/35 <span className="text-sm font-normal text-gray-500">marcados</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
