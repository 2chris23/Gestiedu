'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';
import { useQuery } from '@tanstack/react-query';
import { instituteService } from '@/services/institute.service';
import { useStudents, useAvailableStudents, useAssignStudent } from '@/hooks/useStudents';
import { useClassroomBySlug, useClassroomStats } from '@/hooks/useClassrooms';
import { useClassroomSubjects, useClassroomSubjectsStats } from '@/hooks/useClassroomSubjects';
import { SectionStudent } from '@/services/students.service';
import { API_URL } from '@/config/env';
import { useClassroomSchedule, transformScheduleData } from '@/hooks/useSchedules';
import { toast } from 'sonner';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import { getAcademicRisk } from '@/utils/academicRisk';
import { useRouter } from 'next/navigation';

/** Lo que SectionPage sabe y hace; su JSX vive en el componente. */
export function useLaSeccion({ params }: { params: Promise<{ cycleId: string, sectionId: string }> }) {
    const { cycleId, sectionId } = use(params);
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('estudiantes');
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
    const [selectedStudentForObs, setSelectedStudentForObs] = useState<any | null>(null);

    const targetYearId = classroom?.academicYearId || classroom?.academicYear?.id;

    const debouncedSearchAvailable = useDebouncedValue(searchAvailableTerm, 350);
    const { yo } = useQuienSoy();
    // Las pestañas del guía (y del admin): las pendientes de sus alumnos y la
    // labor social, si el liceo la lleva y este grado la hace.
    const esGuiaOAdmin = yo?.role === 'ADMIN' || (yo?.role === 'TEACHER' && ((classroom as any)?.teacherId ?? (classroom?.teacher as any)?.id) === yo?.id);
    const { data: reglasDelLiceo } = useQuery({
        queryKey: ['reglas-academicas'],
        queryFn: () => instituteService.getAcademicConfig(),
        enabled: esGuiaOAdmin,
        staleTime: 5 * 60_000,
    });
    const conLaborSocial =
        esGuiaOAdmin && !!reglasDelLiceo?.laborSocial?.activa && !!classroom?.grade && reglasDelLiceo.laborSocial.grados.includes(classroom.grade);
    // La lista de alumnos sin sección (para inscribir) es del admin: el
    // profesor recibía nombres y correos de alumnos que no son suyos.
    const { data: availableStudentsData, isLoading: isLoadingAvailable } = useAvailableStudents(
        debouncedSearchAvailable,
        targetYearId,
        yo?.role === 'ADMIN'
    );

    const students = studentsData?.students || studentsData?.users || [];
    const pagination = studentsData?.pagination;
    const availableStudents = availableStudentsData || [];

    // Obtener horario de la sección
    const { data: scheduleData } = useClassroomSchedule(classroomId || '');
    const scheduleBlocks = transformScheduleData(scheduleData);

    const filteredStudents = useMemo(() => {
        if (!searchTerm) return students;
        const search = searchTerm.toLowerCase();
        return students.filter((student: SectionStudent) => (
            student.firstName?.toLowerCase().includes(search) ||
            student.lastName?.toLowerCase().includes(search) ||
            student.id?.toLowerCase().includes(search) ||
            student.studentCode?.toLowerCase().includes(search)
        ));
    }, [students, searchTerm]);

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

    return {
        cycleId,
        sectionId,
        router,
        activeTab,
        setActiveTab,
        page,
        setPage,
        isAssignTeacherModalOpen,
        setIsAssignTeacherModalOpen,
        classroom,
        classroomId,
        lapsoId,
        setLapsoId,
        academicConfig,
        passingGrade,
        isLoading,
        classroomStats,
        subjectsWithStats,
        isLoadingSubjectsStats,
        isAddStudentModalOpen,
        setIsAddStudentModalOpen,
        selectedStudentIds,
        searchAvailableTerm,
        setSearchAvailableTerm,
        searchTerm,
        setSearchTerm,
        sortColumn,
        sortDirection,
        removeModalOpen,
        setRemoveModalOpen,
        studentToRemove,
        setStudentToRemove,
        selectedStudentForObs,
        setSelectedStudentForObs,
        yo,
        esGuiaOAdmin,
        conLaborSocial,
        isLoadingAvailable,
        pagination,
        scheduleBlocks,
        sortedStudents,
        handleSort,
        handleOpenAddModal,
        toggleStudentSelection,
        handleAssignStudents,
        handleRemoveStudent,
        filteredAvailable,
    };
}
