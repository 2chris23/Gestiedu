'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight } from 'lucide-react';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useBoleta } from '@/hooks/useBoleta';
import { useSchoolToday } from '@/hooks/useSchoolTime';
import { useAlumnoSeleccionado } from '@/hooks/useAlumnoSeleccionado';
import { cn } from '@/lib/utils';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';

export default function AcademicoDelAlumno() {
    const router = useRouter();
    const {
        studentId,
        esTutor,
        representados,
        alumnoSeleccionado,
        seleccionarAlumno,
        cargando: cargandoAlumno,
        requiereSeleccion,
    } = useAlumnoSeleccionado();

    // Ciclos escolares del estudiante (el servidor ya filtra solo los suyos)
    const { data: years = [], isLoading: cargandoCiclos } = useAcademicYears();

    const [selectedCycleId, setSelectedCycleId] = React.useState<string>('');

    // Preseleccionar ciclo activo o el primero
    React.useEffect(() => {
        if (years.length > 0 && !selectedCycleId) {
            const activo = years.find((y: any) => y.status === 'ACTIVE' || y.isActive);
            setSelectedCycleId(activo?.id || years[0].id);
        }
    }, [years, selectedCycleId]);

    const selectedCycle = React.useMemo(
        () => years.find((y: any) => y.id === selectedCycleId),
        [years, selectedCycleId]
    );

    // Consultar boleta del estudiante en el ciclo seleccionado
    const { data: boleta, isLoading: cargandoBoleta } = useBoleta(
        studentId || '',
        selectedCycleId || undefined
    );

    // Lapso seleccionado (id del lapso o 'definitivo')
    const [selectedLapsoId, setSelectedLapsoId] = React.useState<string>('');

    const lapsos = boleta?.lapsos ?? [];
    const cicloActivo = Boolean(selectedCycle?.status === 'ACTIVE' || (selectedCycle as any)?.isActive);

    const hoy = useSchoolToday();
    const lapsoEnCurso = React.useMemo(() => {
        if (!lapsos.length) return null;
        const encontrado = lapsos.find((l) => hoy >= l.desde && hoy <= l.hasta);
        return encontrado || lapsos[0];
    }, [lapsos, hoy]);

    // Abrir por defecto en el lapso en curso si el ciclo está activo, o definitivo si está cerrado
    React.useEffect(() => {
        if (!boleta) return;
        if (cicloActivo) {
            const lapsoInicial = lapsoEnCurso?.id || lapsos[0]?.id || 'definitivo';
            setSelectedLapsoId(lapsoInicial);
        } else {
            setSelectedLapsoId('definitivo');
        }
    }, [boleta?.ciclo?.id, cicloActivo, lapsoEnCurso?.id]);

    const esDefinitivo = selectedLapsoId === 'definitivo';
    const lapsoActual = lapsos.find((l) => l.id === selectedLapsoId);

    // Promedio del lapso seleccionado o definitivo
    const promedioActual = esDefinitivo
        ? (boleta?.promedios?.definitivo ?? null)
        : (boleta?.promedios?.[selectedLapsoId] ?? null);

    // Inasistencias del lapso
    const inasistenciasTotal = React.useMemo(() => {
        if (!boleta?.inasistencias) return 0;
        if (esDefinitivo) {
            return Object.values(boleta.inasistencias).reduce(
                (sum, i) => sum + (i?.injustificadas ?? 0) + (i?.justificadas ?? 0),
                0
            );
        }
        const lapsoInasistencias = boleta.inasistencias[selectedLapsoId];
        return (lapsoInasistencias?.injustificadas ?? 0) + (lapsoInasistencias?.justificadas ?? 0);
    }, [boleta, esDefinitivo, selectedLapsoId]);

    const deQuien = esTutor && studentId ? `?alumno=${encodeURIComponent(studentId)}` : '';

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Rendimiento Académico"
                descripcion={
                    esTutor && alumnoSeleccionado
                        ? `Ciclos, materias y calificaciones de ${alumnoSeleccionado.firstName} ${alumnoSeleccionado.lastName}.`
                        : 'Tus ciclos, materias y calificaciones por lapso y ciclo completo.'
                }
            />

            {/* Selector de representados para tutor (solo si tiene más de 1) */}
            {esTutor && representados.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
                    <span className="text-xs font-semibold text-indigo-900">Estudiante:</span>
                    {representados.map((rep) => (
                        <button
                            key={rep.id}
                            type="button"
                            onClick={() => seleccionarAlumno(rep.id)}
                            className={cn(
                                'rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                                rep.id === studentId
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white text-gray-700 hover:bg-white/80'
                            )}
                        >
                            {rep.firstName} {rep.lastName}
                        </button>
                    ))}
                </div>
            )}

            {/* Si el tutor tiene varios representados y no ha elegido ninguno aún */}
            {requiereSeleccion ? (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 p-8 text-center text-sm text-indigo-800">
                    Selecciona un estudiante para consultar su historial académico.
                </div>
            ) : cargandoAlumno || cargandoBoleta || cargandoCiclos ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                    Cargando información académica...
                </div>
            ) : !boleta ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
                    No hay datos académicos disponibles para este ciclo escolar.
                </div>
            ) : (
                <>
                    {/* Selector de años escolares (solo los que cursó) */}
                    {years.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            {years.map((y: any) => (
                                <button
                                    key={y.id}
                                    type="button"
                                    onClick={() => setSelectedCycleId(y.id)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all',
                                        y.id === selectedCycleId
                                            ? 'bg-indigo-700 text-white shadow-sm'
                                            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                    )}
                                >
                                    <Calendar size={16} aria-hidden />
                                    <span>{y.name}</span>
                                    {(y.status === 'ACTIVE' || y.isActive) && (
                                        <span
                                            className={cn(
                                                'rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                                y.id === selectedCycleId
                                                    ? 'bg-indigo-500 text-white'
                                                    : 'bg-emerald-100 text-emerald-800'
                                            )}
                                        >
                                            En curso
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Selector de Lapsos */}
                    <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-gray-100 p-1">
                        {lapsos.map((l, index) => (
                            <button
                                key={l.id}
                                type="button"
                                onClick={() => setSelectedLapsoId(l.id)}
                                className={cn(
                                    'flex-1 min-w-[100px] rounded-xl px-3 py-2 text-center text-xs sm:text-sm font-semibold transition-colors',
                                    selectedLapsoId === l.id
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-gray-700 hover:bg-white/70'
                                )}
                            >
                                {l.nombre || `${index + 1}.er Lapso`}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setSelectedLapsoId('definitivo')}
                            className={cn(
                                'flex-1 min-w-[120px] rounded-xl px-3 py-2 text-center text-xs sm:text-sm font-semibold transition-colors',
                                esDefinitivo
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-gray-700 hover:bg-white/70'
                            )}
                        >
                            Ciclo completo
                        </button>
                    </div>

                    {/* Ficha métrica del lapso */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                            <span className="text-xs font-semibold text-gray-500">
                                {esDefinitivo
                                    ? cicloActivo
                                        ? 'Promedio hasta hoy'
                                        : 'Promedio definitivo'
                                    : lapsoActual?.nombre
                                      ? `Promedio ${lapsoActual.nombre}`
                                      : 'Promedio del lapso'}
                            </span>
                            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                                {promedioActual !== null ? Number(promedioActual).toFixed(1) : '—'}
                            </p>
                            <span className="text-[11px] text-gray-400">
                                {esDefinitivo
                                    ? cicloActivo
                                        ? 'Acumulado hasta el momento'
                                        : 'Definitiva del ciclo'
                                    : lapsoActual?.nombre
                                      ? `Oficial ${lapsoActual.nombre} (MPPE)`
                                      : 'Lapso seleccionado'}
                            </span>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                            <span className="text-xs font-semibold text-gray-500">Materias cursadas</span>
                            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                                {boleta.materias.length}
                            </p>
                            <span className="text-[11px] text-gray-400">
                                {boleta.seccion?.grado ? `${boleta.seccion.grado}.º Año ${boleta.seccion.seccion}` : 'Sección'}
                            </span>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                            <span className="text-xs font-semibold text-gray-500">
                                {esDefinitivo && cicloActivo ? 'Van aprobando' : 'Aprobadas'}
                            </span>
                            <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-700">
                                {
                                    boleta.materias.filter((m) => {
                                        if (m.cualitativa) return true;
                                        const n = esDefinitivo ? m.definitiva : m.notas[selectedLapsoId];
                                        return n !== null && n >= (boleta.reglas?.notaMinima ?? 10);
                                    }).length
                                }
                            </p>
                            <span className="text-[11px] text-gray-400">Nota mínima: {boleta.reglas?.notaMinima ?? 10}</span>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
                            <span className="text-xs font-semibold text-gray-500">Inasistencias</span>
                            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                                {inasistenciasTotal}
                            </p>
                            <span className="text-[11px] text-gray-400">
                                {esDefinitivo ? 'Acumuladas en el año' : 'En este lapso'}
                            </span>
                        </div>
                    </div>

                    {/* Lista de materias */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900">
                                Materias ({boleta.materias.length})
                            </h3>
                            <span className="text-xs text-gray-500">Toca una materia para entrar a Mi clase</span>
                        </div>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {boleta.materias.map((materia) => {
                                const nota = esDefinitivo ? materia.definitiva : materia.notas[selectedLapsoId];
                                const esCualitativa = Boolean(materia.cualitativa);
                                const aprobada =
                                    esCualitativa
                                        ? true
                                        : nota !== null
                                          ? nota >= (boleta.reglas?.notaMinima ?? 10)
                                          : null;

                                return (
                                    <button
                                        key={materia.id}
                                        type="button"
                                        onClick={() =>
                                            router.push(`/dashboard/mi-clase/${encodeURIComponent(materia.id)}${deQuien}`)
                                        }
                                        className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-xs transition-all hover:border-indigo-300 hover:shadow-sm"
                                    >
                                        <div className="min-w-0 flex-1 pr-3">
                                            <p className="truncate text-sm font-bold text-gray-900">
                                                {materia.nombre}
                                            </p>
                                            <p className="mt-0.5 text-xs text-gray-500">
                                                {esCualitativa
                                                    ? 'Evaluación cualitativa'
                                                    : esDefinitivo
                                                      ? cicloActivo
                                                          ? 'Nota acumulada'
                                                          : 'Calificación definitiva'
                                                      : `Calificación ${lapsoActual?.nombre || 'Lapso'}`}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-3">
                                            {esCualitativa ? (
                                                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                                                    Cualitativa
                                                </span>
                                            ) : nota !== null ? (
                                                <div className="text-right">
                                                    <span
                                                        className={cn(
                                                            'text-lg font-bold tabular-nums',
                                                            aprobada
                                                                ? 'text-gray-900'
                                                                : 'text-rose-600'
                                                        )}
                                                    >
                                                        {Number(nota).toFixed(1)}
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'block text-[10px] font-semibold uppercase',
                                                            aprobada
                                                                ? 'text-emerald-700'
                                                                : 'text-rose-700'
                                                        )}
                                                    >
                                                        {esDefinitivo && cicloActivo
                                                            ? aprobada
                                                                ? 'Va aprobando'
                                                                : 'En riesgo'
                                                            : aprobada
                                                              ? 'Aprobada'
                                                              : 'Reprobada'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                                                    Sin notas
                                                </span>
                                            )}
                                            <ChevronRight size={18} className="text-gray-400" aria-hidden />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
