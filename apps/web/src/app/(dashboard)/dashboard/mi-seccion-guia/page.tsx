'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import UserAvatar from '@/components/ui/UserAvatar';
import { Users, BookOpen, AlertCircle, Loader2, Sparkles, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuienSoy } from '@/hooks/useQuienSoy';

/**
 * MI SECCIÓN GUÍA
 *
 * Cuadro general de calificaciones para los profesores que guían una o más
 * secciones. Permite ver el rendimiento de todos los alumnos de la sección en
 * todas las materias, por lapso o ciclo completo.
 *
 * Solo lectura: las materias de otros docentes se muestran sin enlaces a clases
 * en vivo ni botones de calificar.
 */

interface ClassroomInfo {
    id: string;
    name: string;
    grade: number;
    section: string;
    shift: string;
    slug?: string;
    studentCount?: number;
    academicYear?: {
        id: string;
        name: string;
        status: string;
    };
}

interface PeriodInfo {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
}

interface SubjectItem {
    id: string;
    name: string;
    code: string;
    color: string;
    slug?: string;
    cualitativa: boolean;
    teacherId: string | null;
    teacherName: string | null;
    esMia: boolean;
    average: number | null;
}

interface StudentGradeItem {
    promedio: number | null;
    conNotas: boolean;
    cualitativa: boolean;
}

interface StudentRow {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    cedula: string;
    avatar: string | null;
    grades: Record<string, StudentGradeItem>;
    generalAverage: number | null;
}

interface CuadroGeneralData {
    classroom: {
        id: string;
        name: string;
        grade: number;
        section: string;
        shift: string;
        teacherName: string | null;
    };
    academicYear: {
        id: string;
        name: string;
        status: string;
        periods: PeriodInfo[];
    };
    periodId: string | null;
    subjects: SubjectItem[];
    students: StudentRow[];
}

