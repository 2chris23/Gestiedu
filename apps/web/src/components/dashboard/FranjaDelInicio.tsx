'use client';

import * as React from 'react';
import { Calendar, Eye, EyeOff, GraduationCap, ClipboardList, MessageSquareText } from 'lucide-react';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useInicioDelAdmin, useInicioDelProfesor, useInicioDelAlumno, useInicioDelRepresentante } from '@/hooks/useInicio';
import { TarjetaMetrica, usePromedioOculto, laCifraComoSeLee, type TarjetaMetricaMovil } from './InicioMovil';
import {
    tarjetaDeAsistencia,
    tarjetaDeRiesgo,
    tarjetasDelProfesor,
    tarjetasDelAlumno,
    cifrasDelRepresentante,
    iconoClaro,
    elCiclo,
    cuantos,
    PuntajeEnElAzul,
} from './cifras-del-inicio';

/**
 * EL AZUL DEL INICIO, EN EL ORDENADOR (octubre 2026)
 *
 * El promedio y las cifras van sobre el marco azul, como en el teléfono, y la
 * hoja clara empieza debajo. Lo pinta el ARMAZÓN (`DashboardShell`, solo en
 * `/dashboard`), no la página: la hoja tiene que empezar después del
 * promedio, y las otras dos formas fallaban —salirse de la hoja con márgenes
 * negativos pide `container-type`, que encierra las ventanas `fixed` dentro
 * de la hoja; un portal deja la franja vacía en el HTML del servidor y al
 * arrancar todo salta—. Es lo mismo que hace `CabeceraMovil` en el teléfono.
 *
 * Las consultas son las de la página (`hooks/useInicio.ts`, misma llave): una
 * sola petición. Las cifras, las del teléfono (`cifras-del-inicio.tsx`).
 */

interface LoQueSeVe {
    titulo: string;
    cifra: number | null;
    etiqueta?: string;
    alLado?: React.ReactNode;
    tarjetas: TarjetaMetricaMovil[];
    aria: string;
}

function useLoQueSeVe(): LoQueSeVe | null | 'cargando' {
    const { yo, cargando } = useQuienSoy();
    const rol = yo?.role;
    const admin = useInicioDelAdmin(rol === 'ADMIN');
    const profesor = useInicioDelProfesor(rol === 'TEACHER');
    const alumno = useInicioDelAlumno(rol === 'STUDENT');
    const representante = useInicioDelRepresentante(rol === 'TUTOR');

    if (cargando || !rol) return 'cargando';

    if (rol === 'ADMIN') {
        const d = admin.data;
        if (!d) return admin.isError ? null : 'cargando';
        return {
            titulo: 'Promedio general',
            cifra: d.stats.promedioGeneral ?? null,
            etiqueta: [elCiclo(d.kpis.activeAcademicYear), cuantos(d.kpis.totalStudents, 'estudiante', 'estudiantes')].join(' · '),
            tarjetas: [
                tarjetaDeAsistencia(d.stats.averageAttendance, 'Últimos 30 días', '/dashboard/academico'),
                tarjetaDeRiesgo(
                    d.stats.studentsAtRisk,
                    d.kpis.totalStudents > 0 ? (d.stats.studentsAtRisk / d.kpis.totalStudents) * 100 : 0,
                    'Con materias reprobadas',
                    '/dashboard/academico'
                ),
                {
                    titulo: 'Profesores',
                    valor: d.kpis.totalTeachers,
                    subtitulo: 'Activos',
                    icono: iconoClaro(GraduationCap),
                    href: '/dashboard/usuarios',
                },
            ],
            aria: 'El liceo hoy',
        };
    }

    if (rol === 'TEACHER') {
        const d = profesor.data;
        if (!d) return profesor.isError ? null : 'cargando';
        const { asistencia, riesgo } = tarjetasDelProfesor(d.stats);
        return {
            titulo: 'Promedio de mis clases',
            cifra: d.stats.promedioGeneral ?? null,
            etiqueta: [
                elCiclo(d.activeAcademicYear),
                cuantos(d.stats.totalStudents || 0, 'estudiante', 'estudiantes'),
                cuantos(d.stats.totalClassrooms, 'sección', 'secciones'),
            ].join(' · '),
            tarjetas: [
                asistencia,
                riesgo,
                {
                    titulo: 'Por calificar',
                    valor: d.stats.pendingGrades,
                    subtitulo: 'Actividades sin notas',
                    icono: iconoClaro(ClipboardList),
                },
            ],
            aria: 'Mis clases hoy',
        };
    }

    if (rol === 'STUDENT') {
        const d = alumno.data;
        if (!d) return alumno.isError ? null : 'cargando';
        const { asistencia, riesgo } = tarjetasDelAlumno(d.kpis);
        const seccion = d.student?.currentSection;
        return {
            titulo: 'Promedio hasta hoy',
            cifra: d.kpis.globalAverage,
            etiqueta: seccion ? [seccion.academicYearName ? elCiclo(seccion.academicYearName) : null, seccion.name].filter(Boolean).join(' · ') : undefined,
            alLado: yo?.id ? <PuntajeEnElAzul studentId={yo.id} /> : undefined,
            tarjetas: [
                asistencia,
                riesgo,
                {
                    titulo: 'Observaciones',
                    valor: d.kpis.totalObservations,
                    subtitulo: 'Hasta hoy',
                    icono: iconoClaro(MessageSquareText),
                },
            ],
            aria: 'Mi inicio escolar',
        };
    }

    const d = representante.data;
    if (!d) return representante.isError ? null : 'cargando';
    const c = cifrasDelRepresentante(d.children ?? []);
    return {
        titulo: 'Promedio de tus representados',
        cifra: c.promedio,
        etiqueta: c.etiqueta,
        tarjetas: [c.asistencia, c.riesgo],
        aria: 'Inicio del representante',
    };
}

