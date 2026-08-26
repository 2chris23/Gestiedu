'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Users, BookOpen, GraduationCap, Calendar,
    Bell, Search, Plus, MoreVertical, TrendingUp, Clock,
    FileText, CheckCircle, AlertTriangle, MapPin, Settings,
    ChevronRight, Home, UserCircle, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { useClassroomBySlug } from '@/hooks/useClassrooms';
import { useClassroomSubjectDetail } from '@/hooks/useClassroomSubjects';
import { AssignSubjectTeacherModal } from '@/components/subject/AssignSubjectTeacherModal';
import { useStudents } from '@/hooks/useStudents';
import { SectionStudent } from '@/services/students.service';
import { Pagination } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import EvaluationPlanSection from '@/components/evaluation/EvaluationPlanSection';
import CalendarDayView from '@/components/evaluation/CalendarDayView';

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
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedLapso, setSelectedLapso] = useState('1');
    
    // Paginación y ordenamiento
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Resolver classroom por slug (con año para desambiguar entre ciclos con mismo slug base)
    const { data: classroom, isLoading: isLoadingClassroom } = useClassroomBySlug(sectionId, cycleId);
    const classroomId = classroom?.id || '';

    // Obtener detalle de materia real
    const { data: classroomSubject, isLoading: isLoadingSubject } = useClassroomSubjectDetail(classroomId, subjectId);

    // Obtener estudiantes
    const { data: studentsData, isLoading: isLoadingStudents } = useStudents(classroomId || '', { page, limit });
    const students = studentsData?.students || studentsData?.users || [];
    const pagination = studentsData?.pagination;
    
    const { user } = useAuthStore();

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
                        href={`/dashboard/academico/${cycleId}/${sectionId}`}
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

    const filteredStudents = students.filter((student: SectionStudent) => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            student.firstName?.toLowerCase().includes(search) ||
            student.lastName?.toLowerCase().includes(search) ||
            student.id?.toLowerCase().includes(search) ||
            student.studentCode?.toLowerCase().includes(search)
        );
    });

    const sortedStudents = [...filteredStudents].sort((a: SectionStudent, b: SectionStudent) => {
        if (!sortColumn) return 0;
        let aValue: string, bValue: string;

        switch (sortColumn) {
            case 'nombre':
                aValue = `${a.firstName} ${a.lastName}`.toLowerCase();
                bValue = `${b.firstName} ${b.lastName}`.toLowerCase();
                break;
            case 'cedula':
                aValue = a.id || '';
                bValue = b.id || '';
                break;
            default:
                return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
        return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 text-indigo-600" /> : <ArrowDown className="h-4 w-4 text-indigo-600" />;
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
                        <Link href={`/dashboard/academico/${cycleId}/${sectionId}`} className="hover:text-indigo-600">
                            {sectionName}
                        </Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="font-semibold text-gray-900">{subject.name}</span>
                    </nav>

                    {/* Title Row */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href={`/dashboard/academico/${cycleId}/${sectionId}`}
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

                            <button 
                                onClick={() => setIsAssignModalOpen(true)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
                            >
                                {teacher ? 'Cambiar' : 'Asignar'}
                            </button>

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
                    <div className="mb-8">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    <h2 className="font-semibold text-gray-900">Horario de Clases</h2>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    <nav className="-mb-px flex space-x-8 overflow-x-auto">
                        {[
                            { id: 'estudiantes', label: 'Estudiantes', icon: Users },
                            { id: 'calificaciones', label: 'Plan de Evaluación / Calificaciones', icon: GraduationCap },
                            { id: 'calendario', label: 'Calendario en Vivo', icon: Calendar },
                            { id: 'clases', label: 'Historial de Clases', icon: Clock },
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

                {/* Students Tab */}
                {activeTab === 'estudiantes' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="relative max-w-sm w-full">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                                    placeholder="Buscar alumno por nombre o cédula..."
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('nombre')}>
                                            <div className="flex items-center gap-2">Perfil <SortIcon column="nombre" /></div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('cedula')}>
                                            <div className="flex items-center gap-2">ID / Cédula <SortIcon column="cedula" /></div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('riesgo')}>
                                            <div className="flex items-center gap-2">Riesgo Académico <SortIcon column="riesgo" /></div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('promedio')}>
                                            <div className="flex items-center gap-2">Promedio <SortIcon column="promedio" /></div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('asistencia')}>
                                            <div className="flex items-center gap-2">Asistencia <SortIcon column="asistencia" /></div>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('observaciones')}>
                                            <div className="flex items-center gap-2">Observaciones <SortIcon column="observaciones" /></div>
                                        </th>
                                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {isLoadingStudents ? (
                                        <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-500">Cargando estudiantes...</td></tr>
                                    ) : sortedStudents.length === 0 ? (
                                        <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-500">{searchTerm ? 'No se encontraron estudiantes.' : 'No hay estudiantes inscritos.'}</td></tr>
                                    ) : (
                                        sortedStudents.map((student: SectionStudent) => (
                                            <tr key={student.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm bg-indigo-100 text-indigo-600">
                                                            {student.firstName?.[0]}{student.lastName?.[0]}
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-gray-900">{student.firstName} {student.lastName}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.studentCode || student.id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${student.average ? (student.average >= 14 ? 'bg-green-100 text-green-700' : student.average >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-600'}`}>
                                                        {student.average ? (student.average >= 14 ? 'Riesgo Bajo' : student.average >= 10 ? 'Riesgo Medio' : 'Riesgo Alto') : 'Sin Calificar'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {student.average ? (
                                                        <span className="px-2 py-0.5 inline-flex text-sm font-semibold rounded bg-indigo-50 text-indigo-700">{student.average.toFixed(1)}</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 inline-flex text-sm font-medium rounded bg-gray-100 text-gray-500">Sin calificar</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <span className="text-sm text-gray-900 mr-2">{student.attendancePercentage != null ? `${student.attendancePercentage}%` : '0%'}</span>
                                                        <div className="w-16 h-1.5 bg-gray-200 rounded-full">
                                                            <div className={`h-1.5 rounded-full ${(student.attendancePercentage || 0) >= 80 ? 'bg-green-500' : (student.attendancePercentage || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(student.attendancePercentage || 0, 100)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <span className="text-xs text-gray-400 italic">Sin observaciones</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200">
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {pagination && pagination.totalPages > 1 && (
                            <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
                        )}
                    </div>
                )}

                {/* Calificaciones / Evaluation Plan Tab */}
                {activeTab === 'calificaciones' && (
                    <div className="space-y-4">
                        {/* Lapso Selector */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide shrink-0">Momento:</span>
                            <div className="flex gap-2">
                                {[
                                    { id: '1', label: '1er Momento', color: 'from-blue-500 to-indigo-600' },
                                    { id: '2', label: '2do Momento', color: 'from-violet-500 to-purple-600' },
                                    { id: '3', label: '3er Momento', color: 'from-amber-500 to-orange-600' },
                                ].map(l => (
                                    <button
                                        key={l.id}
                                        onClick={() => setSelectedLapso(l.id)}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                            selectedLapso === l.id
                                                ? `bg-gradient-to-r ${l.color} text-white shadow-md`
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {l.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <EvaluationPlanSection
                            classroomId={classroomId}
                            subjectId={subject.id}
                            lapso={selectedLapso}
                            canEdit={user?.role === 'ADMIN' || user?.role === 'TEACHER'}
                        />
                    </div>
                )}

                {/* Calendario en Vivo Tab */}
                {activeTab === 'calendario' && (
                    <CalendarDayView classroomId={classroomId} />
                )}

                {/* Placeholder for other tabs */}
                {(activeTab === 'clases' || activeTab === 'observaciones') && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Próximamente</h3>
                        <p className="text-gray-500">Esta sección está en desarrollo.</p>
                    </div>
                )}
            </main>

            {isAssignModalOpen && classroomId && (
                <AssignSubjectTeacherModal
                    sectionId={classroomId}
                    sectionName={sectionName}
                    subjectSlug={subjectId}
                    currentTeacherId={teacher?.id}
                    onClose={() => setIsAssignModalOpen(false)}
                />
            )}
        </div>
    );
}
