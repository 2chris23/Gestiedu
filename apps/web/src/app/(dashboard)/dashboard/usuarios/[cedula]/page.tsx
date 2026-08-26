
'use client';

import React, { useState, useEffect, use } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProfileHeader, { UserProfile } from '@/components/profile/ProfileHeader';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import LapsoSelector from '@/components/academic/LapsoSelector'; // Fase 3.5 — filtro por lapso
// ObservationTray moved to AcademicOverview
import AcademicOverview from '@/components/profile/AcademicOverview';
import { ScheduleBlock } from '@/components/schedule/UniversalScheduleViewer';
import { notFound } from 'next/navigation';
import { User, Calendar, FileText, AlertCircle, Edit } from 'lucide-react';
import GuideHistoryModal from '@/components/modals/GuideHistoryModal';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useTeacherScheduleBlocks, transformTeacherScheduleData, useClassroomSchedule, transformScheduleData } from '@/hooks/useSchedules';
import Link from 'next/link';

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
    subject: string;
    classroom: string;
    academicYearId: string;
    academicYearName: string;
}

export default function UserProfilePage({ params }: PageProps) {
    const { cedula } = use(params);
    const [activeTab, setActiveTab] = useState<'info' | 'schedule' | 'grades'>('schedule');
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [studentStats, setStudentStats] = useState<StudentDashboardStats | null>(null);
    const [teacherData, setTeacherData] = useState<{
        guideSection?: { name: string; grade: number; section: string };
        allClasses: Array<{ subject: string; classroom: string; academicYearId: string; academicYearName: string }>;
        academicYears: Array<{ id: string; name: string }>;
    }>({ allClasses: [], academicYears: [] });
    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('current');
    const [showGuideHistoryModal, setShowGuideHistoryModal] = useState(false);
    const { data: allAcademicYears } = useAcademicYears();
    const [fullUserData, setFullUserData] = useState<{ teacherClassrooms?: TeacherClassroomEntry[] } | null>(null);
    const [studentClassroomId, setStudentClassroomId] = useState<string>('');
    // Fase 3.5 — filtro por lapso/momento (undefined = "Todo el ciclo")
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);
    const [studentPeriods, setStudentPeriods] = useState<Array<{ id: string; name: string }>>([]);

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
                        if (dbUser.classroom?.id) {
                            setStudentClassroomId(dbUser.classroom.id);
                        }
                        // Fase 3.5 — lapsos del aula para el selector de Momento
                        if ((dbUser.classroom as any)?.academicYear?.periods) {
                            setStudentPeriods((dbUser.classroom as any).academicYear.periods);
                        }
                        try {
                            const stats = await studentsService.getStudentDashboardStatsById(dbUser.id, lapsoId);
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
                        const allClasses: TeacherClass[] = dbUser.subjectTeachings?.map((st: any) => ({
                            subject: st.subject.name,
                            classroom: `${st.classroom.name} - Sección ${st.classroom.section}`,
                            academicYearId: st.classroom.academicYear.id,
                            academicYearName: st.classroom.academicYear.name
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
                    {/* Teacher Classes Card */}
                    {user.role === 'teacher' && (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <FileText size={18} className="text-green-500" />
                                    Clases que Imparte
                                </h3>
                                {teacherData.academicYears.length > 0 && (
                                    <Select
                                        value={selectedAcademicYear || undefined}
                                        onValueChange={setSelectedAcademicYear}
                                    >
                                        <SelectTrigger className="min-w-[180px]">
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
                            <div className="space-y-2">
                                {filteredClasses.length > 0 ? (
                                    filteredClasses.map((classInfo, index) => (
                                        <div key={index} className="bg-green-50 border border-green-100 rounded-lg p-3">
                                            <p className="font-bold text-green-900">{classInfo.subject}</p>
                                            <p className="text-sm text-green-700">{classInfo.classroom}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="text-gray-400 italic text-sm">
                                            No impartió clases en el ciclo {teacherData.academicYears.find(y => y.id === selectedAcademicYear)?.name || 'seleccionado'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Academic Overview - Inside right column for students to avoid empty space */}
                    {user.role === 'student' && (
                        <div className="animate-in fade-in duration-700 delay-300">
                            {studentStats?.student.currentSection ? (
                                <>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider">
                                            Rendimiento por Momento
                                        </h3>
                                        <LapsoSelector
                                            periods={studentPeriods}
                                            value={lapsoId}
                                            onChange={setLapsoId}
                                            compact
                                        />
                                    </div>
                                    <AcademicOverview
                                        grade={studentStats.student.currentSection.name || "Sin asignar"}
                                        section="" // Ya incluido en name
                                        guideTeacher={studentStats.student.currentSection.guideTeacher || "Sin profesor guía"}
                                        studentStats={studentStats}
                                    />
                                </>
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
