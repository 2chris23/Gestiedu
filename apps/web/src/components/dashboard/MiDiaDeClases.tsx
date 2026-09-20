'use client';

import * as React from 'react';
import StudentScheduleSection from '@/components/schedule/StudentScheduleSection';
import ActividadesDelAlumno from '@/components/profile/ActividadesDelAlumno';
import { transformScheduleData, useClassroomSchedule } from '@/hooks/useSchedules';

/**
 * EL DÍA DEL ALUMNO, EN SU PANTALLA DE INICIO
 *
 * El alumno entraba y veía cuatro números (promedio, asistencia, materias en
 * riesgo, observaciones) y dos gráficos. Lo que hace falta para ir a clase —a
 * qué hora, de qué, con qué tema y qué hay que llevar— no estaba en ningún
 * sitio: su horario ni siquiera se le podía pedir al servidor.
 *
 * Aquí están las dos cosas: su horario, con el tema y las actividades de cada
 * hora, y la lista de lo que le falta.
 *
 * Solo mira. No hay un botón que escriba: el alumno no sube ni edita nada.
 */
export function MiDiaDeClases({
    studentId,
    classroomId,
    nombre,
    seccion,
}: {
    studentId?: string | null;
    classroomId?: string | null;
    nombre?: string;
    seccion?: string | null;
}) {
    const { data: bloques } = useClassroomSchedule(classroomId || '');
    const horario = React.useMemo(() => transformScheduleData(bloques as any), [bloques]);

    return (
        <div className="space-y-6">
            {classroomId && (
                <StudentScheduleSection
                    schedule={horario}
                    role="student"
                    classroomId={classroomId}
                    titulo={nombre ? `Horario · ${nombre}` : 'Mi horario'}
                    subtitulo={seccion || undefined}
                />
            )}
            <ActividadesDelAlumno studentId={studentId} titulo="Mis actividades" />
        </div>
    );
}

export default MiDiaDeClases;