/** «2026-10-12» → «Lunes, 12 de octubre de 2026». La fecha la dice el liceo, no el reloj de aquí. */
function laFechaLeida(ymd: string): string {
    const [a, m, d] = ymd.split('-').map(Number);
    if (!a || !m || !d) return '';
    const texto = new Date(a, m - 1, d).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const PASTILLA = 'self-start rounded-full bg-white/[0.14] px-3.5 py-[7px] text-[13px] font-semibold text-white';

export function FranjaDelInicio() {
    const loQueSeVe = useLoQueSeVe();
    const [oculto, alternar] = usePromedioOculto();
    const fecha = laFechaLeida(useSchoolToday());

    // Sin datos (el servidor falló): la hoja de abajo ya lo dice; aquí, nada.
    if (loQueSeVe === null) return null;
    if (loQueSeVe === 'cargando') return <EsqueletoDeLaFranja />;

    const { titulo, cifra, etiqueta, alLado, tarjetas, aria } = loQueSeVe;
    return (
        <section aria-label={aria} data-diseno="cabecera-azul" className="relative w-full px-5 py-5 lateral:px-6">
            {/* «Panel» no se escribe (lo pidió Cristian): el título es para el lector de pantalla. */}
            <h1 className="sr-only">Panel</h1>
            <div data-recorrido="inicio-cifras" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
                <div className="flex min-w-[240px] flex-col gap-1.5">
                    <button
                        type="button"
                        onClick={alternar}
                        aria-pressed={oculto}
                        className="-ml-1 flex min-h-[36px] items-center gap-1.5 self-start rounded-full px-1 text-[15px] font-semibold text-[#BBDEFB] transition-colors hover:text-white"
                    >
                        {titulo}
                        {oculto ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        <span className="sr-only">{oculto ? '(oculto: pulsa para verlo)' : '(pulsa para ocultarlo)'}</span>
                    </button>
                    <div className="flex items-center gap-6">
                        <p className="text-[56px] font-extrabold leading-none tracking-[-2px] text-white tabular-nums">
                            {laCifraComoSeLee(cifra, oculto)} <span className="text-2xl font-bold tracking-normal text-[#90CAF9]">/ 20</span>
                        </p>
                        {alLado}
                    </div>
                    {etiqueta && <p className={`mt-1 ${PASTILLA}`}>{etiqueta}</p>}
                </div>

                <div className="grid max-w-[728px] flex-[1_1_520px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
                    {tarjetas.map((t) => (
                        <TarjetaMetrica key={t.titulo} tarjeta={t} grande />
                    ))}
                </div>
            </div>
        </section>
    );
}

/** Mientras llegan las cifras: la misma forma, para que la hoja no salte. */
function EsqueletoDeLaFranja() {
    const barra = 'rounded-full bg-white/[0.16] motion-safe:animate-latir';
    return (
        <div className="w-full px-5 py-5 lateral:px-6" aria-busy="true" aria-label="Cargando las cifras">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
                <div className="flex min-w-[240px] flex-col gap-3">
                    <div className={`h-5 w-36 ${barra}`} />
                    <div className={`h-14 w-52 ${barra}`} />
                    <div className={`h-8 w-60 ${barra}`} />
                </div>
                <div className="grid max-w-[728px] flex-[1_1_520px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-[126px] rounded-[22px] border border-white/[0.14] bg-white/10 motion-safe:animate-latir" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default FranjaDelInicio;
