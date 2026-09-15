
'use client';

import React, { useState, useEffect, use, useMemo } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProfileHeader, { UserProfile } from '@/components/profile/ProfileHeader';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import LapsoSelector from '@/components/academic/LapsoSelector'; // Fase 3.5 — filtro por lapso
// ObservationTray moved to AcademicOverview
import AcademicOverview from '@/components/profile/AcademicOverview';
import StudentCycleAccordion from '@/components/profile/StudentCycleAccordion';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { notFound } from 'next/navigation';
import { User, Calendar, FileText, AlertCircle, Edit, GraduationCap, ChevronLeft } from 'lucide-react';
import GuideHistoryModal from '@/components/modals/GuideHistoryModal';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useTeacherScheduleBlocks, transformTeacherScheduleData, useClassroomSchedule, transformScheduleData } from '@/hooks/useSchedules';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PageProps {
    params: Promise<{
        cedula: string;
    }>
}

import { userService } from '@/services/user.service';
import { studentsService } from '@/services/students.service';
import { StudentDashboardStats } from '@/types/student';

// ScheduleEntry type kept for compatibility
interface ScheduleEntry {
    day: string;
    startTime: string;
    endTime: string;
    subject: string;
    detail: string;
    location: string;
    color: string;
}

interface TeacherClassroomEntry {
    isMainTeacher: boolean;
    classroom: { id: string; name: string; slug: string; grade: number; section: string; academicYear: { id: string; status: string } };
}

interface AcademicYearEntry {
    id: string;
    name: string;
    status: string;
}

interface TeacherClass {
    subjectId: string;
    subject: string;
    subjectSlug: string;
    classroomId: string;
    classroom: string;
    classroomSlug: string;
    grade: number;
    section: string;
    academicYearId: string;
    academicYearName: string;
    weeklyBlocks?: number;
    hoursPerWeek?: number;
    average?: number;
}

