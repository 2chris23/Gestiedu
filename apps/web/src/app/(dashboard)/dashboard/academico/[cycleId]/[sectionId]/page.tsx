'use client';

import { useState, useEffect, useRef, use } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';
import {
    ChevronLeft, Calendar, Clock,
    BookOpen, Users, GraduationCap, Bell, Search,
    Filter, UserPlus, Trash2,
    CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { useStudents, useAvailableStudents, useAssignStudent } from '@/hooks/useStudents';
import { useClassroomBySlug, useClassroomStats } from '@/hooks/useClassrooms';
import AcademicStats from '@/components/academic/AcademicStats';
import { useClassroomSubjects, useClassroomSubjectsStats } from '@/hooks/useClassroomSubjects';
import { SectionStudent } from '@/services/students.service';
import { API_URL } from '@/config/env';
import { useClassroomSchedule, transformScheduleData } from '@/hooks/useSchedules';
import ClassroomScheduleEditor from '@/components/schedule/ClassroomScheduleEditor';
import { Pagination } from '@/components/ui';
import { toast } from 'sonner';
import RemoveStudentSecureModal from '@/components/academic/RemoveStudentSecureModal';
import AssignTeacherModal from '@/components/academic/AssignTeacherModal';
import { AssignSubjectModal } from '@/components/academic/AssignSubjectModal';
import { SubjectCard } from '@/components/academic/SubjectCard';
import { useAuthStore } from '@/store/auth.store';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import EvaluationPlanSection from '@/components/evaluation/EvaluationPlanSection';
import LapsoSelector from '@/components/academic/LapsoSelector'; // Fase 3.5 — filtro por lapso
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import { getAcademicRisk } from '@/utils/academicRisk';
import SectionObservationsTab from '@/components/classroom/SectionObservationsTab';
import StudentObservationsModal from '@/components/observations/StudentObservationsModal';
import { useRouter } from 'next/navigation';
import UserAvatar from '@/components/ui/UserAvatar';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';

// Params refactored: year -> cycleId, slug -> sectionId
export default function SectionPage({ params }: { params: Promise<{ cycleId: string, sectionId: string }> }) {
    const { cycleId, sectionId } = use(params);
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('estudiantes');
    const [selectedLapso, setSelectedLapso] = useState('1');
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [isAssignTeacherModalOpen, setIsAssignTeacherModalOpen] = useState(false);

    // Use slug-based hook instead of ID-based, using sectionId which maps to slug
    // Pasamos cycleId (nombre o id del año) para desambiguar entre años con mismo slug base
    const { data: classroom } = useClassroomBySlug(sectionId, cycleId);
    const classroomId = classroom?.id;

    // Fase 3.5 — filtro por lapso/momento (undefined = "Todo el ciclo")
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);

    const { data: academicConfig } = useAcademicConfig();
    const passingGrade = academicConfig?.notaMinimaAprobatoria ?? academicConfig?.passingGrade ?? 10;

    const { data: studentsData, isLoading } = useStudents(classroomId || '', { page, limit, periodId: lapsoId });
    const { data: classroomStats } = useClassroomStats(classroomId || sectionId, lapsoId);
    const { data: subjectsData, isLoading: isLoadingSubjects } = useClassroomSubjects(classroomId || '');
    const { data: subjectsWithStats, isLoading: isLoadingSubjectsStats, refetch: refetchSubjects } =
        useClassroomSubjectsStats(classroomId || '', lapsoId);
    const assignMutation = useAssignStudent();

    const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [searchAvailableTerm, setSearchAvailableTerm] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [removeModalOpen, setRemoveModalOpen] = useState(false);
    const [studentToRemove, setStudentToRemove] = useState<{ id: string; name: string } | null>(null);

    // Subject assignment state
    const [isAssignSubjectModalOpen, setIsAssignSubjectModalOpen] = useState(false);
    const [selectedStudentForObs, setSelectedStudentForObs] = useState<any | null>(null);


    const targetYearId = classroom?.academicYearId || classroom?.academicYear?.id;

    const { data: availableStudentsData, isLoading: isLoadingAvailable } = useAvailableStudents(
        searchAvailableTerm,
        targetYearId
    );

    const students = studentsData?.students || studentsData?.users || [];
    const pagination = studentsData?.pagination;
    const availableStudents = availableStudentsData || [];

    // Obtener horario de la sección
    const { data: scheduleData } = useClassroomSchedule(classroomId || '');
    const scheduleBlocks = transformScheduleData(scheduleData);
    const { user } = useAuthStore();

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
                const aFailed = (a as any).failedSubjectsCount || 0;
                const bFailed = (b as any).failedSubjectsCount || 0;
                if (aFailed !== bFailed) {
                    comparison = aFailed - bFailed;
                    break;
                }
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

    // Load subject statistics when Materias tab is active
    // Load subjects when switching to materias tab
    useEffect(() => {
        if (activeTab === 'materias') {
            refetchSubjects();
        }
    }, [activeTab, refetchSubjects]);

    const handleSubjectAssignSuccess = () => {
        refetchSubjects();
        toast.success('Materias asignadas exitosamente');
    };

    const handleOpenAddModal = () => {
        setIsAddStudentModalOpen(true);
    };

    const toggleStudentSelection = (studentId: string) => {
        setSelectedStudentIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(studentId)) {
                newSet.delete(studentId);
            } else {
                newSet.add(studentId);
            }
            return newSet;
        });
    };

    const handleAssignStudents = async () => {
        if (selectedStudentIds.size === 0 || !classroomId) return;
        let successCount = 0;
        let errorCount = 0;

        for (const studentId of Array.from(selectedStudentIds)) {
            try {
                await assignMutation.mutateAsync({ studentId, sectionId: classroomId });
                successCount++;
            } catch (error) {
                errorCount++;
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} estudiante${successCount > 1 ? 's' : ''} agregado${successCount > 1 ? 's' : ''}`);
        }
        if (errorCount > 0) {
            toast.error(`${errorCount} estudiante${errorCount > 1 ? 's' : ''} no pudo${errorCount > 1 ? 'ieron' : ''} ser agregado${errorCount > 1 ? 's' : ''}`);
        }

        if (successCount > 0) {
            setIsAddStudentModalOpen(false);
            setSelectedStudentIds(new Set());
        }
    };

    const handleRemoveStudent = async (password: string) => {
        if (!studentToRemove || !classroomId) return;

        try {
            // La credencial ya no está en las cookies: vive en la memoria de
            // la pestaña. Ver `lib/credencial-en-memoria.ts`.
            const token = await conseguirCredencial();
            if (!token) {
                throw new Error('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
            }

            const url = `${API_URL}/classrooms/${classroomId}/students/${studentToRemove.id}`;
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    if (data.code === 'INVALID_PASSWORD') {
                        throw new Error('Contraseña incorrecta');
                    }
                    throw new Error('Token inválido o sesión expirada');
                }
                throw new Error(data.error || 'Error al eliminar estudiante');
            }

            toast.success(`${studentToRemove.name} ha sido eliminado de la sección`);
            setRemoveModalOpen(false);
            setStudentToRemove(null);
            window.location.reload();
        } catch (error) {
            console.error('Error al eliminar estudiante:', error);
            throw error;
        }
    };

    const filteredAvailable = availableStudents.filter((s) =>
        s.firstName.toLowerCase().includes(searchAvailableTerm.toLowerCase()) ||
        s.lastName.toLowerCase().includes(searchAvailableTerm.toLowerCase()) ||
        (s.studentCode && s.studentCode.includes(searchAvailableTerm))
    );

    // Show loading state while classroom data is being fetched
    if (!classroom) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="mt-4 text-gray-600">Cargando sección...</p>
                </div>
            </div>
        );
    }

    return (
        /*
            SIN CAJA GRIS PROPIA

            La página iba metida en una caja de otro gris (#F3F4F6) con 24 px
            de margen, dentro del fondo del panel, que es otro: en el teléfono
            se veía un rectángulo de otro color con un marco claro alrededor.
            Ahora usa el fondo y el margen del panel, como las demás.
        */
        <div className="space-y-5 text-slate-800">
            <header className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                    <Link href={`/dashboard/academico/${cycleId}`} className="hover:text-indigo-600 flex items-center gap-1">
                        <ChevronLeft className="w-4 h-4" /> Volver
                    </Link>
                    <span>/</span>
                    <span>{classroom?.academicYear?.name || cycleId}</span>
                    <span>/</span>
                    <span className="font-semibold text-gray-700">{classroom?.name || 'Sección...'}</span>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                            {classroom ? `${classroom.name}` : 'Cargando...'}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-gray-500">
                            <span className="flex items-center gap-1 text-sm">
                                <Users className="w-4 h-4" /> {students.length} Estudiantes
                            </span>
                            <span className="ml-2">
                                <LapsoSelector
                                    periods={((classroom as any)?.academicYear?.periods || []).map((p: any) => ({ id: p.id, name: p.name }))}
                                    value={lapsoId}
                                    onChange={setLapsoId}
                                    compact
                                />
                            </span>
                        </div>
                    </div>

                    {/* Tarjeta del Profesor Guía - Inline.
                        `min-w-[400px]` en una pantalla de 390 px hace exactamente
                        lo que dice: sacar la pantalla de ancho. Solo se exige
                        cuando hay sitio. */}
                    <div className="w-full rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:w-auto sm:min-w-[400px]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {classroom?.teacher ? (
                                    <>
                                        {/* Avatar del profesor */}
                                        <div className="relative">
                                            <UserAvatar
                                                name={`${classroom.teacher.firstName} ${classroom.teacher.lastName}`}
                                                src={(classroom.teacher as any).avatar}
                                                className="h-12 w-12 shadow-md"
                                                initialsClassName="text-sm"
                                            />
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                                        </div>

                                        {/* Información del profesor */}
                                        <div>
                                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Profesor Guía</p>
                                            <h3 className="text-sm font-bold text-gray-900">
                                                {classroom.teacher.firstName} {classroom.teacher.lastName}
                                            </h3>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Estado sin profesor */}
                                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                                            <GraduationCap className="w-6 h-6 text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Profesor Guía</p>
                                            <h3 className="text-sm font-semibold text-gray-700">Sin profesor asignado</h3>
                                            <p className="text-xs text-gray-500">Asigna un profesor guía</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Botón de acción */}
                            <button
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                                onClick={() => setIsAssignTeacherModalOpen(true)}
                            >
                                <UserPlus className="w-3.5 h-3.5" />
                                {classroom?.teacher ? 'Cambiar' : 'Asignar'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Estadísticas Académicas de la Sección */}
                <div>
                    <AcademicStats stats={classroomStats} averageTitle="Promedio Sección" />
                </div>
            </header>

            {/* Vista Rápida del Horario */}
            <div className="relative">
                <StudentScheduleSection
                    schedule={scheduleBlocks}
                    role={user?.role === 'TEACHER' || user?.role === 'ADMIN' ? 'teacher' : 'student'}
                    showActions={true}
                    classroomId={classroomId}
                    editUrl={`/dashboard/horario/${cycleId}/${sectionId}`}
                    titulo={classroom?.name ? `Horario · ${classroom.name}` : 'Horario de la sección'}
                />
            </div>

            <main>
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex flex-wrap gap-x-6">
                        {[
                            { id: 'estudiantes', label: 'Estudiantes', icon: Users },
                            { id: 'materias', label: 'Materias', icon: BookOpen },
                            { id: 'calificaciones', label: 'Calificaciones', icon: GraduationCap },
                            { id: 'observaciones', label: 'Observaciones', icon: Bell },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${isActive ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                                >
                                    <Icon className={`-ml-0.5 mr-2 h-5 w-5 ${isActive ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

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
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleOpenAddModal}
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <UserPlus className="-ml-1 mr-2 h-4 w-4" />
                                    Nuevo Estudiante
                                </button>
                            </div>
                        </div>

                        {/*
                            LA LISTA DE ALUMNOS, SIN ARRASTRAR

                            Eran siete columnas con `whitespace-nowrap` dentro
                            de un `overflow-x-auto`: 785 px de tabla en una
                            pantalla de 390. El profesor tenía que arrastrar de
                            lado, y al llegar a la nota ya no sabía de qué
                            alumno era. Ordenar tampoco se podía: se ordenaba
                            pulsando la cabecera, y en el teléfono la cabecera
                            estaba fuera de la pantalla.

                            Luego cada alumno fue una tarjeta con todo lo suyo:
                            330 px de alto, dos alumnos por pantalla. Ahora es
                            UNA FILA por alumno (`compacta`): nombre y cédula, y
                            al lado riesgo (solo el número de materias),
                            promedio y asistencia, con su cabecera para
                            ordenar. Lo demás está en su ficha, a un toque. En
                            pantalla ancha sigue siendo la tabla de siempre.
                        */}
                        <div className="p-3 sm:p-5">
                            <TablaAdaptable<SectionStudent>
                                compacta
                                datos={sortedStudents}
                                cargando={isLoading}
                                clave={(a) => a.id}
                                alPulsar={(a) => router.push(`/dashboard/usuarios/${a.id}`)}
                                orden={sortColumn ? { por: sortColumn, hacia: sortDirection } : null}
                                alOrdenar={handleSort}
                                vacio={
                                    <p className="text-cuerpo text-tinta-suave">
                                        {searchTerm ? 'No se encontraron estudiantes.' : 'No hay estudiantes inscritos.'}
                                    </p>
                                }
                                columnas={[
                                    {
                                        id: 'nombre',
                                        titulo: 'Perfil',
                                        tituloCorto: 'Nombre',
                                        principal: true,
                                        ordenable: true,
                                        celdaCompacta: (a) => {
                                            const obs = (a as any).observationsCount || 0;
                                            return (
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <UserAvatar
                                                        name={`${a.firstName} ${a.lastName}`}
                                                        src={(a as any).avatar}
                                                        className="h-8 w-8 shrink-0"
                                                        initialsClassName="text-xs"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium leading-5 text-gray-900">
                                                            {a.firstName} {a.lastName}
                                                        </p>
                                                        <p className="truncate text-xs text-gray-500">
                                                            <span className="font-mono">{a.studentCode || a.id}</span>
                                                            {obs > 0 && <span className="font-semibold text-amber-700"> · {obs} obs</span>}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        },
                                        celda: (a) => (
                                            <div className="flex items-center gap-3">
                                                <UserAvatar
                                                    name={`${a.firstName} ${a.lastName}`}
                                                    src={(a as any).avatar}
                                                    className="h-10 w-10 shrink-0"
                                                    initialsClassName="text-sm"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-gray-900">
                                                        {a.firstName} {a.lastName}
                                                    </p>
                                                    {/* La cédula, debajo del nombre: en la tarjeta
                                                        ahorra una línea entera. En la tabla ancha
                                                        tiene su propia columna. */}
                                                    <p className="truncate font-mono text-xs text-gray-500 @2xl:hidden">
                                                        {a.studentCode || a.id}
                                                    </p>
                                                </div>
                                            </div>
                                        ),
                                    },
                                    {
                                        id: 'cedula',
                                        titulo: 'ID / Cédula',
                                        ordenable: true,
                                        soloAncha: true,
                                        celda: (a) => (
                                            <span className="font-mono text-sm text-gray-500">{a.studentCode || a.id}</span>
                                        ),
                                    },
                                    {
                                        id: 'riesgo',
                                        titulo: 'Riesgo',
                                        ordenable: true,
                                        // Solo el número de materias por debajo de la
                                        // nota mínima: «Riesgo alto (2 < 10)» no cabía.
                                        compacta: {
                                            ancho: 'w-12',
                                            celda: (a) => {
                                                const n = (a as any).failedSubjectsCount || 0;
                                                return n > 0 ? (
                                                    <span
                                                        className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-50 px-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200"
                                                        title={`${n} ${n === 1 ? 'materia' : 'materias'} por debajo de ${passingGrade}`}
                                                    >
                                                        {n}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-semibold text-emerald-700" title="Ninguna materia en riesgo">
                                                        0
                                                    </span>
                                                );
                                            },
                                        },
                                        celda: (a) => {
                                            const failedCount = (a as any).failedSubjectsCount || 0;
                                            if (failedCount > 0) {
                                                return (
                                                    <span
                                                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
                                                        title={`${failedCount} ${failedCount === 1 ? 'materia con calificación menor a' : 'materias con calificación menor a'} ${passingGrade} pts`}
                                                    >
                                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                                        Riesgo Alto ({failedCount} &lt; 10)
                                                    </span>
                                                );
                                            }
                                            const risk = getAcademicRisk(a.average, passingGrade);
                                            return (
                                                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${risk.className}`}>
                                                    {risk.label}
                                                </span>
                                            );
                                        },
                                    },
                                    {
                                        id: 'promedio',
                                        titulo: 'Promedio',
                                        ordenable: true,
                                        alinear: 'derecha',
                                        compacta: {
                                            ancho: 'w-12',
                                            titulo: 'Prom.',
                                            celda: (a) =>
                                                a.average ? (
                                                    <span
                                                        className={`text-sm font-bold tabular-nums ${a.average < passingGrade ? 'text-red-600' : 'text-indigo-700'}`}
                                                    >
                                                        {a.average.toFixed(1)}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-500">—</span>
                                                ),
                                        },
                                        celda: (a) =>
                                            a.average ? (
                                                <span className="inline-flex rounded bg-indigo-50 px-2 py-0.5 text-sm font-semibold text-indigo-700">
                                                    {a.average.toFixed(1)}
                                                </span>
                                            ) : (
                                                <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-sm font-medium text-gray-500">
                                                    Sin calificar
                                                </span>
                                            ),
                                    },
                                    {
                                        id: 'asistencia',
                                        titulo: 'Asistencia',
                                        ordenable: true,
                                        alinear: 'derecha',
                                        compacta: {
                                            ancho: 'w-14',
                                            titulo: 'Asist.',
                                            celda: (a) => {
                                                const pct = a.attendancePercentage ?? 0;
                                                const minima = academicConfig?.asistenciaMinima ?? 80;
                                                return (
                                                    <span className="flex w-full flex-col items-center gap-1">
                                                        <span className="text-xs font-semibold tabular-nums text-gray-900">{pct}%</span>
                                                        <span className="h-1 w-10 rounded-full bg-gray-200">
                                                            <span
                                                                className={`block h-1 rounded-full ${pct >= minima ? 'bg-green-500' : pct >= minima - 10 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                                            />
                                                        </span>
                                                    </span>
                                                );
                                            },
                                        },
                                        celda: (a) => (
                                            <span className="inline-flex items-center gap-2">
                                                <span className="text-sm text-gray-900">
                                                    {a.attendancePercentage != null ? `${a.attendancePercentage}%` : '0%'}
                                                </span>
                                                <span className="h-1.5 w-16 rounded-full bg-gray-200">
                                                    <span
                                                        className={`block h-1.5 rounded-full ${(a.attendancePercentage || 0) >= 80 ? 'bg-green-500' : (a.attendancePercentage || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${Math.min(a.attendancePercentage || 0, 100)}%` }}
                                                    />
                                                </span>
                                            </span>
                                        ),
                                    },
                                    {
                                        id: 'observaciones',
                                        titulo: 'Observaciones',
                                        tituloCorto: 'Obs.',
                                        ordenable: true,
                                        celda: (a) => (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedStudentForObs(a);
                                                }}
                                                className={
                                                    ((a as any).observationsCount || 0) > 0
                                                        ? 'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800'
                                                        : 'inline-flex min-h-[44px] items-center px-1 text-xs italic text-gray-500'
                                                }
                                            >
                                                {((a as any).observationsCount || 0) > 0 ? (
                                                    <>
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                        {(a as any).observationsCount} obs
                                                    </>
                                                ) : (
                                                    'Sin observaciones'
                                                )}
                                            </button>
                                        ),
                                    },
                                    {
                                        id: 'acciones',
                                        titulo: 'Acciones',
                                        acciones: true,
                                        alinear: 'derecha',
                                        celda: (a) => (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setStudentToRemove({ id: a.id, name: `${a.firstName} ${a.lastName}` });
                                                    setRemoveModalOpen(true);
                                                }}
                                                title="Sacar de la sección"
                                                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Sacar de la sección</span>
                                            </button>
                                        ),
                                    },
                                ]}
                            />
                        </div>



                        {pagination && pagination.totalPages > 1 && (
                            <Pagination currentPage={page} totalPages={pagination.totalPages} onPageChange={setPage} />
                        )}
                    </div>
                )}

                {/* Materias Tab */}
                {activeTab === 'materias' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Materias Asignadas</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {subjectsWithStats?.length || 0} materia{(subjectsWithStats?.length || 0) !== 1 ? 's' : ''} asignada{(subjectsWithStats?.length || 0) !== 1 ? 's' : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsAssignSubjectModalOpen(true)}
                                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                            >
                                <BookOpen className="w-4 h-4 mr-2" />
                                Asignar Materia
                            </button>
                        </div>

                        <div className="p-6">
                            {isLoadingSubjectsStats ? (
                                <div className="text-center py-12">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                    <p className="mt-4 text-gray-500">Cargando materias...</p>
                                </div>
                            ) : !subjectsWithStats || subjectsWithStats.length === 0 ? (
                                <div className="text-center py-12">
                                    <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">No hay materias asignadas</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Comienza asignando materias a esta sección
                                    </p>
                                    <div className="mt-6">
                                        <button
                                            onClick={() => setIsAssignSubjectModalOpen(true)}
                                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            <BookOpen className="w-4 h-4 mr-2" />
                                            Asignar Primera Materia
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {subjectsWithStats?.map((subject) => (
                                        <SubjectCard
                                            key={subject.id}
                                            id={subject.id}
                                            name={subject.name}
                                            color={subject.color}
                                            code={subject.code}
                                            stats={subject.stats}
                                            teacher={subject.teacher || undefined}
                                            hoursPerWeek={subject.hoursPerWeek}
                                            sectionHref={`/dashboard/academico/${cycleId}/${sectionId}/${(subject as any).slug || subject.id}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Calificaciones Tab */}
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

                        {/* Subject Selector for Evaluation */}
                        {subjectsWithStats && subjectsWithStats.length > 0 ? (
                            <>
                                {subjectsWithStats.map((subject) => (
                                    <div key={subject.id} id={`eval-${subject.id}`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color || '#6366f1' }} />
                                            <h3 className="text-sm font-bold text-gray-700">{subject.name}</h3>
                                        </div>
                                        <EvaluationPlanSection
                                            classroomId={classroomId || ''}
                                            subjectId={subject.id}
                                            lapso={selectedLapso}
                                            canEdit={user?.role === 'ADMIN' || user?.role === 'TEACHER'}
                                        />
                                    </div>
                                ))}
                            </>
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                                <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-base font-bold text-gray-800 mb-1">Sin materias asignadas</h3>
                                <p className="text-sm text-gray-500">
                                    Primero asigna materias a esta sección para crear evaluaciones.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Observaciones Tab */}
                {activeTab === 'observaciones' && (
                    <SectionObservationsTab classroomId={classroomId || ''} />
                )}
            </main>

            {isAddStudentModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setIsAddStudentModalOpen(false)} role="button" tabIndex={0} onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setIsAddStudentModalOpen(false);
                            }
                        }}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <UserPlus className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900">Agregar Estudiantes</h3>
                                        <div className="mt-2 text-sm text-gray-500">
                                            <p>Selecciona uno o varios estudiantes para agregarlos a esta sección.</p>
                                            {selectedStudentIds.size > 0 && (
                                                <p className="mt-1 font-medium text-indigo-600">{selectedStudentIds.size} seleccionado{selectedStudentIds.size > 1 ? 's' : ''}</p>
                                            )}
                                        </div>
                                        <div className="mt-4">
                                            <div className="relative rounded-md shadow-sm">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search className="h-5 w-5 text-gray-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                                                    placeholder="Buscar por nombre o código..."
                                                    value={searchAvailableTerm}
                                                    onChange={(e) => setSearchAvailableTerm(e.target.value)}
                                                />
                                            </div>
                                            <div className="mt-4 max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                                                {isLoadingAvailable ? (
                                                    <div className="p-4 text-center text-gray-500 text-sm">Cargando...</div>
                                                ) : filteredAvailable.length === 0 ? (
                                                    <div className="p-4 text-center text-gray-500 text-sm">No hay estudiantes disponibles.</div>
                                                ) : (
                                                    <div className="divide-y divide-gray-200">
                                                        {filteredAvailable.map((s) => {
                                                            const isSelected = selectedStudentIds.has(s.id);
                                                            return (
                                                                <div
                                                                    key={s.id}
                                                                    className={`p-3 hover:bg-gray-50 cursor-pointer flex items-center ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}
                                                                    onClick={() => toggleStudentSelection(s.id)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault();
                                                                            toggleStudentSelection(s.id);
                                                                        }
                                                                    }}
                                                                >
                                                                    <div className="flex items-center">
                                                                        <div className="mr-3">
                                                                            {isSelected ? <CheckCircle2 className="h-5 w-5 text-indigo-600" /> : <div className="h-5 w-5 rounded-full border-2 border-gray-300" />}
                                                                        </div>
                                                                        <UserAvatar
                                                                            name={`${s.firstName} ${s.lastName}`}
                                                                            src={(s as any).avatar}
                                                                            className="h-8 w-8 mr-3"
                                                                            initialsClassName="text-xs"
                                                                        />
                                                                        <div>
                                                                            <div className="text-sm font-medium text-gray-900">{s.firstName} {s.lastName}</div>
                                                                            <div className="text-xs text-gray-500">{s.studentCode || s.email}</div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm ${selectedStudentIds.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={handleAssignStudents}
                                    disabled={selectedStudentIds.size === 0}
                                >
                                    Agregar {selectedStudentIds.size > 0 ? `(${selectedStudentIds.size})` : ''}
                                </button>
                                <button
                                    type="button"
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={() => setIsAddStudentModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <RemoveStudentSecureModal
                isOpen={removeModalOpen}
                onClose={() => {
                    setRemoveModalOpen(false);
                    setStudentToRemove(null);
                }}
                studentId={studentToRemove?.id || null}
                studentName={studentToRemove?.name || ''}
                onConfirm={handleRemoveStudent}
            />

            <AssignTeacherModal
                isOpen={isAssignTeacherModalOpen}
                onClose={() => setIsAssignTeacherModalOpen(false)}
                classroomId={classroomId || ''}
                classroomName={classroom?.name || ''}
                currentTeacher={classroom?.teacher}
            />

            <AssignSubjectModal
                isOpen={isAssignSubjectModalOpen}
                onClose={() => setIsAssignSubjectModalOpen(false)}
                classroomId={classroomId || ''}
                onSuccess={handleSubjectAssignSuccess}
            />

            <StudentObservationsModal
                isOpen={Boolean(selectedStudentForObs)}
                onClose={() => setSelectedStudentForObs(null)}
                student={selectedStudentForObs}
            />
        </div>
    );
}
