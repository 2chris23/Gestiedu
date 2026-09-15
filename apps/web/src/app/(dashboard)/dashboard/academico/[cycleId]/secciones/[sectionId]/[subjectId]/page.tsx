'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Users, BookOpen, GraduationCap, Calendar,
    Bell, Search, Plus, MoreVertical, TrendingUp, Clock,
    FileText, CheckCircle, AlertTriangle, MapPin, Settings,
    ChevronRight, Home, UserCircle
} from 'lucide-react';
import { useClassroomBySlug } from '@/hooks/useClassrooms';
import { useClassroomSubjectDetail, useClassroomSubjectsStats } from '@/hooks/useClassroomSubjects';
import { useStudents } from '@/hooks/useStudents';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import AcademicStats from '@/components/academic/AcademicStats';
import LapsoSelector from '@/components/academic/LapsoSelector';
import SubjectActivitiesTab from '@/components/subject/SubjectActivitiesTab';
import SubjectObservationsTab from '@/components/subject/SubjectObservationsTab';

const DAY_NAMES: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
};

const SCHEDULE_COLORS = ['#4F46E5', '#7C3AED', '#0891B2', '#059669', '#D97706'];

export default function SectionSubjectDashboard() {
    const params = useParams();
    const { cycleId, sectionId, subjectId } = params as { cycleId: string; sectionId: string; subjectId: string };
    const [activeTab, setActiveTab] = useState('estudiantes');
    const [searchTerm, setSearchTerm] = useState('');
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);

    // Resolver classroom por slug (con año para desambiguar entre ciclos con mismo slug base)
    const { data: classroom, isLoading: isLoadingClassroom } = useClassroomBySlug(sectionId, cycleId);
    const classroomId = classroom?.id || '';

    const periods = useMemo(() => {
        return ((classroom as any)?.academicYear?.periods || []).map((p: any) => ({
            id: p.id as string,
            name: p.name as string,
        }));
    }, [classroom]);

    const { data: academicConfig } = useAcademicConfig();
    const passingGrade = academicConfig?.notaMinimaAprobatoria ?? academicConfig?.passingGrade ?? 10;

    const { data: classroomSubject, isLoading: isLoadingSubject } = useClassroomSubjectDetail(classroomId, subjectId);
    const realSubjectId = classroomSubject?.subject?.id || classroomSubject?.subjectId;

    const { data: studentsData } = useStudents(classroomId || '', { page: 1, limit: 100, periodId: lapsoId, subjectId: realSubjectId });
    const students = studentsData?.students || studentsData?.users || [];

    const { data: subjectsWithStats } = useClassroomSubjectsStats(classroomId, lapsoId);

    const currentSubjectStats = useMemo(() => {
        if (!subjectsWithStats || subjectsWithStats.length === 0) return null;
        return subjectsWithStats.find(
            (s: any) => s.id === subjectId || s.code === classroomSubject?.subject?.code || s.slug === subjectId || s.id === classroomSubject?.subjectId
        );
    }, [subjectsWithStats, subjectId, classroomSubject]);

    const subjectAcademicStats = useMemo(() => {
        const capacity = classroom?.capacity || 35;
        const count = (classroom as any)?.studentCount || (classroom as any)?._count?.students || students.length || 0;

        const validAverages = students
            .map((s: any) => s.average)
            .filter((a: any): a is number => a !== undefined && a !== null && !isNaN(a) && a > 0);

        const minScore = validAverages.length > 0 ? Math.min(...validAverages) : 0;
        const maxScore = validAverages.length > 0 ? Math.max(...validAverages) : 0;

        const calculatedAvg = validAverages.length > 0
            ? Math.round((validAverages.reduce((acc: number, curr: number) => acc + curr, 0) / validAverages.length) * 10) / 10
            : 0;

        const avg = currentSubjectStats?.stats?.average ?? calculatedAvg;
        const attendance = currentSubjectStats?.stats?.attendance ?? 0;
        const atRisk = currentSubjectStats?.stats?.atRiskStudents ?? students.filter((s: any) => s.average && s.average < passingGrade).length;
        const obs = currentSubjectStats?.stats?.observations ?? 0;

        return {
            average: avg || 0,
            minAverage: minScore > 0 ? Math.round(minScore * 10) / 10 : undefined,
            maxAverage: maxScore > 0 ? Math.round(maxScore * 10) / 10 : undefined,
            riskCount: atRisk,
            occupancy: `${count}/${capacity}`,
            attendance: `${attendance}%`,
            observations: obs
        };
    }, [currentSubjectStats, students, classroom, passingGrade]);

    const isLoading = isLoadingClassroom || isLoadingSubject;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="mt-4 text-gray-600">Cargando materia...</p>
                </div>
            </div>
        );
    }

    if (!classroomSubject) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
                <div className="text-center">
                    <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-bold text-gray-900">Materia no encontrada</h3>
                    <p className="mt-1 text-gray-500">Esta materia no está asignada a esta sección.</p>
                    <Link
                        href={`/dashboard/academico/${cycleId}/secciones/${sectionId}`}
                        className="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" /> Volver a la sección
                    </Link>
                </div>
            </div>
        );
    }

    // Datos de la materia
    const subject = classroomSubject.subject;
    const teacher = classroomSubject.teacher;
    const section = classroomSubject.classroom || classroom;
    const scheduleBlocks = classroomSubject.scheduleBlocks || [];
    const hoursPerWeek = classroomSubject.hoursPerWeek || 0;
    const sectionName = section?.name || sectionId;
    const studentCount = (classroom as any)?.studentCount || (classroom as any)?._count?.students || 0;

    // Formatear horario
    const schedule = scheduleBlocks.map((block: any, index: number) => ({
        id: block.id,
        day: DAY_NAMES[block.dayOfWeek] || `Día ${block.dayOfWeek}`,
        startTime: block.startTime,
        endTime: block.endTime,
        classroom: block.location || 'Sin asignar',
        content: block.notes || '',
        color: SCHEDULE_COLORS[index % SCHEDULE_COLORS.length],
    }));

    // Iniciales del profesor
    const teacherInitials = teacher
        ? `${teacher.firstName?.[0] || ''}${teacher.lastName?.[0] || ''}`
        : '';
    const teacherName = teacher
        ? `${teacher.firstName} ${teacher.lastName}`
        : 'Sin profesor asignado';

    const getGradeColor = (avg: number) => {
        if (avg >= 15) return 'text-emerald-600 bg-emerald-50';
        if (avg >= 10) return 'text-amber-600 bg-amber-50';
        return 'text-red-600 bg-red-50';
    };

    return (
        <div className="min-h-screen bg-gray-50/50 pb-12">
            {/* Header */}
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    {/* Breadcrumbs */}
                    <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                        <Link href="/dashboard" className="hover:text-indigo-600">
                            <Home className="w-4 h-4" />
                        </Link>
                        <ChevronRight className="w-4 h-4" />
                        <Link href="/dashboard/academico" className="hover:text-indigo-600">Académico</Link>
                        <ChevronRight className="w-4 h-4" />
                        <Link href={`/dashboard/academico/${cycleId}`} className="hover:text-indigo-600">
                            {decodeURIComponent(cycleId)}
                        </Link>
                        <ChevronRight className="w-4 h-4" />
                        <span>Secciones</span>
                        <ChevronRight className="w-4 h-4" />
                        <Link href={`/dashboard/academico/${cycleId}/secciones/${sectionId}`} className="hover:text-indigo-600">
                            {sectionName}
                        </Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="font-semibold text-gray-900">{subject.name}</span>
                    </nav>

                    {/* Title Row */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href={`/dashboard/academico/${cycleId}/secciones/${sectionId}`}
                                className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    {subject.name}{' '}
                                    <span className="text-indigo-600">{sectionName}</span>
                                </h1>
                                <div className="flex items-center gap-4 mt-1">
                                    {subject.code && (
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                                            {subject.code}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1 text-sm text-gray-500">
                                        <Users className="w-4 h-4" /> {studentCount} Estudiantes
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Teacher and Hours Card */}
                        <div className="flex items-center gap-6 bg-white rounded-full border border-gray-200 shadow-sm px-4 py-2">
                            <div className="flex items-center gap-3">
                                {teacher ? (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold text-sm">
                                        {teacherInitials}
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                        <UserCircle className="w-6 h-6 text-gray-400" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Profesor</p>
                                    <p className="font-semibold text-gray-900 text-sm">{teacherName}</p>
                                </div>
                            </div>
                            <div className="h-8 w-px bg-gray-200" />
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" />
                                <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Horario</p>
                                    <p className="font-semibold text-gray-900 text-sm">{hoursPerWeek}h Semanales</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Reconstructed Top Section: Grid with Subject Stats (Blue Box) and Schedule (Red Box) */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-8 items-stretch">
                    {/* ZONA AZUL: Tarjetas de Rendimiento y Estadísticas de la Materia */}
                    <div className="xl:col-span-8 flex flex-col justify-between">
                        <AcademicStats
                            stats={subjectAcademicStats}
                            averageTitle="Promedio Materia"
                            className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 h-full"
                        />
                    </div>

                    {/* ZONA ROJA: Horario de Clases Compacto */}
                    <div className="xl:col-span-4 flex flex-col">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between h-full">
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg text-indigo-600 bg-indigo-50">
                                        <Clock className="w-4 h-4" />
                                    </div>
                                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                        Horario de Clases
                                    </span>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                    {hoursPerWeek}h Semanales
                                </span>
                            </div>

                            {schedule.length > 0 ? (
                                <div className="space-y-1.5 flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                                    {schedule.map((block: any) => (
                                        <div
                                            key={block.id}
                                            className="flex items-center justify-between px-2.5 py-1 rounded-lg border text-xs transition-all hover:bg-gray-50/50"
                                            style={{
                                                borderColor: `${block.color}30`,
                                                backgroundColor: `${block.color}08`
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: block.color }}
                                                />
                                                <span className="font-bold text-gray-800 text-[11px]">{block.day}</span>
                                                <span className="text-[10px] text-gray-500 font-medium">
                                                    {block.startTime} - {block.endTime}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-semibold text-gray-600 bg-white/90 px-1.5 py-0.5 rounded border border-gray-200/60 shadow-2xs">
                                                {block.classroom}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-6 text-center text-gray-400 text-xs flex flex-col items-center justify-center flex-1">
                                    <Clock className="w-6 h-6 mb-1 text-gray-300" />
                                    <span>Sin horario configurado</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        {[
                            { id: 'estudiantes', label: 'Estudiantes', icon: Users },
                            { id: 'actividades', label: 'Actividades', icon: Clock },
                            { id: 'calificaciones', label: 'Calificaciones', icon: GraduationCap },
                            { id: 'observaciones', label: 'Observaciones', icon: Bell },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${isActive
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <Icon className={`-ml-0.5 mr-2 h-5 w-5 ${isActive ? 'text-indigo-500' : 'text-gray-400'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Students Tab - placeholder until real student grades are wired */}
                {activeTab === 'estudiantes' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Lista de Estudiantes</h3>
                        <p className="text-gray-500">
                            La lista de estudiantes con calificaciones por materia está disponible en la vista principal.
                        </p>
                        <Link
                            href={`/dashboard/academico/${cycleId}/${sectionId}/${subjectId}`}
                            className="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                        >
                            Ir al panel interactivo de la materia
                        </Link>
                    </div>
                )}

                {/* Actividades Tab */}
                {activeTab === 'actividades' && (
                    <SubjectActivitiesTab
                        classroomId={classroomId}
                        subjectId={classroomSubject.subject.id}
                        cycleId={cycleId}
                        sectionId={sectionId}
                    />
                )}

                {/* Observaciones Tab */}
                {activeTab === 'observaciones' && (
                    <SubjectObservationsTab
                        classroomId={classroomId}
                        subjectId={classroomSubject.subject.id}
                        periodId={lapsoId}
                        onPeriodChange={setLapsoId}
                        periods={periods}
                    />
                )}

                {/* Placeholder for other tabs */}
                {activeTab === 'calificaciones' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Próximamente</h3>
                        <p className="text-gray-500">Esta sección está en desarrollo.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
