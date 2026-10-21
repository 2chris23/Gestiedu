'use client';

import * as React from 'react';
import { Check, ArrowUp, ArrowDown, Minus, Trophy } from 'lucide-react';
import { usePuntajeDelAlumno } from '@/hooks/useCuadroDeHonor';
import type { TarjetaMetricaMovil } from './InicioMovil';

/**
 * LAS CIFRAS DEL INICIO, UNA SOLA VEZ (octubre 2026)
 *
 * El Inicio del teléfono (`InicioDel…Movil`) y la franja azul del ordenador
 * (`FranjaDelInicio`) enseñan las mismas cifras. Cada uno las contaba por su
 * lado; dos cuentas de lo mismo se separan a la primera y ninguna da error:
 * simplemente el teléfono y el ordenador dicen cosas distintas.
 */

const CIRCULO = 'flex h-[30px] w-[30px] items-center justify-center rounded-full';

export function iconoDeAsistencia(): React.ReactNode {
    return (
        <span className={`${CIRCULO} bg-[var(--acento)] text-[var(--sobre-acento)]`}>
            <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden />
        </span>
    );
}

export function iconoDeRiesgo(): React.ReactNode {
    return (
        <span className={`${CIRCULO} bg-[#EF5350] text-sm font-extrabold text-white`} aria-hidden>
            !
        </span>
    );
}

/** El tercer círculo del ordenador: azul claro sobre azul, como el diseño. */
export function iconoClaro(Icono: React.ComponentType<{ className?: string; strokeWidth?: number }>): React.ReactNode {
    return (
        <span className={`${CIRCULO} bg-cabecera-celeste text-cabecera-sobreceleste`}>
            <Icono className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </span>
    );
}

export function tarjetaDeAsistencia(porcentaje: number, subtitulo: string, href?: string, titulo = 'Asistencia'): TarjetaMetricaMovil {
    return {
        titulo,
        valor: `${porcentaje}%`,
        subtitulo,
        porcentajeBarra: Math.max(0, Math.min(100, porcentaje)),
        colorBarra: 'var(--acento)',
        icono: iconoDeAsistencia(),
        href,
    };
}

export function tarjetaDeRiesgo(valor: number, porcentajeBarra: number, subtitulo: string, href?: string): TarjetaMetricaMovil {
    return {
        titulo: 'En riesgo',
        valor,
        subtitulo,
        porcentajeBarra: Math.max(0, Math.min(100, porcentajeBarra)),
        colorBarra: '#EF5350',
        icono: iconoDeRiesgo(),
        href,
    };
}

/** «Ciclo 2026-2027», o que no hay ciclo activo. */
export function elCiclo(ciclo: string | null | undefined): string {
    return ciclo ? `Ciclo ${ciclo}` : 'Sin ciclo activo';
}

export function cuantos(n: number, uno: string, varios: string): string {
    return `${n} ${n === 1 ? uno : varios}`;
}

/** El profesor: la asistencia de sus clases y los alumnos en riesgo en SUS materias. */
export function tarjetasDelProfesor(stats: { totalStudents: number; averageAttendance?: number; studentsAtRisk?: number }) {
    const enRiesgo = stats.studentsAtRisk ?? 0;
    const total = stats.totalStudents || 0;
    return {
        asistencia: tarjetaDeAsistencia(stats.averageAttendance ?? 0, 'Últimos 30 días', '/dashboard/academico'),
        riesgo: tarjetaDeRiesgo(enRiesgo, total > 0 ? (enRiesgo / total) * 100 : 0, 'En tus materias', '/dashboard/academico'),
    };
}

/** El alumno: su asistencia y sus materias reprobadas. */
export function tarjetasDelAlumno(kpis: { attendancePercentage: number; failedSubjects: number }) {
    const reprobadas = kpis.failedSubjects;
    return {
        asistencia: tarjetaDeAsistencia(kpis.attendancePercentage, 'Lapso actual', '/dashboard/horarios'),
        riesgo: tarjetaDeRiesgo(reprobadas, reprobadas > 0 ? 100 : 0, reprobadas === 1 ? '1 materia reprobada' : `${reprobadas} reprobadas`, '/dashboard/materias'),
    };
}

