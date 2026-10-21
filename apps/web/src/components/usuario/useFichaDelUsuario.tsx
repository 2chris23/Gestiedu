'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserProfile } from '@/components/profile/ProfileHeader';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useTeacherScheduleBlocks, transformTeacherScheduleData, useClassroomSchedule, transformScheduleData } from '@/hooks/useSchedules';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import api from '@/lib/axios';
import { comprimirFotoEnElDispositivo, pesoLegible } from '@/lib/foto-comprimida';
import { useConfirm } from '@/hooks/useConfirm';
import { userService } from '@/services/user.service';
import { studentsService } from '@/services/students.service';
import { StudentDashboardStats } from '@/types/student';

/** Lo que UserProfilePage sabe y hace; su JSX vive en el componente. */
export function useFichaDelUsuario({ params }: { params: Promise<{ cedula: string }> }) {
    const { cedula } = use(params);
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

    const { data: reglasDeCarga = { minimo: 30, maximo: 40 } } = useQuery<{ minimo: number; maximo: number }>({
        queryKey: ['reglas-carga-horaria'],
        queryFn: async () => (await api.get('/institutes/current/carga-horaria')).data.data,
        enabled: dbUser?.role === 'TEACHER',
    });

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
                // Sin inventar: sin horas, las de sus bloques (45 min); sin bloques, 0 («sin horas»).
                weeklyBlocks: st.weeklyBlocks || 0,
                hoursPerWeek: st.hoursPerWeek || ((st.weeklyBlocks || 0) * 45) / 60,
                average: typeof teacherAverages[`${st.classroom?.id}|${st.subject?.id}`] === 'number' ? teacherAverages[`${st.classroom?.id}|${st.subject?.id}`] : undefined,
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
    const { yo } = useQuienSoy();

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

    // El ciclo de la ficha sale ya del usuario: si se esperara al efecto que
    // lo elige, la primera pintada pedía las cifras sin ciclo y luego otra
    // vez con él (dos veces lo mismo, y la primera tirada).
    // La misma cuenta que el efecto de abajo, letra por letra: si el primer
    // ciclo de la lista no trae id, no se elige ninguno.
    const cicloInicial: string =
        ((dbUser as any)?.studentClassrooms?.[0]?.academicYear || (dbUser?.classroom as any)?.academicYear)?.id || '';
    const cicloDeLaFicha = selectedStudentYearId || cicloInicial;
    const estadisticas = useQuery({
        queryKey: ['usuario', cedula, 'estadisticas', lapsoId ?? null, cicloDeLaFicha || null],
        queryFn: () => studentsService.getStudentDashboardStatsById(dbUser!.id, lapsoId, cicloDeLaFicha || undefined),
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

    return {
        cedula,
        perfil,
        dbUser,
        loading,
        fullUserData,
        user,
        reglasDeCarga,
        teacherData,
        selectedAcademicYear,
        setSelectedAcademicYear,
        showGuideHistoryModal,
        setShowGuideHistoryModal,
        allAcademicYears,
        subiendoFoto,
        yo,
        cambiarFoto,
        quitarFoto,
        studentClassroomId,
        studentAcademicYears,
        scheduleData,
        filteredClasses,
    };
}

export interface TeacherClassroomEntry {
    isMainTeacher: boolean;
    classroom: { id: string; name: string; slug: string; grade: number; section: string; academicYear: { id: string; status: string } };
}

export interface TeacherClass {
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
