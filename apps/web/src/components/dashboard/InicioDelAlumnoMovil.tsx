'use client';

import * as React from 'react';
import {
    Check,
    ArrowUp,
    ArrowDown,
    Minus,
    Trophy,
    BookOpen,
    Library,
    Calendar,
    ClipboardCheck,
} from 'lucide-react';
import { InicioMovil, type TarjetaMetricaMovil, type AccesoMovilItem } from './InicioMovil';
import { usePuntajeDelAlumno } from '@/hooks/useCuadroDeHonor';
import MiDiaDeClases from '@/components/dashboard/MiDiaDeClases';

export interface DatosDelAlumnoMovil {
    studentId: string;
    studentName?: string;
    section?: {
        id: string;
        name: string;
        academicYearName?: string | null;
    } | null;
    kpis: {
        globalAverage: number;
        failedSubjects: number;
        attendancePercentage: number;
        totalObservations?: number;
    };
}

export function InicioDelAlumnoMovil({ datos }: { datos: DatosDelAlumnoMovil }) {
    const { data: puntajeData } = usePuntajeDelAlumno(datos.studentId);

    // Obtener la información del cuadro de honor más relevante (lapso actual o ciclo)
    const alcanceActivo = puntajeData?.alcances?.[0];
    const puntaje = alcanceActivo?.puntaje;
    const subio = alcanceActivo?.subio;
    const puestoAno = alcanceActivo?.puestoAno;
    const puestoLiceo = alcanceActivo?.puestoLiceo;

    // Accesos del alumno (Fase C):
    // Académico, Materias, Horarios y Actividades
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
            name: 'Actividades',
            href: '/dashboard/actividades',
            icon: ClipboardCheck,
        },
    ];

    const asistencia = datos.kpis.attendancePercentage;
    const tarjetaAsistencia: TarjetaMetricaMovil = {
        titulo: 'Asistencia',
        valor: `${asistencia}%`,
        subtitulo: 'Lapso actual',
        porcentajeBarra: Math.max(0, Math.min(100, asistencia)),
        colorBarra: 'var(--acento)',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[var(--acento)] text-[var(--sobre-acento)]">
                <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </span>
        ),
        href: '/dashboard/horarios',
    };

    const materiasRiesgo = datos.kpis.failedSubjects;
    const tarjetaRiesgo: TarjetaMetricaMovil = {
        titulo: 'En riesgo',
        valor: materiasRiesgo,
        subtitulo: materiasRiesgo === 1 ? '1 materia reprobada' : `${materiasRiesgo} reprobadas`,
        porcentajeBarra: materiasRiesgo > 0 ? 100 : 0,
        colorBarra: '#EF5350',
        icono: (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EF5350] text-sm font-extrabold text-white" aria-hidden>
                !
            </span>
        ),
        href: '/dashboard/materias',
    };

    // Bloque lateral junto a la cifra: puntaje del cuadro de honor, variación y puesto (solo si <= 10)
    const bloqueLateralPuntaje = (
        <div data-recorrido="mi-puntaje" className="flex flex-col items-end gap-1 text-right">
            {puntaje !== undefined && (
                <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-white backdrop-blur-sm">
                    <Trophy className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                    <span className="text-xs font-extrabold">{puntaje.toFixed(1)} pts</span>
                </div>
            )}
            {subio !== undefined && subio !== null && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-white/90">
                    {subio === 0 ? (
                        <>
                            <Minus className="h-3 w-3 text-white/70" />
                            <span>Mismo puesto</span>
                        </>
                    ) : subio > 0 ? (
                        <>
                            <ArrowUp className="h-3 w-3 text-emerald-300" />
                            <span className="text-emerald-300">+{subio} puestos</span>
                        </>
                    ) : (
                        <>
                            <ArrowDown className="h-3 w-3 text-rose-300" />
                            <span className="text-rose-300">{subio} puestos</span>
                        </>
                    )}
                </div>
            )}
            {/* Regla del puesto: Cristian decidió mostrar su puesto SOLO si está entre los 10 primeros */}
            {puestoAno !== undefined && puestoAno <= 10 && (
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-extrabold text-amber-950">
                    {puestoAno}º de tu año
                </span>
            )}
            {puestoAno === undefined && puestoLiceo !== undefined && puestoLiceo <= 10 && (
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-extrabold text-amber-950">
                    {puestoLiceo}º del liceo
                </span>
            )}
        </div>
    );

    return (
        <InicioMovil
            tituloCifra="Promedio general"
            cifra={datos.kpis.globalAverage}
            sufijoCifra="/ 20"
            etiquetaSecundaria={
                datos.section?.name
                    ? [
                          datos.section.academicYearName ? `Ciclo ${datos.section.academicYearName}` : null,
                          datos.section.name,
                      ]
                          .filter(Boolean)
                          .join(' · ')
                    : undefined
            }
            bloqueLateralCifra={bloqueLateralPuntaje}
            tarjetaIzquierda={tarjetaAsistencia}
            tarjetaDerecha={tarjetaRiesgo}
            accesos={accesos}
            etiquetaAria="Mi inicio escolar"
        >
            {/* Slot inferior: Mi Día de Clases con horario y actividades */}
            <div data-recorrido="mi-dia">
                <MiDiaDeClases
                    studentId={datos.studentId}
                    classroomId={datos.section?.id}
                    nombre={datos.studentName}
                    seccion={datos.section?.name}
                />
            </div>
        </InicioMovil>
    );
}
