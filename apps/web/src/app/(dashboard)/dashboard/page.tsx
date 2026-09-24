'use client';

import { Card } from '@/components/ui';
import { CifraCompacta, RejillaDeCifras, type ColorDeCifra } from '@/components/dashboard/CifraCompacta';
import { AccesosDelLiceo } from '@/components/dashboard/AccesosDelLiceo';
import { TrendChart, StatusBadge } from '@/components/dashboard';
import { useAuthStore } from '@/store/auth.store';
import { useQuienSoy } from '@/hooks/useQuienSoy';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { usePagosActivos } from '@/hooks/usePagos';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { PagosDelRepresentante } from '@/components/pagos/PagosDelRepresentante';
import MiDiaDeClases from '@/components/dashboard/MiDiaDeClases';
import MisRepresentados from '@/components/dashboard/MisRepresentados';
import {
    Users,
    TrendingUp,
    Clock,
    AlertTriangle,
    BookOpen,
    Calendar,
    GraduationCap,
    School,
    type LucideIcon,
} from 'lucide-react';

// Tipos para el dashboard de admin
interface AdminDashboardData {
    kpis: {
        totalStudents: number;
        totalTeachers: number;
        totalClassrooms: number;
        activeAcademicYear: string | null;
    };
    stats: {
        averageAttendance: number;
        studentsAtRisk: number;
        pendingActivities: number;
    };
}

// Tipos para el dashboard de estudiante
interface StudentDashboardData {
    student?: {
        id: string;
        fullName: string;
        currentSection?: { id: string; name: string; academicYearName?: string | null } | null;
    };
    kpis: {
        globalAverage: number;
        failedSubjects: number;
        attendancePercentage: number;
        totalObservations: number;
    };
    subjects: Array<{
        id: string;
        name: string;
        average: number;
        color: string;
        status: string;
    }>;
    periodAverages: Array<{
        periodId: string;
        periodName: string;
        average: number;
    }>;
}

// Lo que el servidor le da a un profesor: lo suyo, no lo del liceo entero.
interface TeacherDashboardData {
    classrooms: Array<{ id: string; name: string; studentCount: number }>;
    upcomingActivities: Array<{ id: string; title: string; dueDate: string }>;
    stats: {
        totalStudents: number;
        totalClassrooms: number;
        pendingGrades: number;
    };
}

interface Cifra {
    titulo: string;
    valor: number | string;
    icono: LucideIcon;
    color: ColorDeCifra;
    pie?: string;
}

/**
 * LA FECHA LA PONE EL SERVIDOR
 *
 * Aquí se escribía `new Date()`: el reloj del teléfono. Se cambia a mano en
 * dos toques, y una VPN mueve la zona horaria sola. La regla de la casa es que
 * la hora del liceo la dice el liceo (`useSchoolToday`, `GET /api/time`).
 *
 * La fecha llega como «2026-09-21». Pasarla por `new Date('2026-09-21')` la
 * lee en UTC y en Venezuela sale el día anterior; por eso se parte a mano.
 */
function comoSeLeeLaFecha(ymd: string, corta = false): string {
    const [a, m, d] = ymd.split('-').map(Number);
    if (!a || !m || !d) return '';
    return new Date(a, m - 1, d).toLocaleDateString(
        'es-VE',
        corta
            ? { weekday: 'short', day: 'numeric', month: 'short' }
            : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    );
}

