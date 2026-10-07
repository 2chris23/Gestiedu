'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    Check,
    ChevronRight,
    CalendarCheck,
    BookOpen,
    Library,
    Calendar,
    MessageSquareText,
    GraduationCap,
} from 'lucide-react';
import { InicioMovil, type TarjetaMetricaMovil, type AccesoMovilItem } from './InicioMovil';
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

    const asistenciaPct = datos.stats.averageAttendance ?? 0;
    const tarjetaAsistencia: TarjetaMetricaMovil = {
        titulo: 'Asistencia',
        valor: `${asistenciaPct}%`,
        subtitulo: 'Últimos 30 días',
        porcentajeBarra: Math.max(0, Math.min(100, asistenciaPct)),
        colorBarra: 'var(--acento)',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </span>
        ),
        href: '/dashboard/academico',
    };

    const enRiesgo = datos.stats.studentsAtRisk ?? 0;
    const totalAlumnos = datos.stats.totalStudents || 0;
    const tarjetaRiesgo: TarjetaMetricaMovil = {
        titulo: 'En riesgo',
        valor: enRiesgo,
        subtitulo: 'En tus materias',
        porcentajeBarra: totalAlumnos > 0 ? Math.min(100, (enRiesgo / totalAlumnos) * 100) : 0,
        colorBarra: '#EF5350',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EF5350] text-sm font-extrabold text-white" aria-hidden>
                !
            </span>
        ),
        href: '/dashboard/academico',
    };

    // Eventos de hoy
    const eventosHoy = (datos.eventsCalendar?.events || []).filter((e) => {
        if (!datos.todayStr) return false;
        return e.date === datos.todayStr;
    });
    const cantEventosHoy = eventosHoy.length;

    return (
        <InicioMovil
            tituloCifra="Promedio de mis clases"
            cifra={datos.stats.promedioGeneral ?? null}
            sufijoCifra="/ 20"
            etiquetaSecundaria={[
                datos.activeAcademicYear ? `Ciclo ${datos.activeAcademicYear}` : 'Sin ciclo activo',
                `${totalAlumnos} ${totalAlumnos === 1 ? 'estudiante' : 'estudiantes'}`,
                `${datos.stats.totalClassrooms} ${datos.stats.totalClassrooms === 1 ? 'sección' : 'secciones'}`,
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
            <div className="flex items-center gap-3 rounded-[18px] bg-[var(--acento-suave)] py-3 pl-3.5 pr-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                    <CalendarCheck className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-extrabold text-[#0B1B33]">
                        {cantEventosHoy === 0
                            ? 'Nada programado hoy'
                            : `${cantEventosHoy} ${cantEventosHoy === 1 ? 'evento' : 'eventos'} para hoy`}
                    </span>
                    <span className="truncate text-xs font-semibold text-[var(--acento-hondo)] first-letter:uppercase">
                        {[datos.hoyLeido, datos.eventsCalendar?.currentPeriod?.name].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <Link
                    href="/dashboard/eventos"
                    className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-white px-[18px] text-sm font-extrabold text-[#0D47A1]"
                >
                    Ver <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                </Link>
            </div>
        </InicioMovil>
    );
}
