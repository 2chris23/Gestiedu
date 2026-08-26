'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Users, BookOpen, GraduationCap, Calendar,
    Bell, Search, Plus, MoreVertical, TrendingUp, Clock,
    FileText, CheckCircle, AlertTriangle, MapPin, Settings,
    ChevronRight, Home, UserCircle
} from 'lucide-react';
import { useClassroomBySlug } from '@/hooks/useClassrooms';
import { useClassroomSubjectDetail } from '@/hooks/useClassroomSubjects';

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

    // Resolver classroom por slug (con año para desambiguar entre ciclos con mismo slug base)
    const { data: classroom, isLoading: isLoadingClassroom } = useClassroomBySlug(sectionId, cycleId);
    const classroomId = classroom?.id || '';

    // Obtener detalle de materia real
    const { data: classroomSubject, isLoading: isLoadingSubject } = useClassroomSubjectDetail(classroomId, subjectId);

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
                {/* Schedule Cards */}
                {schedule.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    <h2 className="font-semibold text-gray-900">Horario de Clases</h2>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {schedule.map((block: any) => (
                                    <div
                                        key={block.id}
                                        className="rounded-xl p-4 text-white shadow-lg"
                                        style={{ background: `linear-gradient(135deg, ${block.color} 0%, ${block.color}dd 100%)` }}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-bold text-lg">{block.day}</h3>
                                            <span className="px-2 py-0.5 bg-white/20 rounded text-xs font-medium flex items-center gap-1">
                                                <MapPin className="w-3 h-3" /> {block.classroom}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-3 bg-white/10 rounded-lg px-3 py-2 w-fit">
                                            <Clock className="w-4 h-4" />
                                            <span className="font-medium text-sm">{block.startTime} - {block.endTime}</span>
                                        </div>
                                        {block.content && (
                                            <div className="mt-3 pt-3 border-t border-white/20">
                                                <p className="text-[10px] uppercase tracking-wide opacity-80 flex items-center gap-1">
                                                    <BookOpen className="w-3 h-3" /> Contenido
                                                </p>
                                                <p className="font-medium text-sm mt-1">{block.content}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Weekly Blocks Info */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp className="w-5 h-5 text-gray-400" />
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Bloques Semanales</p>
                            </div>
                            <div className="flex items-baseline gap-3 mb-3">
                                <span className="text-3xl font-bold text-indigo-600">{classroomSubject.weeklyBlocks || 0}</span>
                                <span className="text-gray-500 text-sm">bloques</span>
                            </div>
                            <p className="text-sm text-gray-500">
                                <span className="font-semibold">{hoursPerWeek}h</span> semanales de clase
                            </p>
                            <p className="text-sm text-gray-500 mt-2">
                                <span className="font-semibold">{schedule.length}</span> sesiones programadas
                            </p>
                        </div>
                    </div>
                )}

                {schedule.length === 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8 text-center">
                        <Clock className="mx-auto h-10 w-10 text-gray-300" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">Sin horario configurado</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Configura el horario desde la sección para agregar bloques de clase.
                        </p>
                    </div>
                )}

                {/* Tabs */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8">
                        {[
                            { id: 'estudiantes', label: 'Estudiantes', icon: Users },
                            { id: 'calificaciones', label: 'Calificaciones', icon: GraduationCap },
                            { id: 'clases', label: 'Historial de Clases', icon: Calendar },
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
                            La lista de estudiantes con calificaciones por materia está en desarrollo.
                            <br />
                            Puedes ver todos los estudiantes de la sección desde la pestaña principal.
                        </p>
                        <Link
                            href={`/dashboard/academico/${cycleId}/secciones/${sectionId}`}
                            className="mt-4 inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                        >
                            Ver sección completa
                        </Link>
                    </div>
                )}

                {/* Placeholder for other tabs */}
                {(activeTab === 'calificaciones' || activeTab === 'clases' || activeTab === 'observaciones') && (
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