export default function DashboardPage() {
    const { user } = useAuthStore();
    // El rol lo dice el servidor: en la primera pintada el almacén del
    // navegador todavía está vacío y un alumno pasaba por personal.
    const { yo } = useQuienSoy();
    const rol = yo?.role;
    const esFamilia = rol === 'STUDENT' || rol === 'TUTOR';
    const hoy = useSchoolToday();
    const { data: pagos } = usePagosActivos();

    const { data: studentStats, isLoading: isLoadingStudent } = useQuery({
        queryKey: ['studentDashboard'],
        queryFn: () => api.get<{ data: StudentDashboardData }>('/students/my-dashboard').then(res => res.data.data),
        enabled: rol === 'STUDENT',
        retry: false,
    });

    /**
     * CADA UNO PIDE LO SUYO
     *
     * Esta pantalla pedía `/dashboard/admin` también para el profesor, y el
     * servidor —con razón— respondía 403: esos números son del liceo entero.
     * No se veía porque el rol se leía del almacén del navegador y en la
     * primera pintada estaba vacío, así que muchas veces la petición ni salía.
     * Al preguntarle el rol al servidor (`useQuienSoy`), el 403 salió a la luz.
     *
     * El profesor tiene su propia ruta, con lo que sí es suyo: sus alumnos,
     * sus secciones y lo que le falta por calificar.
     */
    const { data: adminData, isLoading: isLoadingAdmin } = useQuery({
        queryKey: ['adminDashboard'],
        queryFn: async () => {
            const response = await api.get<{ data: AdminDashboardData }>('/dashboard/admin');
            return response.data.data;
        },
        enabled: rol === 'ADMIN',
        staleTime: 2 * 60 * 1000,
    });

    const { data: teacherData, isLoading: isLoadingTeacher } = useQuery({
        queryKey: ['teacherDashboard'],
        queryFn: async () => {
            const response = await api.get<{ data: TeacherDashboardData }>('/dashboard/teacher');
            return response.data.data;
        },
        enabled: rol === 'TEACHER',
        staleTime: 2 * 60 * 1000,
    });

    // Datos de evolución REALES: promedio del estudiante por lapso (calculado en el backend)
    const evolutionData = (studentStats?.periodAverages ?? []).map((p) => ({
        label: p.periodName,
        value: p.average,
    }));

    const cargandoCifras =
        rol === 'STUDENT' ? isLoadingStudent : rol === 'TEACHER' ? isLoadingTeacher : isLoadingAdmin;

    const cifras: Cifra[] = (() => {
        if (rol === 'STUDENT' && studentStats) {
            return [
                { titulo: 'Promedio General', valor: studentStats.kpis.globalAverage.toFixed(1), icono: TrendingUp, color: 'indigo' },
                { titulo: 'Asistencia', valor: `${studentStats.kpis.attendancePercentage}%`, icono: Clock, color: 'cian' },
                { titulo: 'Materias en Riesgo', valor: studentStats.kpis.failedSubjects, icono: AlertTriangle, color: 'coral' },
                { titulo: 'Observaciones', valor: studentStats.kpis.totalObservations, icono: BookOpen, color: 'ambar' },
            ];
        }

        if (rol === 'TEACHER' && teacherData) {
            return [
                {
                    titulo: 'Mis estudiantes',
                    valor: teacherData.stats.totalStudents,
                    icono: Users,
                    color: 'indigo',
                    pie: 'En mis secciones',
                },
                {
                    titulo: 'Mis secciones',
                    valor: teacherData.stats.totalClassrooms,
                    icono: School,
                    color: 'cian',
                    pie: 'Donde doy clase',
                },
                {
                    titulo: 'Por calificar',
                    valor: teacherData.stats.pendingGrades,
                    icono: AlertTriangle,
                    color: 'ambar',
                    pie: 'Actividades sin notas',
                },
                {
                    titulo: 'Próximas',
                    valor: teacherData.upcomingActivities.length,
                    icono: Calendar,
                    color: 'menta',
                    pie: 'Actividades por venir',
                },
            ];
        }

        if (rol === 'ADMIN' && adminData) {
            return [
                {
                    titulo: 'Estudiantes',
                    valor: adminData.kpis.totalStudents,
                    icono: Users,
                    color: 'indigo',
                    pie: adminData.kpis.activeAcademicYear || 'Ciclo actual',
                },
                {
                    titulo: 'Asistencia',
                    valor: `${adminData.stats.averageAttendance}%`,
                    icono: GraduationCap,
                    color: 'menta',
                    pie: 'Últimos 30 días',
                },
                {
                    titulo: 'En riesgo',
                    valor: adminData.stats.studentsAtRisk,
                    icono: AlertTriangle,
                    color: 'coral',
                    pie: 'Materias < 10',
                },
                {
                    titulo: 'Profesores',
                    valor: adminData.kpis.totalTeachers,
                    icono: School,
                    color: 'morado',
                    pie: 'Activos',
                },
            ];
        }

        return [];
    })();

    return (
        <div className="space-y-6">
            {/*
                LA CABECERA ES LA FECHA

                Aquí ponía «¡Hola, Nombre! 👋» a `text-3xl` y debajo «Bienvenido
                al panel de control de…». Dos líneas que no dicen nada —quien
                entró ya sabe quién es y dónde está— y que en un teléfono se
                comen lo primero que se ve.
            */}
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-seccion font-bold text-gray-900 sm:text-pantalla">Panel</h1>
                <p className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm sm:text-sm">
                    <Calendar size={16} aria-hidden />
                    {/* En 390 px, «lunes, 21 de septiembre de 2026» se come media
                        cabecera para decir lo mismo que «lun, 21 sept». */}
                    <span className="first-letter:uppercase sm:hidden">{comoSeLeeLaFecha(hoy, true)}</span>
                    <span className="hidden first-letter:uppercase sm:inline">{comoSeLeeLaFecha(hoy)}</span>
                </p>
            </div>

            {/* Los cuatro números, en 2 × 2 en el teléfono. */}
            {(cifras.length > 0 || cargandoCifras) && (
                <RejillaDeCifras>
                    {(cifras.length > 0
                        ? cifras
                        : ([
                              { titulo: ' ', valor: '', icono: Users, color: 'indigo' },
                              { titulo: ' ', valor: '', icono: Users, color: 'menta' },
                              { titulo: ' ', valor: '', icono: Users, color: 'coral' },
                              { titulo: ' ', valor: '', icono: Users, color: 'morado' },
                          ] as Cifra[])
                    ).map((c, i) => (
                        <CifraCompacta
                            key={`${c.titulo}-${i}`}
                            titulo={c.titulo}
                            valor={c.valor}
                            icono={c.icono}
                            color={c.color}
                            pie={c.pie}
                            cargando={cargandoCifras}
                        />
                    ))}
                </RejillaDeCifras>
            )}

            {/* Lo que antes estaba escondido en la cortina lateral. Al personal,
                arriba: es por donde empieza su día. Al alumno y al representante
                les queda un solo acceso (Calendario), y ponerlo delante de SU
                horario y de SUS representados era hacerles bajar para ver lo
                que vinieron a ver: va al final. */}
            {!esFamilia && <AccesosDelLiceo rol={rol} conPagos={Boolean(pagos?.enabled)} />}

            {/* El alumno: su horario de hoy y lo que le falta. */}
            {rol === 'STUDENT' && (
                <MiDiaDeClases
                    studentId={user?.id ?? ''}
                    classroomId={studentStats?.student?.currentSection?.id}
                    nombre={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
                    seccion={studentStats?.student?.currentSection?.name}
                />
            )}

            {/* Representante: sus representados y lo que les falta. */}
            {rol === 'TUTOR' && <MisRepresentados />}

            {/* Representante: estado de pago de sus representados (si el liceo usa pagos) */}
            {rol === 'TUTOR' && <PagosDelRepresentante />}

            {/* Charts Section */}
            {rol === 'STUDENT' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Evolution Chart */}
                    <Card className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <TrendingUp size={20} className="text-blue-600" />
                            Evolución del Promedio
                        </h3>
                        {isLoadingStudent ? (
                            <div className="h-[250px] flex items-center justify-center text-gray-500">
                                Cargando promedios...
                            </div>
                        ) : evolutionData.length > 0 ? (
                            <TrendChart
                                data={evolutionData}
                                type="area"
                                height={250}
                                color="#3b82f6"
                            />
                        ) : (
                            <div className="h-[250px] flex items-center justify-center text-gray-500">
                                Aún no hay calificaciones por lapso
                            </div>
                        )}
                    </Card>

                    {/* Subjects Status */}
                    <Card className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <BookOpen size={20} className="text-purple-600" />
                            Estado de Materias
                        </h3>
                        <div className="space-y-3">
                            {isLoadingStudent ? (
                                <p className="text-gray-500 text-center py-8">Cargando materias...</p>
                            ) : studentStats?.subjects?.length ? (
                                studentStats.subjects.map((subject) => (
                                    <div
                                        key={subject.id}
                                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: subject.color }}
                                            />
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">{subject.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    Promedio: {subject.average.toFixed(1)}
                                                </p>
                                            </div>
                                        </div>
                                        <StatusBadge
                                            status={subject.average >= 10 ? 'approved' : 'failed'}
                                            size="sm"
                                        />
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-500 text-center py-8">
                                    Aún no hay calificaciones registradas
                                </p>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {esFamilia && <AccesosDelLiceo rol={rol} conPagos={Boolean(pagos?.enabled)} />}

            {/*
                AQUÍ HABÍA DOS TARJETAS QUE NO ERAN NADA

                «Horario de Hoy · Calendario interactivo · Próximamente» y
                «Avisos Recientes · No hay avisos recientes», las dos con un
                icono grande y 250 px de alto. En un teléfono eran media
                pantalla de bajar para leer que algo no existe todavía. Cuando
                el calendario del panel y los avisos existan, se pintan con sus
                datos; mientras tanto, no ocupan sitio.
            */}
        </div>
    );
}
