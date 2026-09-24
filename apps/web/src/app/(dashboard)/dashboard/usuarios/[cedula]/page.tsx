
'use client';

import React, { useState, useEffect, use, useMemo } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { RepresentantesDelAlumno } from '@/components/users/RepresentantesDelAlumno';
import { TelefonoDeAsistencia } from '@/components/users/TelefonoDeAsistencia';
import ActividadesDelAlumno from '@/components/profile/ActividadesDelAlumno';
import api from '@/lib/axios';
import { comprimirFotoEnElDispositivo, pesoLegible } from '@/lib/foto-comprimida';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

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
    const queryClient = useQueryClient();

    /**
     * LA FICHA, DE LA MEMORIA DE LA APP
     *
     * Se pedía a mano y vivía solo mientras la pantalla estaba abierta: sin
     * conexión, la ficha de un alumno salía «Usuario no encontrado» aunque se
     * hubiera abierto un minuto antes. Pasando por React Query entra en lo que
     * se guarda en el teléfono (`MemoriaDelTelefono`).
     */
    const perfil = useQuery({
        queryKey: ['usuario', cedula],
        queryFn: () => userService.getUserById(cedula),
    });
    const dbUser = perfil.data;
    const loading = perfil.isLoading;
    const fullUserData = (dbUser ?? null) as {
        teacherClassrooms?: TeacherClassroomEntry[];
        studentClassrooms?: any[];
        children?: any[];
    } | null;

    const user: UserProfile | null = useMemo(
        () =>
            dbUser
                ? {
                      name: `${dbUser.firstName} ${dbUser.lastName}`,
                      cedula: dbUser.id,
                      role: dbUser.role.toLowerCase() as 'student' | 'teacher' | 'admin' | 'tutor',
                      email: dbUser.email,
                      phone: dbUser.phone || 'No registrado',
                      photoUrl: dbUser.avatar,
                      address: dbUser.address,
                  }
                : null,
        [dbUser]
    );

    /** La foto nueva, en la ficha guardada: sin volver a pedirla entera. */
    const ponerLaFoto = (avatar: string | null) =>
        queryClient.setQueryData(['usuario', cedula], (u: typeof dbUser) => (u ? { ...u, avatar } : u));

    const teacherData = useMemo(() => {
        const vacio = { guideSection: undefined, allClasses: [] as TeacherClass[], academicYears: [] as Array<{ id: string; name: string }> };
        if (!dbUser || dbUser.role !== 'TEACHER') return vacio;

        // La sección guía de hoy (del ciclo activo)
        const currentGuideClassroom = dbUser.teacherClassrooms?.find(
            (tc: TeacherClassroomEntry) => tc.isMainTeacher && ['ACTIVE', 'PLANNING'].includes(tc.classroom.academicYear.status)
        );
        const guideSection = currentGuideClassroom?.classroom;

        /**
         * EL PROMEDIO QUE NO HAY, NO SE INVENTA
         *
         * Si una materia no tenía promedio calculado se ponía 16,5, y la
         * pantalla lo enseñaba como «Promedio Alumnos» igual que uno de verdad.
         * Ahora se queda sin promedio y se ve «—».
         */
        const teacherAverages = (dbUser as any).teacherAverages || {};
        const allClasses: TeacherClass[] =
            dbUser.subjectTeachings?.map((st: any) => ({
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
                hoursPerWeek: st.hoursPerWeek || ((st.weeklyBlocks || 4) * 45) / 60,
                average: typeof teacherAverages[st.subject?.id] === 'number' ? teacherAverages[st.subject?.id] : undefined,
            })) || [];

        const academicYearsMap = new Map<string, string>();
        allClasses.forEach((c: TeacherClass) => {
            if (c.academicYearId) academicYearsMap.set(c.academicYearId, c.academicYearName);
        });

        return {
            guideSection: guideSection
                ? { name: guideSection.name, grade: guideSection.grade, section: guideSection.section }
                : undefined,
            allClasses,
            academicYears: Array.from(academicYearsMap.entries()).map(([id, name]) => ({ id, name })),
        };
    }, [dbUser]);

    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('current');
    const [selectedStudentYearId, setSelectedStudentYearId] = useState<string>('');
    const [showGuideHistoryModal, setShowGuideHistoryModal] = useState(false);
    const { data: allAcademicYears } = useAcademicYears();
    const [subiendoFoto, setSubiendoFoto] = useState(false);
    const confirmar = useConfirm();

    /**
     * Poner la foto: se achica en el dispositivo (512 px) y el servidor la deja
     * en 256 px WebP. Se enseña cuánto pesaba y cuánto quedó: es la prueba, a la
     * vista, de que no se está llenando la base con fotos de 4 MB.
     */
    const cambiarFoto = async (archivo: File) => {
        setSubiendoFoto(true);
        try {
            const reducida = await comprimirFotoEnElDispositivo(archivo);
            const datos = new FormData();
            datos.append('foto', reducida, 'foto.webp');
            // El cliente de la API trae `Content-Type: application/json` fijo, y con
            // eso axios convierte el formulario en JSON: la foto no llegaba (406).
            // Con multipart, el navegador pone el separador que toca.
            const { data } = await api.put(`/users/${encodeURIComponent(cedula)}/photo`, datos, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            ponerLaFoto(data.avatar);
            toast.success(`Foto guardada: de ${pesoLegible(archivo.size)} a ${pesoLegible(data.bytesGuardados)}`);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || e?.message || 'No se pudo guardar la foto');
        } finally {
            setSubiendoFoto(false);
        }
    };

    const quitarFoto = async () => {
        const si = await confirmar({ title: '¿Quitar la foto?', description: 'Se verán las iniciales en su lugar.', confirmLabel: 'Quitar' });
        if (!si) return;
        try {
            await api.delete(`/users/${encodeURIComponent(cedula)}/photo`);
            ponerLaFoto(null);
            toast.success('Foto quitada');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo quitar la foto');
        }
    };

    const [studentClassroomId, setStudentClassroomId] = useState<string>('');
    // Fase 3.5 — filtro por lapso/momento (undefined = "Todo el ciclo")
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);
    const [studentPeriods, setStudentPeriods] = useState<Array<{ id: string; name: string }>>([]);

    const estadisticas = useQuery({
        queryKey: ['usuario', cedula, 'estadisticas', lapsoId ?? null, selectedStudentYearId || null],
        queryFn: () => studentsService.getStudentDashboardStatsById(dbUser!.id, lapsoId, selectedStudentYearId || undefined),
        enabled: dbUser?.role === 'STUDENT',
        placeholderData: (anteriores) => anteriores,
    });
    const studentStats: StudentDashboardStats | null = estadisticas.data ?? null;

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
        // Las cifras de ese ciclo las pide `estadisticas`, que depende de él.
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

    // Lo que se elige al abrir la ficha: el ciclo y la sección más recientes.
    useEffect(() => {
        if (!dbUser) return;
        if (dbUser.role === 'STUDENT') {
            const scs = (dbUser as any).studentClassrooms || [];
            const initialYear = scs[0]?.academicYear || dbUser.classroom?.academicYear;
            if (initialYear?.id) setSelectedStudentYearId((y) => y || initialYear.id);
            if (dbUser.classroom?.id) setStudentClassroomId((c) => c || dbUser.classroom!.id);
            // Fase 3.5 — lapsos del aula para el selector de Momento
            if ((dbUser.classroom as any)?.academicYear?.periods) {
                setStudentPeriods((dbUser.classroom as any).academicYear.periods);
            }
        }
        if (dbUser.role === 'TEACHER' && teacherData.academicYears.length > 0) {
            setSelectedAcademicYear((y) => (y === 'current' ? teacherData.academicYears[0].id : y));
        }
    }, [dbUser, teacherData]);

    // Sin sección en la ficha, la de las cifras del alumno.
    useEffect(() => {
        const seccion = studentStats?.student?.currentSection?.id;
        if (seccion) setStudentClassroomId((c) => c || seccion);
    }, [studentStats]);

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
                    {esQueNoContesta(perfil.error) ? (
                        <>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Sin conexión</h2>
                            <p className="text-gray-500 mb-6">Esta ficha no se había abierto antes en este dispositivo, así que no está guardada. Se verá en cuanto vuelva la conexión.</p>
                        </>
                    ) : (
                        <>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Usuario no encontrado</h2>
                            <p className="text-gray-500 mb-6">No existe ningún usuario registrado con la cédula <strong>{cedula}</strong> en la base de datos.</p>
                        </>
                    )}
                    <button onClick={() => window.history.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Regresar</button>
                </div>
            </div>
        );
    }



    return (
        // Sin margen ni ancho propios: con `p-6 md:p-8` encima del margen del
        // marco, la ficha empezaba 24 px más adentro que las demás pantallas.
        <div className="space-y-6">


            {/* 1. Cabecera (Profile Header) - Keeping it as the main identity card */}
            <div className="animate-in slide-in-from-bottom-2 duration-500">
                <ProfileHeader
                    user={user}
                    alCambiarFoto={cambiarFoto}
                    alQuitarFoto={quitarFoto}
                    subiendoFoto={subiendoFoto}
                />
            </div>

            {/* Horario a ancho completo para evitar que se aplaste */}
            <div className="animate-in fade-in duration-500 delay-100">
                <StudentScheduleSection 
                    schedule={scheduleData} 
                    role={user.role === 'student' || user.role === 'teacher' ? user.role : 'student'} 
                    showActions={true}
                    // Sin la sección, el horario salía sin tema y con los
                    // contadores en cero: el resumen del día se pide POR sección.
                    classroomId={user.role === 'student' ? studentClassroomId : undefined}
                    editUrl={user.role === 'teacher' ? `/dashboard/horarios?profesor=${cedula}` : undefined}
                    titulo={`Horario · ${user.name}`}
                    subtitulo={user.role === 'teacher' ? 'Profesor' : 'Estudiante'}
                    teacherId={user.role === 'teacher' ? cedula : undefined}
                />
            </div>

            {/* 2. Main Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Personal Information Detail (Ficha) */}
                <div className="lg:col-span-1 space-y-6 animate-in slide-in-from-left duration-500 delay-150">
                    {/* Lo que le falta al alumno: la pregunta que más se hace un
                        representante y que la ficha no sabía responder. */}
                    {user.role === 'student' && (
                        <ActividadesDelAlumno
                            studentId={user.cedula}
                            academicYearId={selectedStudentYearId || undefined}
                        />
                    )}

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
                            {user.role === 'student' && <RepresentantesDelAlumno studentId={user.cedula} />}
                            {user.role === 'student' && <TelefonoDeAsistencia studentId={user.cedula} />}
                            {user.role === 'tutor' && (
                                <div className="pt-4 border-t border-gray-100 mt-2">
                                    <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">Representa a</span>
                                    {(fullUserData?.children ?? []).length === 0 ? (
                                        <p className="text-gray-400 italic text-sm mt-1">
                                            Ningún estudiante. Se asigna desde el perfil del estudiante.
                                        </p>
                                    ) : (
                                        <ul className="mt-2 space-y-1.5">
                                            {(fullUserData?.children ?? []).map((c) => (
                                                <li key={c.student.id}>
                                                    <Link
                                                        href={`/dashboard/usuarios/${c.student.id}`}
                                                        className="block rounded-xl bg-gray-50 px-3 py-2 hover:bg-gray-100"
                                                    >
                                                        <span className="block truncate text-sm font-semibold text-gray-800">
                                                            {c.student.firstName} {c.student.lastName}
                                                        </span>
                                                        <span className="block truncate text-xs text-gray-500">
                                                            {c.relationship}
                                                            {c.student.studentClassrooms?.[0]?.classroom?.name
                                                                ? ` · ${c.student.studentClassrooms[0].classroom.name}`
                                                                : ''}
                                                        </span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
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
                                        if (typeof cls.average === 'number') {
                                            groupedByGrade[g].sumAvg += cls.average;
                                            groupedByGrade[g].count += 1;
                                        }
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
                                        const gradeAvg = group.count > 0 ? (group.sumAvg / group.count).toFixed(1) : null;

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
                                                                {gradeAvg ? `${gradeAvg} pts` : '—'}
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
