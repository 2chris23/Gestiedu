'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import UserAvatar from '@/components/ui/UserAvatar';
import Link from 'next/link';
import {
    ArrowLeft,
    Users,
    BookOpen,
    GraduationCap,
    Bell,
    FileText,
    CheckCircle,
    ListTodo,
    ClipboardCheck,
} from 'lucide-react';
import { useClassroomBySlug } from '@/hooks/useClassrooms';
import { useClassroomSubjectDetail, useClassroomSubjectsStats } from '@/hooks/useClassroomSubjects';
import AcademicStats from '@/components/academic/AcademicStats';
import { useStudents } from '@/hooks/useStudents';
import { SectionStudent } from '@/services/students.service';
import { Pagination } from '@/components/ui';
import { useAcademicConfig } from '@/hooks/useAcademicConfig';
import { getAcademicRisk } from '@/utils/academicRisk';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';
import LapsoSelector from '@/components/academic/LapsoSelector';
import SubjectScheduleSection from '@/components/schedule/SubjectScheduleSection';
import { diferido } from '@/components/common/Diferido';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { BuscadorDeAlumnos, CabezaDeLaClase, ElegirMomento, PartesDeLaPantalla } from '@/components/academic/CabezaDeLaClase';

// Lo que se abre al pulsar baja al pulsarlo, no con la pantalla (carga diferida).
const EvaluationPlanSection = diferido(() => import('@/components/evaluation/EvaluationPlanSection'), { alto: 400 });
const SubjectActivitiesTab = diferido(() => import('@/components/subject/SubjectActivitiesTab'), { alto: 300 });
const SubjectObservationsTab = diferido(() => import('@/components/subject/SubjectObservationsTab'), { alto: 300 });
const RevisionDeLaMateria = diferido(() => import('@/components/subject/RevisionDeLaMateria'), { alto: 300 });
const ApreciacionesDeLaMateria = diferido(() => import('@/components/subject/ApreciacionesDeLaMateria'), { alto: 300 });
// Las materias pendientes que se trabajan en esta clase (las de este grado, que los alumnos arrastran).
const PendientesDeLaClase = diferido(() => import('@/components/pendientes/PendientesDeLaClase'), { alto: 300 });
const StudentObservationsModal = diferido(() => import('@/components/observations/StudentObservationsModal'), { sinEsqueleto: true });

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
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('estudiantes');
    const [searchTerm, setSearchTerm] = useState('');
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
    
    const { yo } = useQuienSoy();

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

        // Dos decimales y sin redondear los extremos: las mismas cifras que la
        // lista de alumnos y el resumen de la sección (MAPA §0).
        const calculatedAvg = validAverages.length > 0
            ? Math.round((validAverages.reduce((acc, curr) => acc + curr, 0) / validAverages.length) * 100) / 100
            : 0;

        const avg = currentSubjectStats?.stats?.average ?? calculatedAvg;
        const attendance = currentSubjectStats?.stats?.attendance ?? 0;
        const localAtRisk = students.filter((s: SectionStudent) => typeof s.average === 'number' && s.average > 0 && s.average < passingGrade).length;
        const atRisk = typeof currentSubjectStats?.stats?.atRiskStudents === 'number'
            ? currentSubjectStats.stats.atRiskStudents
            : localAtRisk;
        const obs = currentSubjectStats?.stats?.observations ?? 0;

        return {
            average: avg && avg > 0 ? avg : null,
            minAverage: minScore > 0 ? minScore : undefined,
            maxAverage: maxScore > 0 ? maxScore : undefined,
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

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <CabezaDeLaClase
                    volverA={`/dashboard/academico/${cycleId}/${sectionId}`}
                    rotuloVolver={`Volver a ${sectionName}`}
                    titulo={subject.name}
                    subtitulo={`${sectionName} · ${Number(hoursPerWeek).toLocaleString('es-VE')} h/sem`}
                    profesor={{
                        rotulo: 'Profesor',
                        nombre: teacher ? teacherName : null,
                        avatar: (teacher as any)?.avatar,
                        // El profesor se cambia en Profesores (Cristian, 18-oct-2026): ahí se ve su carga.
                        alCambiar: yo?.role === 'ADMIN' ? () => router.push(teacher?.id ? `/dashboard/profesores/${encodeURIComponent(teacher.id)}` : '/dashboard/profesores') : undefined,
                    }}
                >
                    {periods.length > 0 && <LapsoSelector periods={periods} value={lapsoId} onChange={setLapsoId} compact />}
                </CabezaDeLaClase>

            </div>

            <div>
                {/* Estadísticas de la Materia (Ancho Completo como en Secciones) */}
                <div className="mb-6">
                    <AcademicStats
                        stats={subjectAcademicStats}
                        averageTitle="Promedio Materia"
                        inicioDelLapso={((classroom as any)?.academicYear?.periods || []).find((p: any) => p.id === lapsoId)?.startDate}
                        riskSubtext="Alumnos con promedio < 10 pts"
                    />
                </div>

                {/* Horario en Vivo de la Materia */}
                <div className="mb-8">
                    <SubjectScheduleSection
                        schedule={schedule}
                        subject={subject}
                        role={yo?.role === 'TEACHER' || yo?.role === 'ADMIN' ? 'teacher' : 'student'}
                        showActions={true}
                        classroomId={classroomId}
                        // El horario lo arma el admin (el servidor lo exige): al profesor el lápiz
                    // le abría un editor que no podía guardar.
                    editUrl={yo?.role === 'ADMIN' ? `/dashboard/horario/${cycleId}/${sectionId}` : undefined}
                        subtitulo={sectionName}
                    />
                </div>

                <div className="mb-5">
                    <PartesDeLaPantalla
                        etiqueta="Partes de la materia"
                        activa={activeTab}
                        alElegir={setActiveTab}
                        partes={[
                            { id: 'estudiantes', nombre: 'Estudiantes', icono: Users },
                            // Una materia sin nota (Orientación…) se evalúa con apreciación.
                            ...(subject.evaluacion === 'CUALITATIVA' ? [{ id: 'apreciaciones', nombre: 'Apreciaciones', icono: CheckCircle }] : []),
                            { id: 'calificaciones', nombre: 'Plan', rotulo: 'Plan de evaluación', icono: GraduationCap },
                            { id: 'actividades', nombre: 'Actividades', icono: ListTodo },
                            { id: 'observaciones', nombre: 'Observaciones', icono: Bell },
                            // Al terminar el año: los que la reprobaron la presentan en revisión.
                            ...(subject.evaluacion !== 'CUALITATIVA' ? [{ id: 'revision', nombre: 'Revisión', icono: FileText }] : []),
                            // Y los que la arrastran del año anterior: la evalúa el profesor de esta clase.
                            ...(subject.evaluacion !== 'CUALITATIVA' && (yo?.role === 'ADMIN' || (yo?.role === 'TEACHER' && !!teacher && teacher.id === yo.id))
                                ? [{ id: 'pendientes', nombre: 'Pendientes', icono: ClipboardCheck }]
                                : []),
                        ]}
                    />
                </div>

                {/* Students Tab */}
                {activeTab === 'estudiantes' && (
                    <div className="overflow-hidden rounded-[24px] bg-white ring-1 ring-gray-200">
                        <div className="border-b border-gray-100 p-4">
                            <BuscadorDeAlumnos valor={searchTerm} alCambiar={setSearchTerm} />
                        </div>

                        {/* Cada alumno, una tarjeta con todo lo suyo. Antes eran
                            siete columnas dentro de un `overflow-x-auto`: 765 px
                            de tabla en una pantalla de 390. */}
                        <div className="p-2 sm:p-5">
                            <TablaAdaptable<SectionStudent>
                                compacta
                                alPulsar={(a) => router.push(`/dashboard/usuarios/${a.id}`)}
                                datos={sortedStudents}
                                cargando={isLoadingStudents}
                                clave={(a) => a.id}
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
                                        titulo: 'Estudiante',
                                        tituloCorto: 'Nombre',
                                        principal: true,
                                        ordenable: true,
                                        celdaCompacta: (a) => {
                                            const obs = (a as any).observationsCount || 0;
                                            return (
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <UserAvatar name={`${a.firstName} ${a.lastName}`} src={(a as any).avatar} className="h-8 w-8 shrink-0" initialsClassName="text-xs" />
                                                    <div className="min-w-0">
                                                        <p className="line-clamp-2 break-words text-sm font-medium leading-5 text-gray-900" title={`${a.firstName} ${a.lastName}`}>
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
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                                                    {a.firstName?.[0]}
                                                    {a.lastName?.[0]}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="line-clamp-2 break-words font-medium text-gray-900" title={`${a.firstName} ${a.lastName}`}>
                                                        {a.firstName} {a.lastName}
                                                    </p>
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
                                        // En la fila: el nivel en una letra de color (la materia es una sola).
                                        compacta: {
                                            ancho: 'w-12',
                                            celda: (a) => {
                                                const r = getAcademicRisk(a.average, passingGrade);
                                                const rojo = r.level === 'ALTO';
                                                const ambar = r.level === 'MEDIO';
                                                return (
                                                    <span
                                                        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${rojo ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' : ambar ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'text-emerald-700'}`}
                                                        title={r.label}
                                                    >
                                                        {rojo ? 'A' : ambar ? 'M' : r.level === 'SIN_CALIFICAR' ? '—' : 'B'}
                                                    </span>
                                                );
                                            },
                                        },
                                        celda: (a) => {
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
                                                a.average || a.hasGrades ? (
                                                    <span className={`text-sm font-bold tabular-nums ${(a.average ?? 0) < passingGrade ? 'text-red-600' : 'text-indigo-700'}`}>
                                                        {(a.average ?? 0).toFixed(1)}
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
                                                    Sin notas
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
                                                        ? 'inline-flex min-h-[44px] items-center px-1 text-sm font-medium text-indigo-600'
                                                        : 'inline-flex min-h-[44px] items-center px-1 text-sm italic text-gray-500'
                                                }
                                            >
                                                {((a as any).observationsCount || 0) > 0
                                                    ? `${(a as any).observationsCount} observación(es)`
                                                    : 'Agregar observación'}
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

                {activeTab === 'apreciaciones' && subject.evaluacion === 'CUALITATIVA' && (
                    <ApreciacionesDeLaMateria
                        classroomId={classroomId}
                        subjectId={subject.id}
                        puedePoner={yo?.role === 'ADMIN' || (yo?.role === 'TEACHER' && !!teacher && teacher.id === yo.id)}
                    />
                )}

                {activeTab === 'pendientes' && classroomSubject?.id && <PendientesDeLaClase claseId={classroomSubject.id} />}

                {activeTab === 'revision' && (
                    <RevisionDeLaMateria
                        classroomId={classroomId}
                        subjectId={subject.id}
                        puedePoner={yo?.role === 'ADMIN' || (yo?.role === 'TEACHER' && !!teacher && teacher.id === yo.id)}
                    />
                )}

                {/* Calificaciones / Evaluation Plan Tab */}
                {activeTab === 'calificaciones' && (
                    <div className="space-y-4">
                        <ElegirMomento valor={selectedLapso} alCambiar={setSelectedLapso} />

                        <EvaluationPlanSection
                            classroomId={classroomId}
                            subjectId={subject.id}
                            lapso={selectedLapso}
                            canEdit={yo?.role === 'ADMIN' || yo?.role === 'TEACHER'}
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
            </div>

            {/* Modal de Detalle de Observaciones del Estudiante */}
            {selectedStudentForObs && (
                <StudentObservationsModal
                    isOpen
                    onClose={() => setSelectedStudentForObs(null)}
                    student={selectedStudentForObs}
                />
            )}

        </div>
    );
}
