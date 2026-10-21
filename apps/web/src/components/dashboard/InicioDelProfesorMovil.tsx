'use client';

import * as React from 'react';
import {
    BookOpen,
    Library,
    Calendar,
    MessageSquareText,
    GraduationCap,
} from 'lucide-react';
import { InicioMovil, type AccesoMovilItem } from './InicioMovil';
import { tarjetasDelProfesor, elCiclo, cuantos } from './cifras-del-inicio';
import { LoDeHoy, cuantosHoy } from './LoDeHoy';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import { useTeacherScheduleBlocks, transformScheduleData } from '@/hooks/useSchedules';

export interface DatosDelProfesorMovil {
    teacherId: string;
    teacherName?: string;
    activeAcademicYear?: string | null;
    stats: {
        totalStudents: number;
        totalClassrooms: number;
        pendingGrades: number;
        promedioGeneral?: number | null;
        averageAttendance?: number;
        studentsAtRisk?: number;
        isGuideTeacher?: boolean;
    };
    eventsCalendar?: {
        currentPeriod?: {
            id: string;
            name: string;
            daysLeft: number | null;
        } | null;
        events: Array<{
            id: string;
            title: string;
            date: string;
            startTime?: string | null;
            endTime?: string | null;
            isHoliday?: boolean;
        }>;
    };
    hoyLeido?: string;
    todayStr?: string;
}

export function InicioDelProfesorMovil({ datos }: { datos: DatosDelProfesorMovil }) {
    const { data: blocks } = useTeacherScheduleBlocks(datos.teacherId);
    const schedule = React.useMemo(() => transformScheduleData(blocks as any), [blocks]);

    // Accesos específicos del profesor según el encargo:
    // Académico, Materias, Horarios, Observaciones y «Mi sección guía» (solo si guía alguna).
    const accesos: AccesoMovilItem[] = [
        {
            name: 'Académico',
            href: '/dashboard/academico',
            icon: BookOpen,
        },
        {
            name: 'Materias',
            href: '/dashboard/materias',
            icon: Library,
        },
        {
            name: 'Horarios',
            href: '/dashboard/horarios',
            icon: Calendar,
        },
        {
            name: 'Observaciones',
            href: '/dashboard/observaciones',
            icon: MessageSquareText,
        },
        ...(datos.stats.isGuideTeacher
            ? [
                  {
                      name: 'Mi sección guía',
                      href: '/dashboard/mi-seccion-guia',
                      icon: GraduationCap,
                  },
              ]
            : []),
    ];

    const totalAlumnos = datos.stats.totalStudents || 0;
    const { asistencia: tarjetaAsistencia, riesgo: tarjetaRiesgo } = tarjetasDelProfesor(datos.stats);

    // Eventos de hoy
    const cantEventosHoy = datos.todayStr ? cuantosHoy(datos.eventsCalendar?.events, datos.todayStr) : 0;

    return (
        <InicioMovil
            tituloCifra="Promedio de mis clases"
            cifra={datos.stats.promedioGeneral ?? null}
            sufijoCifra="/ 20"
            etiquetaSecundaria={[
                elCiclo(datos.activeAcademicYear),
                cuantos(totalAlumnos, 'estudiante', 'estudiantes'),
                cuantos(datos.stats.totalClassrooms, 'sección', 'secciones'),
            ].join(' · ')}
            tarjetaIzquierda={tarjetaAsistencia}
            tarjetaDerecha={tarjetaRiesgo}
            accesos={accesos}
            etiquetaAria="Mis clases hoy"
        >
            {/* Horario en vivo del profesor */}
            <div data-recorrido="horario-profesor">
                <StudentScheduleSection
                    schedule={schedule}
                    role="teacher"
                    teacherId={datos.teacherId}
                    titulo={datos.teacherName ? `Horario · ${datos.teacherName}` : 'Mi horario semanal'}
                    subtitulo={datos.activeAcademicYear ? `Ciclo ${datos.activeAcademicYear}` : undefined}
                />
            </div>

            {/* Franja de eventos de hoy */}
            <LoDeHoy
                cantidad={cantEventosHoy}
                una="evento"
                varias="eventos"
                detalle={[datos.hoyLeido, datos.eventsCalendar?.currentPeriod?.name].filter(Boolean).join(' · ')}
            />
        </InicioMovil>
    );
}
