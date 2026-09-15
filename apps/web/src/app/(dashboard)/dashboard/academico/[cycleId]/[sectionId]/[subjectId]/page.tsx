'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Users, BookOpen, GraduationCap, Calendar,
    Bell, Search, Plus, MoreVertical, TrendingUp, Clock,
    FileText, CheckCircle, AlertTriangle, MapPin, Settings,
    ChevronRight, Home, UserCircle, ArrowUpDown, ArrowUp, ArrowDown,
    ListTodo
} from 'lucide-react';
import { useClassroomBySlug } from '@/hooks/useClassrooms';
import { useClassroomSubjectDetail, useClassroomSubjectsStats } from '@/hooks/useClassroomSubjects';
import AcademicStats from '@/components/academic/AcademicStats';
import { AssignSubjectTeacherModal } from '@/components/subject/AssignSubjectTeacherModal';
import { useStudents } from '@/hooks/useStudents';
import { SectionStudent } from '@/services/students.service';
import { Pagination } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import EvaluationPlanSection from '@/components/evaluation/EvaluationPlanSection';
import CalendarDayView from '@/components/evaluation/CalendarDayView';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import { getAcademicRisk } from '@/utils/academicRisk';
import SubjectActivitiesTab from '@/components/subject/SubjectActivitiesTab';
import SubjectObservationsTab from '@/components/subject/SubjectObservationsTab';
import StudentObservationsModal from '@/components/observations/StudentObservationsModal';
import LapsoSelector from '@/components/academic/LapsoSelector';
import SubjectScheduleSection from '@/components/schedule/SubjectScheduleSection';

const DAY_ABBR: Record<number, string> = {
    0: 'Dom',
    1: 'Lun',
    2: 'Mar',
    3: 'Mié',
    4: 'Jue',
    5: 'Vie',
    6: 'Sáb',
};

const SCHEDULE_COLORS = ['#4F46E5', '#7C3AED', '#0891B2', '#059669', '#D97706'];

