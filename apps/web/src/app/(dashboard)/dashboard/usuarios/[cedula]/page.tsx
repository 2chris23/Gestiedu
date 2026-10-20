
'use client';

import React from 'react';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import ProfileHeader from '@/components/profile/ProfileHeader';
// ObservationTray moved to AcademicOverview
import { AlertCircle } from 'lucide-react';
import { InscripcionDelAlumno } from '@/components/users/InscripcionDelAlumno';
import { TrasladoDelAlumno } from '@/components/users/TrasladoDelAlumno';
import { DocumentosDelAlumno } from '@/components/users/DocumentosDelAlumno';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

interface PageProps {
    params: Promise<{
        cedula: string;
    }>
}

import { diferido } from '@/components/common/Diferido';
import { useFichaDelUsuario, type TeacherClassroomEntry } from '@/components/usuario/useFichaDelUsuario';
import { ClasesYNotasDelUsuario } from '@/components/usuario/ClasesYNotasDelUsuario';
import { FichaPersonalDelUsuario } from '@/components/usuario/FichaPersonalDelUsuario';
const GuideHistoryModal = diferido(() => import('@/components/modals/GuideHistoryModal'), { sinEsqueleto: true });

interface AcademicYearEntry {
    id: string;
    name: string;
    status: string;
}

export default function UserProfilePage({ params }: PageProps) {
    const c = useFichaDelUsuario({ params });
    const {
        cedula,
        perfil,
        dbUser,
        loading,
        fullUserData,
        user,
        showGuideHistoryModal,
        setShowGuideHistoryModal,
        allAcademicYears,
        subiendoFoto,
        cambiarFoto,
        quitarFoto,
        studentClassroomId,
        scheduleData,
    } = c;

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
                    acciones={
                        user.role === 'student' ? (
                            <>
                                <InscripcionDelAlumno studentId={user.cedula} />
                                <TrasladoDelAlumno studentId={user.cedula} archivado={dbUser?.isActive === false} />
                                <DocumentosDelAlumno cedula={user.cedula} />
                            </>
                        ) : undefined
                    }
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

                <FichaPersonalDelUsuario c={c} />

                <ClasesYNotasDelUsuario c={c} />

            </div>

            {/* Guide History Modal */}
            {user?.role === 'teacher' && showGuideHistoryModal && (
                <GuideHistoryModal
                    isOpen
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