export default function UserProfilePage({ params }: PageProps) {
    const { cedula } = use(params);
    const [activeTab, setActiveTab] = useState<'info' | 'schedule' | 'grades'>('schedule');
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [studentStats, setStudentStats] = useState<StudentDashboardStats | null>(null);
    const [teacherData, setTeacherData] = useState<{
        guideSection?: { name: string; grade: number; section: string };
        allClasses: TeacherClass[];
        academicYears: Array<{ id: string; name: string }>;
    }>({ allClasses: [], academicYears: [] });
    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('current');
    const [selectedStudentYearId, setSelectedStudentYearId] = useState<string>('');
    const [showGuideHistoryModal, setShowGuideHistoryModal] = useState(false);
    const { data: allAcademicYears } = useAcademicYears();
    const [fullUserData, setFullUserData] = useState<{ teacherClassrooms?: TeacherClassroomEntry[]; studentClassrooms?: any[] } | null>(null);
    const [studentClassroomId, setStudentClassroomId] = useState<string>('');
    // Fase 3.5 — filtro por lapso/momento (undefined = "Todo el ciclo")
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);
    const [studentPeriods, setStudentPeriods] = useState<Array<{ id: string; name: string }>>([]);

    // Extraer ciclos académicos únicos del estudiante (ordenados por el más reciente)
    const studentAcademicYears = useMemo(() => {
        const scs = (fullUserData as any)?.studentClassrooms || [];
        const years: Array<{ id: string; name: string; sectionName: string; classroomId: string; periods: any[]; isLatest: boolean }> = [];
        scs.forEach((sc: any, idx: number) => {
            const y = sc.academicYear || sc.classroom?.academicYear;
            if (y && !years.some(item => item.id === y.id)) {
                years.push({
                    id: y.id,
                    name: y.name,
                    sectionName: sc.classroom?.name || `${sc.classroom?.grade}° ${sc.classroom?.section}`,
                    classroomId: sc.classroomId || sc.classroom?.id,
                    periods: sc.classroom?.academicYear?.periods || [],
                    isLatest: idx === 0
                });
            }
        });
        if (years.length === 0 && studentStats?.student?.currentSection) {
            years.push({
                id: (studentStats.student.currentSection as any).academicYearId || 'current-cycle',
                name: (studentStats.student.currentSection as any).academicYearName || 'Ciclo Actual',
                sectionName: studentStats.student.currentSection.name || 'Sección Actual',
                classroomId: studentStats.student.currentSection.id || '',
                periods: [],
                isLatest: true
            });
        }
        return years;
    }, [fullUserData, studentStats]);

    const handleStudentYearChange = async (yearId: string) => {
        setSelectedStudentYearId(yearId);
        setLapsoId(undefined);
        const matched = studentAcademicYears.find(y => y.id === yearId);
        if (matched) {
            setStudentClassroomId(matched.classroomId);
            if (matched.periods && matched.periods.length > 0) {
                setStudentPeriods(matched.periods);
            }
        }
        if (user?.cedula) {
            try {
                const stats = await studentsService.getStudentDashboardStatsById(user.cedula, undefined, yearId);
                setStudentStats(stats);
            } catch (err) {
                console.error("Error fetching student stats for year:", err);
            }
        }
    };

    // Real schedule data for teachers and students
    const { data: teacherBlocks } = useTeacherScheduleBlocks(
        user?.role === 'teacher' ? cedula : ''
    );
    const { data: studentBlocks } = useClassroomSchedule(studentClassroomId);

    const scheduleData = user?.role === 'teacher'
        ? transformTeacherScheduleData(teacherBlocks)
        : user?.role === 'student'
            ? transformScheduleData(studentBlocks)
            : [];

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch real user from DB
                const dbUser = await userService.getUserById(cedula);

                // Map DB User to Profile UI format
                if (dbUser) {
                    // Store complete user data for modal
                    setFullUserData(dbUser);

                    setUser({
                        name: `${dbUser.firstName} ${dbUser.lastName}`,
                        cedula: dbUser.id,
                        role: dbUser.role.toLowerCase() as 'student' | 'teacher' | 'admin' | 'tutor',
                        email: dbUser.email,
                        phone: dbUser.phone || 'No registrado',
                        photoUrl: dbUser.avatar,
                        address: dbUser.address, // Agregar dirección desde DB
                    });

                    // If student, fetch dashboard stats
                    if (dbUser.role === 'STUDENT') {
                        const scs = (dbUser as any).studentClassrooms || [];
                        const initialYear = scs[0]?.academicYear || dbUser.classroom?.academicYear;
                        if (initialYear?.id) {
                            setSelectedStudentYearId(initialYear.id);
                        }
                        if (dbUser.classroom?.id) {
                            setStudentClassroomId(dbUser.classroom.id);
                        }
                        // Fase 3.5 — lapsos del aula para el selector de Momento
                        if ((dbUser.classroom as any)?.academicYear?.periods) {
                            setStudentPeriods((dbUser.classroom as any).academicYear.periods);
                        }
                        try {
                            const stats = await studentsService.getStudentDashboardStatsById(dbUser.id, lapsoId, initialYear?.id);
                            setStudentStats(stats);
                            // Set it from stats as fallback in case it's not in dbUser directly
                            if (!dbUser.classroom?.id && stats?.student?.currentSection?.id) {
                                setStudentClassroomId(stats.student.currentSection.id);
                            }
                        } catch (err) {
                            console.error("Error fetching student stats:", err);
                        }
                    }

                    // If teacher, extract guide section and classes
                    if (dbUser.role === 'TEACHER') {
                        // Extract current guide section (from active academic year)
                        const currentGuideClassroom = dbUser.teacherClassrooms?.find(
                            (tc: TeacherClassroomEntry) => tc.isMainTeacher && ['ACTIVE', 'PLANNING'].includes(tc.classroom.academicYear.status)
                        );
                        const guideSection = currentGuideClassroom?.classroom;

                        // Mapear las materias reales que imparte el profesor desde subjectTeachings
                        const teacherAverages = (dbUser as any).teacherAverages || {};
                        const allClasses: TeacherClass[] = dbUser.subjectTeachings?.map((st: any) => ({
                            subjectId: st.subject?.id || '',
                            subject: st.subject?.name || 'Materia',
                            subjectSlug: st.subject?.slug || '',
                            classroomId: st.classroom?.id || '',
                            classroom: st.classroom?.name || `Sección ${st.classroom?.section}`,
                            classroomSlug: st.classroom?.slug || '',
                            grade: st.classroom?.grade || 1,
                            section: st.classroom?.section || 'A',
                            academicYearId: st.classroom?.academicYear?.id || '',
                            academicYearName: st.classroom?.academicYear?.name || '',
                            weeklyBlocks: st.weeklyBlocks || 4,
                            hoursPerWeek: st.hoursPerWeek || ((st.weeklyBlocks || 4) * 45 / 60),
                            average: teacherAverages[st.subject?.id] || 16.5
                        })) || [];

                        // Extract unique academic years
                        const academicYearsMap = new Map<string, string>();
                        allClasses.forEach((c: TeacherClass) => {
                            if (c.academicYearId) {
                                academicYearsMap.set(c.academicYearId, c.academicYearName);
                            }
                        });

                        const academicYears = Array.from(academicYearsMap.entries()).map(([id, name]) => ({
                            id,
                            name
                        }));

                        setTeacherData({
                            guideSection: guideSection ? {
                                name: guideSection.name,
                                grade: guideSection.grade,
                                section: guideSection.section
                            } : undefined,
                            allClasses,
                            academicYears
                        });

                        // Set default to first academic year if available
                        if (academicYears.length > 0) {
                            setSelectedAcademicYear(academicYears[0].id);
                        }
                    }
                }
            } catch (error) {
                console.error("User not found or error:", error);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [cedula, lapsoId]);

    // Filter classes by selected academic year
    const filteredClasses = selectedAcademicYear === 'current'
        ? teacherData.allClasses.filter(c => c.academicYearId === teacherData.academicYears[0]?.id)
        : teacherData.allClasses.filter(c => c.academicYearId === selectedAcademicYear);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400">Cargando perfil...</div>;
    }

    if (!user) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-sm">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Usuario no encontrado</h2>
                    <p className="text-gray-500 mb-6">No existe ningún usuario registrado con la cédula <strong>{cedula}</strong> en la base de datos.</p>
                    <button onClick={() => window.history.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Regresar</button>
                </div>
            </div>
        );
    }



    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 max-w-6xl mx-auto space-y-8">


            {/* 1. Cabecera (Profile Header) - Keeping it as the main identity card */}
            <div className="animate-in slide-in-from-bottom-2 duration-500">
                <ProfileHeader user={user} onEdit={() => toast.info('Modo edición no disponible en demo')} />
            </div>

            {/* Horario a ancho completo para evitar que se aplaste */}
            <div className="animate-in fade-in duration-500 delay-100">
                <StudentScheduleSection 
                    schedule={scheduleData} 
                    role={user.role === 'student' || user.role === 'teacher' ? user.role : 'student'} 
                    showActions={true}
                    editUrl={user.role === 'teacher' ? `/dashboard/horarios?profesor=${cedula}` : undefined}
                />
            </div>

            {/* 2. Main Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Personal Information Detail (Ficha) */}
                <div className="lg:col-span-1 space-y-6 animate-in slide-in-from-left duration-500 delay-150">
                    {/* Teacher Guide Section - First for teachers */}
                    {user.role === 'teacher' && (
                        <div
                            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all"
                            onClick={() => setShowGuideHistoryModal(true)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowGuideHistoryModal(true); } }}
                        >
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <User size={18} className="text-indigo-500" />
                                Sección Guía
                                <span className="ml-auto text-xs text-gray-400">Click para ver historial</span>
                            </h3>
                            <div className="space-y-2">
                                {teacherData.guideSection ? (
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                                        <p className="font-bold text-indigo-900">{teacherData.guideSection.name}</p>
                                        <p className="text-sm text-indigo-700">
                                            {teacherData.guideSection.grade}° Año - Sección {teacherData.guideSection.section}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-gray-400 italic text-sm">No es profesor guía de ninguna sección</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Personal Information */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <User size={18} className="text-blue-500" />
                            Información Personal
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="grid gap-1">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Nombre Completo</span>
                                <span className="font-medium text-gray-700">{user.name}</span>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Cédula</span>
                                <span className="font-medium text-gray-700">{user.cedula}</span>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Correo Electrónico</span>
                                <span className="font-medium text-gray-700 truncate">{user.email}</span>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Teléfono</span>
                                <span className="font-medium text-gray-700">{user.phone}</span>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Dirección</span>
                                {user.address ? (
                                    <span className="font-medium text-gray-700">{user.address}</span>
                                ) : (
                                    <span className="text-gray-400 italic text-sm">Sin dirección registrada</span>
                                )}
                            </div>
                            {user.role === 'student' && (
                                <div className="pt-4 border-t border-gray-100 mt-2">
                                    <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Representante</span>
                                    <p className="text-gray-400 italic text-sm mt-1">Sin representante asignado</p>
                                </div>
                            )}
                        </div>
                    </div>


                </div>

                {/* Right Column: Observations & Classes */}
                <div className="lg:col-span-2 space-y-6 animate-in slide-in-from-right duration-500 delay-150">
                    {/* Teacher Classes Card - Agrupado por Años Escolar con Promedios y Desplegables de Secciones */}
                    {user.role === 'teacher' && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        <GraduationCap size={20} className="text-indigo-600" />
                                        Rendimiento y Clases por Año
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Selecciona un año para ver sus secciones y acceder directamente al plan de la materia
                                    </p>
                                </div>
                                {teacherData.academicYears.length > 0 && (
                                    <Select
                                        value={selectedAcademicYear || undefined}
                                        onValueChange={setSelectedAcademicYear}
                                    >
                                        <SelectTrigger className="min-w-[170px] bg-gray-50 border-gray-200">
                                            <SelectValue placeholder="Año académico" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {teacherData.academicYears.map((year) => (
                                                <SelectItem key={year.id} value={year.id}>
                                                    {year.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            {/* Resumen Global de Carga Horaria Docente (30-40h semanales) */}
                            {(() => {
                                const totalHours = filteredClasses.reduce((sum, c) => sum + (c.hoursPerWeek || 3), 0);
                                const totalBlocks = filteredClasses.reduce((sum, c) => sum + (c.weeklyBlocks || 4), 0);
                                const isNearLimit = totalHours >= 30 && totalHours <= 40;
                                const isOverLimit = totalHours > 40;
                                const percentage = Math.min(Math.round((totalHours / 40) * 100), 100);

                                return (
                                    <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-2xs space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                                    <Calendar className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                        Carga Horaria Semanal
                                                    </h4>
                                                    <p className="text-sm font-black text-gray-900">
                                                        {totalHours.toFixed(1)}h / semana <span className="text-xs font-normal text-gray-500">({totalBlocks} bloques de 45 min)</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={cn(
                                                "text-xs font-bold px-2.5 py-1 rounded-full border",
                                                isOverLimit
                                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                                    : isNearLimit
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                        : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                            )}>
                                                {isOverLimit ? 'Sobrecarga (+40h)' : isNearLimit ? 'Carga Óptima (30-40h)' : 'Carga Moderada (<30h)'}
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs text-gray-500 font-medium">
                                                <span>Límite pedagógico recomendado: 30 a 40 horas</span>
                                                <span className="font-bold">{percentage}% de jornada máx.</span>
                                            </div>
                                            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-500",
                                                        isOverLimit ? "bg-rose-500" : isNearLimit ? "bg-emerald-500" : "bg-indigo-600"
                                                    )}
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Acordeón / Tarjetas por Grado (Año) */}
                            <div className="space-y-3">
                                {(() => {
                                    // Agrupar clases por Grado (1er Año, 2do Año...)
                                    const groupedByGrade: Record<number, { gradeName: string; classes: TeacherClass[]; sumAvg: number; count: number; totalHours: number }> = {};
                                    const gradeLabels: Record<number, string> = {
                                        1: 'Primer Año',
                                        2: 'Segundo Año',
                                        3: 'Tercer Año',
                                        4: 'Cuarto Año',
                                        5: 'Quinto Año'
                                    };

                                    filteredClasses.forEach((cls) => {
                                        const g = cls.grade || 1;
                                        if (!groupedByGrade[g]) {
                                            groupedByGrade[g] = {
                                                gradeName: gradeLabels[g] || `${g}º Año`,
                                                classes: [],
                                                sumAvg: 0,
                                                count: 0,
                                                totalHours: 0
                                            };
                                        }
                                        groupedByGrade[g].classes.push(cls);
                                        groupedByGrade[g].sumAvg += cls.average || 16.5;
                                        groupedByGrade[g].count += 1;
                                        groupedByGrade[g].totalHours += cls.hoursPerWeek || 3;
                                    });

                                    const gradesList = Object.keys(groupedByGrade).map(Number).sort((a, b) => a - b);

                                    if (gradesList.length === 0) {
                                        return (
                                            <div className="text-center py-10">
                                                <p className="text-gray-400 italic text-sm">
                                                    No se encontraron clases asignadas para este ciclo escolar.
                                                </p>
                                            </div>
                                        );
                                    }

                                    return gradesList.map((g) => {
                                        const group = groupedByGrade[g];
                                        const gradeAvg = (group.sumAvg / (group.count || 1)).toFixed(1);

                                        return (
                                            <div key={g} className="border border-gray-200/80 rounded-xl overflow-hidden shadow-2xs transition-all">
                                                <div className="bg-gradient-to-r from-gray-50 to-indigo-50/30 px-4 py-3.5 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                                            {g}º
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-bold text-gray-900">{group.gradeName}</h4>
                                                            <span className="text-xs text-gray-500 font-medium">
                                                                {group.classes.length} {group.classes.length === 1 ? 'Sección' : 'Secciones'} • {group.totalHours.toFixed(1)}h / sem
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">
                                                                Promedio Alumnos
                                                            </span>
                                                            <span className="text-sm font-black text-indigo-600">
                                                                {gradeAvg} pts
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Lista de Secciones y Materias asociadas con Link directo */}
                                                <div className="p-3 bg-white grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                                    {group.classes.map((c, cIdx) => (
                                                        <Link
                                                            key={cIdx}
                                                            href={`/dashboard/academico/${c.academicYearName}/${c.classroomSlug}`}
                                                            className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-indigo-50/60 hover:border-indigo-200 transition-all group"
                                                        >
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-sm text-gray-800 group-hover:text-indigo-600 transition-colors">
                                                                        {c.classroom}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs font-semibold text-gray-600">
                                                                    {c.subject}
                                                                </p>
                                                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                                                    <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-indigo-700 font-semibold">
                                                                        ⏱️ {(c.hoursPerWeek || 3).toFixed(1)}h/sem
                                                                    </span>
                                                                    <span>({c.weeklyBlocks || 4} bloques)</span>
                                                                </div>
                                                            </div>

                                                            <div className="text-right flex items-center gap-2">
                                                                <div>
                                                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 block">
                                                                        {(c.average || 16.5).toFixed(1)} pts
                                                                    </span>
                                                                </div>
                                                                <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180 group-hover:translate-x-1 transition-all group-hover:text-indigo-600" />
                                                            </div>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}
                    {/* Rendimiento Académico en Acordeones por Ciclo Escolar */}
                    {user.role === 'student' && (
                        <div className="animate-in fade-in duration-700 delay-300">
                            {studentAcademicYears.length > 0 ? (
                                <StudentCycleAccordion
                                    studentId={user.cedula}
                                    studentName={user.name}
                                    cycles={studentAcademicYears}
                                    initialOpenCycleId={null}
                                />
                            ) : (
                                <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center">
                                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <AlertCircle size={32} className="text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-600 mb-2">Estudiante Sin Asignar</h3>
                                    <p className="text-gray-500 text-sm">Este estudiante aún no ha sido inscrito en ninguna sección.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* Guide History Modal */}
            {user?.role === 'teacher' && (
                <GuideHistoryModal
                    isOpen={showGuideHistoryModal}
                    onClose={() => setShowGuideHistoryModal(false)}
                    guideSections={(() => {
                        // Solo mostrar los años en los que el docente SÍ fue guía titular
                        if (!allAcademicYears || allAcademicYears.length === 0) return [];

                        return allAcademicYears
                            .map((year: AcademicYearEntry) => {
                                const guideInYear = fullUserData?.teacherClassrooms?.find(
                                    (tc: TeacherClassroomEntry) => tc.isMainTeacher && tc.classroom.academicYear.id === year.id
                                );

                                if (!guideInYear) return null;

                                return {
                                    academicYearId: year.id,
                                    academicYearName: year.name,
                                    academicYearStatus: year.status,
                                    classroomId: guideInYear.classroom.id,
                                    classroomName: guideInYear.classroom.name,
                                    classroomSlug: guideInYear.classroom.slug,
                                    grade: guideInYear.classroom.grade,
                                    section: guideInYear.classroom.section
                                };
                            })
                            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
                    })()}
                    teacherName={user?.name || ''}
                />
            )}

        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-all ${active
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}
        >
            {icon}
            {label}
        </button>
    );
}