export default function SectionSubjectDashboard() {
    const params = useParams();
    const { cycleId, sectionId, subjectId } = params as { cycleId: string; sectionId: string; subjectId: string };
    const [activeTab, setActiveTab] = useState('estudiantes');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedLapso, setSelectedLapso] = useState('1');
    const [selectedStudentForObs, setSelectedStudentForObs] = useState<any | null>(null);
    
    // Filtro por lapso/momento (undefined = "Todo el ciclo")
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);

    // Paginación y ordenamiento
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

    // Obtener detalle de materia real
    const { data: classroomSubject, isLoading: isLoadingSubject } = useClassroomSubjectDetail(classroomId, subjectId);
    const realSubjectId = classroomSubject?.subject?.id || classroomSubject?.subjectId;

    // Obtener estudiantes filtrados por lapso y materia específica
    const { data: studentsData, isLoading: isLoadingStudents } = useStudents(classroomId || '', {
        page,
        limit,
        periodId: lapsoId,
        subjectId: realSubjectId
    });
    const students = studentsData?.students || studentsData?.users || [];
    const pagination = studentsData?.pagination;
    
    const { user } = useAuthStore();

    // Obtener estadísticas de materias de la sección filtradas por lapso
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
            .map((s: SectionStudent) => s.average)
            .filter((a): a is number => a !== undefined && a !== null && !isNaN(a) && a > 0);

        const minScore = validAverages.length > 0 ? Math.min(...validAverages) : 0;
        const maxScore = validAverages.length > 0 ? Math.max(...validAverages) : 0;

        const calculatedAvg = validAverages.length > 0
            ? Math.round((validAverages.reduce((acc, curr) => acc + curr, 0) / validAverages.length) * 10) / 10
            : 0;

        const avg = currentSubjectStats?.stats?.average ?? calculatedAvg;
        const attendance = currentSubjectStats?.stats?.attendance ?? 0;
        const localAtRisk = students.filter((s: SectionStudent) => typeof s.average === 'number' && s.average > 0 && s.average < passingGrade).length;
        const atRisk = typeof currentSubjectStats?.stats?.atRiskStudents === 'number'
            ? currentSubjectStats.stats.atRiskStudents
            : localAtRisk;
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
    const schedule: any[] = scheduleBlocks.map((block: any, index: number) => ({
        id: block.id,
        day: DAY_ABBR[block.dayOfWeek] || 'Lun',
        startTime: block.startTime,
        endTime: block.endTime,
        subject: subject.name,
        subjectId: subject.id,
        classroom: block.location || '',
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
        let comparison = 0;

        switch (sortColumn) {
            case 'nombre': {
                const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
                const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
                comparison = aName.localeCompare(bName, 'es', { sensitivity: 'base' });
                break;
            }
            case 'cedula': {
                const aCode = (a.studentCode || a.id || '').toLowerCase();
                const bCode = (b.studentCode || b.id || '').toLowerCase();
                comparison = aCode.localeCompare(bCode, 'es', { numeric: true, sensitivity: 'base' });
                break;
            }
            case 'riesgo': {
                const getRiskWeight = (s: SectionStudent) => {
                    const risk = getAcademicRisk(s.average, passingGrade);
                    switch (risk.level) {
                        case 'ALTO': return 3;
                        case 'MEDIO': return 2;
                        case 'BAJO': return 1;
                        case 'SIN_CALIFICAR': return 0;
                        default: return 0;
                    }
                };
                const aRisk = getRiskWeight(a);
                const bRisk = getRiskWeight(b);
                comparison = aRisk - bRisk;
                if (comparison === 0) {
                    const aAvg = typeof a.average === 'number' && !isNaN(a.average) ? a.average : 0;
                    const bAvg = typeof b.average === 'number' && !isNaN(b.average) ? b.average : 0;
                    comparison = aAvg - bAvg;
                }
                break;
            }
            case 'promedio': {
                const aAvg = typeof a.average === 'number' && !isNaN(a.average) ? a.average : -1;
                const bAvg = typeof b.average === 'number' && !isNaN(b.average) ? b.average : -1;
                comparison = aAvg - bAvg;
                break;
            }
            case 'asistencia': {
                const aAtt = typeof a.attendancePercentage === 'number' && !isNaN(a.attendancePercentage) ? a.attendancePercentage : 0;
                const bAtt = typeof b.attendancePercentage === 'number' && !isNaN(b.attendancePercentage) ? b.attendancePercentage : 0;
                comparison = aAtt - bAtt;
                break;
            }
            case 'observaciones': {
                const aObs = typeof (a as any).observationsCount === 'number' && !isNaN((a as any).observationsCount) ? (a as any).observationsCount : 0;
                const bObs = typeof (b as any).observationsCount === 'number' && !isNaN((b as any).observationsCount) ? (b as any).observationsCount : 0;
                comparison = aObs - bObs;
                break;
            }
            default:
                return 0;
        }

        if (comparison === 0) {
            const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
            const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
            return aName.localeCompare(bName, 'es', { sensitivity: 'base' });
        }

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(column);
            setSortDirection(column === 'nombre' || column === 'cedula' ? 'asc' : 'desc');
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
                                    {periods.length > 0 && (
                                        <span className="ml-1">
                                            <LapsoSelector
                                                periods={periods}
                                                value={lapsoId}
                                                onChange={setLapsoId}
                                                compact
                                            />
                                        </span>
                                    )}
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
                {/* Estadísticas de la Materia (Ancho Completo como en Secciones) */}
                <div className="mb-6">
                    <AcademicStats
                        stats={subjectAcademicStats}
                        averageTitle="Promedio Materia"
                        riskSubtext="Alumnos con promedio < 10 pts"
                    />
                </div>

                {/* Horario en Vivo de la Materia */}
                <div className="mb-8">
                    <SubjectScheduleSection
                        schedule={schedule}
                        subject={subject}
                        role={user?.role === 'TEACHER' || user?.role === 'ADMIN' ? 'teacher' : 'student'}
                        showActions={true}
                        classroomId={classroomId}
                        editUrl={`/dashboard/horario/${cycleId}/${sectionId}`}
                    />
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8 overflow-x-auto">
                        {[
                            { id: 'estudiantes', label: 'Estudiantes', icon: Users },
                            { id: 'calificaciones', label: 'Plan de Evaluación / Calificaciones', icon: GraduationCap },
                            { id: 'actividades', label: 'Actividades', icon: ListTodo },
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
                                                    {(() => {
                                                        const risk = getAcademicRisk(student.average, passingGrade);
                                                        return (
                                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${risk.className}`}>
                                                                {risk.label}
                                                            </span>
                                                        );
                                                    })()}
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
                                                    {((student as any).observationsCount || 0) > 0 ? (
                                                        <button type="button" onClick={() => setSelectedStudentForObs(student)} className="text-indigo-600 hover:text-indigo-800 font-medium">
                                                            {(student as any).observationsCount} observacione(s)
                                                        </button>
                                                    ) : (
                                                        <button type="button" onClick={() => setSelectedStudentForObs(student)} className="text-gray-400 hover:text-gray-600 italic">
                                                            Agregar observación
                                                        </button>
                                                    )}
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

                {/* Actividades Tab */}
                {activeTab === 'actividades' && (
                    <SubjectActivitiesTab
                        classroomId={classroomId}
                        subjectId={subject.id}
                        cycleId={cycleId}
                        sectionId={sectionId}
                        totalStudents={studentCount || students.length}
                    />
                )}

                {/* Observaciones Tab */}
                {activeTab === 'observaciones' && (
                    <SubjectObservationsTab
                        classroomId={classroomId}
                        subjectId={subject.id}
                        periodId={lapsoId}
                        onPeriodChange={setLapsoId}
                        periods={periods}
                    />
                )}
            </main>

            {/* Modal de Detalle de Observaciones del Estudiante */}
            <StudentObservationsModal
                isOpen={Boolean(selectedStudentForObs)}
                onClose={() => setSelectedStudentForObs(null)}
                student={selectedStudentForObs}
            />

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
