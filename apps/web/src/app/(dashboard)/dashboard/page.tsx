'use client';

import * as React from 'react';
import { InicioDelAdminMovil } from '@/components/dashboard/InicioDelAdminMovil';
import { InicioDelProfesorMovil } from '@/components/dashboard/InicioDelProfesorMovil';
import { InicioDelAlumnoMovil } from '@/components/dashboard/InicioDelAlumnoMovil';
import { InicioDelRepresentanteMovil } from '@/components/dashboard/InicioDelRepresentanteMovil';
import { LoDeHoy, cuantosHoy } from '@/components/dashboard/LoDeHoy';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { CalendarioActividadesWidget, CuadroDeHonorWidget } from '@/components/dashboard/widgets';
import { diferido } from '@/components/common/Diferido';
import { useAuthStore } from '@/store/auth.store';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useInicioDelAdmin, useInicioDelAlumno, useInicioDelProfesor, useInicioDelRepresentante } from '@/hooks/useInicio';
import CargandoDashboard from './loading';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { usePagosActivos } from '@/hooks/usePagos';
import { useTeacherScheduleBlocks, transformScheduleData } from '@/hooks/useSchedules';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import { PagosDelRepresentante } from '@/components/pagos/PagosDelRepresentante';
import MiDiaDeClases from '@/components/dashboard/MiDiaDeClases';
import MisRepresentados from '@/components/dashboard/MisRepresentados';
import CitacionesDelRepresentante from '@/components/dashboard/CitacionesDelRepresentante';
import { LaborSocialDelAlumno } from '@/components/labor-social/LaborSocialDelAlumno';
import { TrendingUp, BookOpen } from 'lucide-react';

// La gráfica (recharts, lo más pesado del Inicio) solo la ve el alumno: baja
// cuando se pinta, no con el Inicio de todos.
const TrendChart = diferido(() => import('@/components/dashboard/TrendChart').then((m) => ({ default: m.TrendChart })), { alto: 250 });

