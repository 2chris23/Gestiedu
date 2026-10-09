'use client';

import * as React from 'react';
import { Calendar } from 'lucide-react';
import { useAlumnoSeleccionado } from '@/hooks/useAlumnoSeleccionado';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import { transformScheduleData, useClassroomSchedule } from '@/hooks/useSchedules';

export default function HorarioDelAlumno() {
    const {
        studentId,
        esTutor,
        representados,
        alumnoSeleccionado,
        seleccionarAlumno,
        cargando: cargandoAlumno,
        requiereSeleccion,
    } = useAlumnoSeleccionado();

    // Obtener la sección del alumno
    const { data: materiasData, isLoading: cargandoSeccion } = useQuery({
        queryKey: ['misMaterias', studentId],
        queryFn: async () => {
            if (!studentId) return null;
            const res = await api.get(`/students/${studentId}/materias`);
            return res.data;
        },
        enabled: Boolean(studentId),
    });

    const classroomId = materiasData?.seccion?.id;
    const seccionNombre = materiasData?.seccion?.name;

    // Obtener bloques de horario de la sección
    const { data: bloques, isLoading: cargandoHorario } = useClassroomSchedule(classroomId || '');
    const horario = React.useMemo(() => transformScheduleData(bloques as any), [bloques]);

    const isLoading = cargandoAlumno || cargandoSeccion || (Boolean(classroomId) && cargandoHorario);

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Horario de Clases"
                descripcion={
                    esTutor && alumnoSeleccionado
                        ? `Horario de clases de ${alumnoSeleccionado.firstName} ${alumnoSeleccionado.lastName}.`
                        : 'Tu horario semanal de clases en vivo.'
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

            {requiereSeleccion ? (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 p-8 text-center text-sm text-indigo-800">
                    Selecciona un estudiante para consultar su horario de clases.
                </div>
            ) : isLoading ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                    Cargando horario de clases...
                </div>
            ) : !classroomId ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
                    <Calendar className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden />
                    <p className="text-sm font-medium text-gray-900">No hay sección asignada</p>
                    <p className="mt-1 text-xs text-gray-500">
                        El estudiante no está inscrito en ninguna sección activa en este momento.
                    </p>
                </div>
            ) : (
                <StudentScheduleSection
                    schedule={horario}
                    role="student"
                    classroomId={classroomId}
                    alumnoId={studentId}
                    titulo={alumnoSeleccionado ? `Horario · ${alumnoSeleccionado.firstName}` : 'Mi horario'}
                    subtitulo={seccionNombre || undefined}
                />
            )}
        </div>
    );
}