export default function MiSeccionGuiaPage() {
    const { yo } = useQuienSoy();
    const [seccionSeleccionada, setSeccionSeleccionada] = React.useState<string>('');
    const [lapsoSeleccionado, setLapsoSeleccionado] = React.useState<string>(''); // vacio = todo el ciclo

    // 1. Obtener secciones que guía
    const {
        data: seccionesData,
        isLoading: cargandoSecciones,
        error: errorSecciones,
    } = useQuery<{ classrooms: ClassroomInfo[] }>({
        queryKey: ['mis-secciones-guia'],
        queryFn: async () => (await api.get('/classrooms/mis-secciones-guia')).data,
    });

    const secciones = seccionesData?.classrooms ?? [];

    // Seleccionar la primera sección automáticamente si no hay ninguna seleccionada
    React.useEffect(() => {
        if (!seccionSeleccionada && secciones.length > 0) {
            setSeccionSeleccionada(secciones[0].id);
        }
    }, [secciones, seccionSeleccionada]);

    // 2. Obtener cuadro general de la sección seleccionada
    const {
        data: cuadroData,
        isLoading: cargandoCuadro,
        error: errorCuadro,
    } = useQuery<{ data: CuadroGeneralData }>({
        queryKey: ['cuadro-general-seccion', seccionSeleccionada, lapsoSeleccionado],
        queryFn: async () =>
            (
                await api.get(`/classrooms/${seccionSeleccionada}/cuadro-general`, {
                    params: { periodId: lapsoSeleccionado || undefined },
                })
            ).data,
        enabled: Boolean(seccionSeleccionada),
    });

    const cuadro = cuadroData?.data;
    const periodos = cuadro?.academicYear?.periods ?? [];

    const seccionActiva = secciones.find((s) => s.id === seccionSeleccionada);

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Mi sección guía"
                descripcion="Cuadro general de calificaciones de tus estudiantes en todas las materias."
            />

            {cargandoSecciones && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    <span className="ml-3 text-sm text-gray-500">Cargando secciones asignadas...</span>
                </div>
            )}

            {!cargandoSecciones && secciones.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                        <Users className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-base font-bold text-gray-900">Sin sección guía asignada</h2>
                    <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
                        Actualmente no tienes ninguna sección asignada como profesor guía. Cuando la coordinación te
                        asigne como guía de un aula, aquí verás el cuadro general de calificaciones de tus alumnos.
                    </p>
                    <div className="mt-6">
                        <Link
                            href="/dashboard/academico"
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
                        >
                            <BookOpen className="h-4 w-4" />
                            Ir a Académico
                        </Link>
                    </div>
                </div>
            )}

            {!cargandoSecciones && secciones.length > 0 && (
                <>
                    {/* Filtros: Selector de sección y Selector de lapso */}
                    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                        {/* Selector de sección (si tiene más de 1) */}
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Sección:</span>
                            {secciones.length === 1 ? (
                                <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-700">
                                    <Users className="h-4 w-4" />
                                    {secciones[0].name}
                                    {secciones[0].academicYear && (
                                        <span className="text-xs font-normal text-indigo-500">
                                            ({secciones[0].academicYear.name})
                                        </span>
                                    )}
                                </span>
                            ) : (
                                <select
                                    value={seccionSeleccionada}
                                    onChange={(e) => setSeccionSeleccionada(e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 focus:border-indigo-500 focus:outline-hidden"
                                >
                                    {secciones.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} {s.academicYear ? `· ${s.academicYear.name}` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Selector de lapso */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Ver:</span>
                            <button
                                type="button"
                                onClick={() => setLapsoSeleccionado('')}
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                                    lapsoSeleccionado === ''
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                )}
                            >
                                Todo el ciclo
                            </button>
                            {periodos.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setLapsoSeleccionado(p.id)}
                                    className={cn(
                                        'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer',
                                        lapsoSeleccionado === p.id
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    )}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Contenido del cuadro general */}
                    {cargandoCuadro && (
                        <div className="flex items-center justify-center py-24">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                            <span className="ml-3 text-sm text-gray-500">Calculando calificaciones de la sección...</span>
                        </div>
                    )}

                    {errorCuadro && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            Error al cargar el cuadro general de calificaciones.
                        </div>
                    )}

                    {!cargandoCuadro && cuadro && (
                        <div className="space-y-4">
                            {/* Resumen superior */}
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
                                    <div className="text-xs font-medium text-gray-500">Estudiantes</div>
                                    <div className="mt-1 text-2xl font-bold text-gray-900">
                                        {cuadro.students.length}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
                                    <div className="text-xs font-medium text-gray-500">Materias</div>
                                    <div className="mt-1 text-2xl font-bold text-gray-900">
                                        {cuadro.subjects.length}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
                                    <div className="text-xs font-medium text-gray-500">Lapso en vista</div>
                                    <div className="mt-1 text-sm font-bold text-indigo-600 truncate">
                                        {lapsoSeleccionado
                                            ? periodos.find((p) => p.id === lapsoSeleccionado)?.name || 'Lapso'
                                            : 'Todo el ciclo escolar'}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
                                    <div className="text-xs font-medium text-gray-500">Profesor guía</div>
                                    <div className="mt-1 text-sm font-bold text-gray-800 truncate">
                                        {cuadro.classroom.teacherName || 'Asignado a ti'}
                                    </div>
                                </div>
                            </div>

                            {/* Tabla Cuadro General */}
                            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-200 bg-gray-50/80 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                                <th className="sticky left-0 z-20 bg-gray-50/95 backdrop-blur-xs px-4 py-3 min-w-[200px]">
                                                    Estudiante
                                                </th>
                                                {cuadro.subjects.map((s) => (
                                                    <th
                                                        key={s.id}
                                                        className="px-3 py-3 text-center min-w-[100px]"
                                                        title={`${s.name} (${s.teacherName || 'Sin docente'})`}
                                                    >
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span
                                                                className="h-2 w-2 rounded-full"
                                                                style={{ backgroundColor: s.color || '#6366f1' }}
                                                            />
                                                            <span className="truncate max-w-[90px]">{s.name}</span>
                                                            {s.esMia && (
                                                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                                                                    Tu materia
                                                                </span>
                                                            )}
                                                        </div>
                                                    </th>
                                                ))}
                                                <th className="sticky right-0 z-20 bg-gray-50/95 backdrop-blur-xs px-4 py-3 text-center min-w-[90px] font-bold text-gray-900 border-l border-gray-200">
                                                    Promedio
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-gray-700">
                                            {cuadro.students.length === 0 ? (
                                                <tr>
                                                    <td
                                                        colSpan={cuadro.subjects.length + 2}
                                                        className="px-4 py-8 text-center text-sm text-gray-400"
                                                    >
                                                        No hay estudiantes inscritos en esta sección.
                                                    </td>
                                                </tr>
                                            ) : (
                                                cuadro.students.map((st) => (
                                                    <tr key={st.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="sticky left-0 z-10 bg-white/95 backdrop-blur-xs px-4 py-3 shadow-xs">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <UserAvatar
                                                                    name={st.name}
                                                                    src={st.avatar || undefined}
                                                                    className="h-7 w-7 shrink-0"
                                                                    initialsClassName="text-xs"
                                                                />
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold text-gray-900 truncate">
                                                                        {st.name}
                                                                    </div>
                                                                    <div className="text-[11px] font-mono text-gray-400">
                                                                        {st.cedula}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        {cuadro.subjects.map((s) => {
                                                            const grade = st.grades[s.id];
                                                            const conNota = grade?.conNotas;
                                                            const val = grade?.promedio;
                                                            const esCuali = s.cualitativa;

                                                            return (
                                                                <td
                                                                    key={s.id}
                                                                    className="px-3 py-3 text-center font-mono text-xs tabular-nums"
                                                                >
                                                                    {esCuali ? (
                                                                        <span className="text-gray-400 italic text-[11px]">
                                                                            Cuali
                                                                        </span>
                                                                    ) : conNota && val !== null ? (
                                                                        <span
                                                                            className={cn(
                                                                                'inline-block rounded-md px-1.5 py-0.5 font-bold',
                                                                                val < 10
                                                                                    ? 'bg-rose-50 text-rose-700'
                                                                                    : val < 15
                                                                                    ? 'bg-amber-50 text-amber-700'
                                                                                    : 'bg-emerald-50 text-emerald-700'
                                                                            )}
                                                                        >
                                                                            {val.toFixed(1)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-300 font-normal">
                                                                            —
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="sticky right-0 z-10 bg-white/95 backdrop-blur-xs px-4 py-3 text-center font-mono text-xs font-bold border-l border-gray-100 shadow-xs">
                                                            {st.generalAverage !== null ? (
                                                                <span
                                                                    className={cn(
                                                                        'inline-block rounded-md px-2 py-0.5 text-xs font-bold',
                                                                        st.generalAverage < 10
                                                                            ? 'bg-rose-100 text-rose-800'
                                                                            : st.generalAverage < 15
                                                                            ? 'bg-amber-100 text-amber-800'
                                                                            : 'bg-emerald-100 text-emerald-800'
                                                                    )}
                                                                >
                                                                    {st.generalAverage.toFixed(1)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-300 font-normal">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {cuadro.students.length > 0 && (
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-200 bg-gray-50/90 font-bold text-xs text-gray-800">
                                                    <td className="sticky left-0 z-20 bg-gray-50/95 backdrop-blur-xs px-4 py-3">
                                                        Promedio de la materia
                                                    </td>
                                                    {cuadro.subjects.map((s) => (
                                                        <td key={s.id} className="px-3 py-3 text-center font-mono">
                                                            {s.average !== null ? (
                                                                <span
                                                                    className={cn(
                                                                        'inline-block rounded-md px-1.5 py-0.5 font-bold',
                                                                        s.average < 10
                                                                            ? 'bg-rose-50 text-rose-700'
                                                                            : s.average < 15
                                                                            ? 'bg-amber-50 text-amber-700'
                                                                            : 'bg-emerald-50 text-emerald-700'
                                                                    )}
                                                                >
                                                                    {s.average.toFixed(1)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-300 font-normal">—</span>
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="sticky right-0 z-20 bg-gray-50/95 backdrop-blur-xs px-4 py-3 text-center border-l border-gray-200">
                                                        —
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