export default function DashboardPage() {
    const { user } = useAuthStore();
    // El rol lo dice el servidor: en la primera pintada el almacén del
    // navegador todavía está vacío y un alumno pasaba por personal.
    const { yo, cargando: cargandoYo } = useQuienSoy();
    const rol = yo?.role;
    const hoy = useSchoolToday();
    const { data: pagos } = usePagosActivos();

    const { data: studentStats, isLoading: isLoadingStudent, isError: isErrorStudent } = useInicioDelAlumno(rol === 'STUDENT');
    const { data: adminData, isLoading: isLoadingAdmin, isError: isErrorAdmin } = useInicioDelAdmin(rol === 'ADMIN');
    const { data: teacherData, isLoading: isLoadingTeacher, isError: isErrorTeacher } = useInicioDelProfesor(rol === 'TEACHER');
    const { data: tutorData, isLoading: isLoadingTutor, isError: isErrorTutor } = useInicioDelRepresentante(rol === 'TUTOR');

    // Datos de evolución REALES: promedio del estudiante por lapso (calculado en el backend)
    const evolutionData = (studentStats?.periodAverages ?? []).map((p) => ({
        label: p.periodName,
        value: p.average,
    }));

    const cargandoCifras =
        rol === 'STUDENT'
            ? isLoadingStudent
            : rol === 'TEACHER'
            ? isLoadingTeacher
            : rol === 'TUTOR'
            ? isLoadingTutor
            : isLoadingAdmin;

    const tieneError =
        (rol === 'ADMIN' && isErrorAdmin) ||
        (rol === 'TEACHER' && isErrorTeacher) ||
        (rol === 'STUDENT' && isErrorStudent) ||
        (rol === 'TUTOR' && isErrorTutor);

    const estaCargando =
        !tieneError &&
        (cargandoYo ||
            !rol ||
            cargandoCifras ||
            (rol === 'ADMIN' && !adminData) ||
            (rol === 'TEACHER' && !teacherData) ||
            (rol === 'STUDENT' && !studentStats) ||
            (rol === 'TUTOR' && !tutorData));

    if (estaCargando) {
        return <CargandoDashboard />;
    }

    const [ah, am, ad] = hoy.split('-').map(Number);
    const hoyLeido =
        ah && am && ad
            ? new Date(ah, am - 1, ad).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
            : '';

    return (
        <div className="space-y-6 lateral:space-y-0 lateral:h-full lateral:flex lateral:flex-col lateral:flex-1 lateral:min-h-0">
            {/* INICIO EN EL TELÉFONO (lateral:hidden): una pieza por rol */}
            {rol === 'ADMIN' && adminData && (
                <InicioDelAdminMovil
                    conPagos={Boolean(pagos?.enabled)}
                    datos={{
                        promedioGeneral: adminData.stats.promedioGeneral ?? null,
                        ciclo: adminData.kpis.activeAcademicYear,
                        estudiantes: adminData.kpis.totalStudents,
                        asistencia: adminData.stats.averageAttendance,
                        enRiesgo: adminData.stats.studentsAtRisk,
                        actividadesDeHoy: cuantosHoy(adminData.eventsCalendar?.events, hoy),
                        hoyLeido,
                        lapso: adminData.eventsCalendar?.currentPeriod?.name ?? null,
                    }}
                />
            )}
            {rol === 'TEACHER' && teacherData && (
                <InicioDelProfesorMovil
                    datos={{
                        teacherId: user?.id ?? '',
                        teacherName: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
                        activeAcademicYear: teacherData.activeAcademicYear,
                        stats: teacherData.stats,
                        eventsCalendar: teacherData.eventsCalendar,
                        hoyLeido,
                        todayStr: hoy,
                    }}
                />
            )}
            {rol === 'STUDENT' && studentStats && (
                <InicioDelAlumnoMovil
                    datos={{
                        studentId: user?.id ?? yo?.id ?? '',
                        studentName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
                        section: studentStats.student?.currentSection,
                        kpis: studentStats.kpis,
                    }}
                />
            )}
            {rol === 'TUTOR' && tutorData && (
                <InicioDelRepresentanteMovil
                    datos={{
                        children: tutorData.children ?? [],
                        conPagos: Boolean(pagos?.enabled),
                    }}
                />
            )}

            {/*
                EN EL ORDENADOR (hidden lateral:block)

                El promedio y las cifras van arriba, sobre el azul
                (`FranjaDelInicio`, la pinta el armazón). Aquí, la hoja de
                debajo. Sin «Ir a»: repetía la barra lateral, que en el
                ordenador está siempre a la vista (lo pidió Cristian).
            */}
            <div className="hidden !mt-0 lateral:flex lateral:flex-col xl:lateral:flex-1 xl:lateral:min-h-0">
                {rol === 'ADMIN' && adminData && (
                    <section aria-label="Lo que viene y el cuadro de honor" className="grid grid-cols-1 items-stretch gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] xl:lateral:flex-1 xl:lateral:min-h-0">
                        <div data-recorrido="calendario-del-liceo" className="h-full min-h-0">
                            <CalendarioActividadesWidget data={adminData.eventsCalendar} className="h-full" />
                        </div>
                        <div data-recorrido="cuadro-de-honor" className="h-full min-h-0">
                            <CuadroDeHonorWidget className="h-full" />
                        </div>
                    </section>
                )}

                {/* El profesor: lo que hay hoy en el liceo y su horario en vivo. */}
                {rol === 'TEACHER' && teacherData && (
                    <>
                        <LoDeHoy
                            cantidad={cuantosHoy(teacherData.eventsCalendar?.events, hoy)}
                            una="evento"
                            varias="eventos"
                            detalle={[hoyLeido, teacherData.eventsCalendar?.currentPeriod?.name].filter(Boolean).join(' · ')}
                        />
                        {/* El horario trae su propia tarjeta. */}
                        <div data-recorrido="horario-profesor">
                            <HorarioDelProfesor
                                teacherId={yo?.id ?? user?.id ?? ''}
                                nombre={user ? `${user.firstName} ${user.lastName}`.trim() : undefined}
                                ciclo={teacherData.activeAcademicYear}
                            />
                        </div>
                    </>
                )}

                {/* El alumno: su día, cómo va y su labor social. */}
                {rol === 'STUDENT' && (
                    <>
                        <div data-recorrido="mi-dia">
                            <MiDiaDeClases
                                studentId={user?.id ?? ''}
                                classroomId={studentStats?.student?.currentSection?.id}
                                nombre={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
                                seccion={studentStats?.student?.currentSection?.name}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <section className={TARJETA} aria-labelledby="evolucion-del-promedio">
                                <h2 id="evolucion-del-promedio" className={TITULO}>
                                    <span className={`${BALDOSA} bg-cabecera-claro text-cabecera-tinta`}>
                                        <TrendingUp className="h-5 w-5" aria-hidden />
                                    </span>
                                    Evolución del promedio
                                </h2>
                                {evolutionData.length > 0 ? (
                                    <TrendChart data={evolutionData} type="area" height={250} color="var(--cab-tinta-hex)" />
                                ) : (
                                    <p className="flex h-[250px] items-center justify-center text-sm text-gray-600">Aún no hay calificaciones por lapso</p>
                                )}
                            </section>
                            <section className={TARJETA} aria-labelledby="estado-de-materias">
                                <h2 id="estado-de-materias" className={TITULO}>
                                    <span className={`${BALDOSA} bg-[var(--acento-suave)] text-[var(--acento-hondo)]`}>
                                        <BookOpen className="h-5 w-5" aria-hidden />
                                    </span>
                                    Estado de materias
                                </h2>
                                {studentStats?.subjects?.length ? (
                                    <ul className="flex flex-col gap-2">
                                        {studentStats.subjects.map((subject) => (
                                            <li key={subject.id} className="flex items-center justify-between gap-3 rounded-2xl bg-superficie-pagina px-3.5 py-2.5">
                                                <span className="flex min-w-0 items-center gap-3">
                                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-bold text-texto-fuerte">{subject.name}</span>
                                                        <span className="block text-xs text-texto-gris">Promedio: {subject.average.toFixed(1)}</span>
                                                    </span>
                                                </span>
                                                <StatusBadge status={subject.average >= 10 ? 'approved' : 'failed'} size="sm" />
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="py-8 text-center text-sm text-gray-600">Aún no hay calificaciones registradas</p>
                                )}
                            </section>
                        </div>
                        {yo?.id && <LaborSocialDelAlumno studentId={yo.id} />}
                    </>
                )}

                {/* El representante: citaciones, sus representados y las cuotas. */}
                {rol === 'TUTOR' && (
                    <>
                        <div className="empty:hidden" data-recorrido="citaciones-del-representante">
                            <CitacionesDelRepresentante />
                        </div>
                        <div className="empty:hidden" data-recorrido="mis-representados">
                            <MisRepresentados />
                        </div>
                        <div className="empty:hidden" data-recorrido="pagos-del-representante">
                            <PagosDelRepresentante />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** Las tarjetas de la hoja, en el ordenador: blancas, sin borde, como las del diseño. */
const TARJETA = 'rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(13,71,161,0.06),0_8px_24px_rgba(13,71,161,0.05)]';
const TITULO = 'mb-5 flex items-center gap-3 text-[17px] font-extrabold text-texto-fuerte';
const BALDOSA = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]';

/** El horario en vivo del profesor (el mismo que en su teléfono). */
function HorarioDelProfesor({ teacherId, nombre, ciclo }: { teacherId: string; nombre?: string; ciclo?: string | null }) {
    const { data: bloques } = useTeacherScheduleBlocks(teacherId);
    const horario = React.useMemo(() => transformScheduleData(bloques as any), [bloques]);
    return (
        <StudentScheduleSection
            schedule={horario}
            role="teacher"
            teacherId={teacherId}
            titulo={nombre ? `Horario · ${nombre}` : 'Mi horario semanal'}
            subtitulo={ciclo ? `Ciclo ${ciclo}` : undefined}
        />
    );
}
