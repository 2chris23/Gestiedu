'use client';

import * as React from 'react';
import {
    BookOpen,
    Library,
    Calendar,
    ClipboardCheck,
} from 'lucide-react';
import { InicioMovil, type AccesoMovilItem } from './InicioMovil';
import { tarjetasDelAlumno, PuntajeEnElAzul, elCiclo } from './cifras-del-inicio';
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

    const { asistencia: tarjetaAsistencia, riesgo: tarjetaRiesgo } = tarjetasDelAlumno(datos.kpis);

    return (
        <InicioMovil
            tituloCifra="Promedio hasta hoy"
            cifra={datos.kpis.globalAverage}
            sufijoCifra="/ 20"
            etiquetaSecundaria={
                datos.section?.name
                    ? [datos.section.academicYearName ? elCiclo(datos.section.academicYearName) : null, datos.section.name].filter(Boolean).join(' · ')
                    : undefined
            }
            bloqueLateralCifra={<PuntajeEnElAzul studentId={datos.studentId} />}
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