export interface Representado {
    id: string;
    fullName: string;
    avatar: string | null;
    classroom: string | null;
    average: number;
    hasGrades?: boolean;
    attendancePercentage: number;
    relationship: string;
}

/**
 * Lo de los hijos de un representante: el promedio de los que tienen notas,
 * la asistencia media y cuántos van por debajo de 10.
 */
export function cifrasDelRepresentante(hijos: Representado[]) {
    const conNotas = hijos.filter((h) => (h.hasGrades !== undefined ? h.hasGrades : h.average > 0));
    const promedio = conNotas.length > 0 ? Math.round((conNotas.reduce((s, h) => s + h.average, 0) / conNotas.length) * 10) / 10 : null;
    const asistencia = hijos.length > 0 ? Math.round(hijos.reduce((s, h) => s + (h.attendancePercentage || 0), 0) / hijos.length) : 0;
    const enRiesgo = hijos.filter((h) => h.average > 0 && h.average < 10).length;
    return {
        promedio,
        asistencia: tarjetaDeAsistencia(asistencia, 'De tus representados', undefined, 'Asistencia media'),
        riesgo: tarjetaDeRiesgo(enRiesgo, hijos.length > 0 ? (enRiesgo / hijos.length) * 100 : 0, cuantos(enRiesgo, 'representado', 'representados')),
        etiqueta: cuantos(hijos.length, 'representado', 'representados'),
    };
}

/**
 * El puntaje del cuadro de honor del alumno, junto a su promedio (sobre el
 * azul): los puntos, cuántos puestos subió y su puesto SOLO si está entre
 * los 10 primeros (decidido por Cristian).
 */
export function PuntajeEnElAzul({ studentId }: { studentId: string }) {
    const { data } = usePuntajeDelAlumno(studentId);
    const alcance = data?.alcances?.[0];
    const puntaje = alcance?.puntaje;
    const subio = alcance?.subio;
    const puestoAno = alcance?.puestoAno;
    const puestoLiceo = alcance?.puestoLiceo;

    return (
        <div data-recorrido="mi-puntaje" className="flex flex-col items-end gap-1 text-right">
            {puntaje !== undefined && (
                <div className="flex items-center gap-1.5 rounded-full bg-cabecera-texto/20 px-2.5 py-1 text-cabecera-texto backdrop-blur-sm">
                    <Trophy className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                    <span className="text-xs font-extrabold">{puntaje.toFixed(1)} pts</span>
                </div>
            )}
            {subio !== undefined && subio !== null && (
                <div className="flex items-center gap-1 text-xs font-semibold text-cabecera-texto/90">
                    {subio === 0 ? (
                        <>
                            <Minus className="h-3 w-3 text-cabecera-texto/70" aria-hidden />
                            <span>Mismo puesto</span>
                        </>
                    ) : subio > 0 ? (
                        <>
                            <ArrowUp className="h-3 w-3 text-emerald-300" aria-hidden />
                            <span className="text-emerald-300">+{subio} puestos</span>
                        </>
                    ) : (
                        <>
                            <ArrowDown className="h-3 w-3 text-rose-300" aria-hidden />
                            <span className="text-rose-300">{subio} puestos</span>
                        </>
                    )}
                </div>
            )}
            {puestoAno !== undefined && puestoAno <= 10 && (
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-xs font-extrabold text-amber-950">{puestoAno}º de tu año</span>
            )}
            {puestoAno === undefined && puestoLiceo !== undefined && puestoLiceo <= 10 && (
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-xs font-extrabold text-amber-950">{puestoLiceo}º del liceo</span>
            )}
        </div>
    );
}
