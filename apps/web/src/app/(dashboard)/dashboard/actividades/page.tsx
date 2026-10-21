'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import ActividadesDelAlumno from '@/components/profile/ActividadesDelAlumno';
import { useAlumnoSeleccionado } from '@/hooks/useAlumnoSeleccionado';
import { cn } from '@/lib/utils';

function ContenidoActividades() {
    const {
        studentId,
        esTutor,
        representados,
        alumnoSeleccionado,
        seleccionarAlumno,
        cargando: cargandoAlumno,
        requiereSeleccion,
    } = useAlumnoSeleccionado();

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Actividades y Evaluaciones"
                descripcion={
                    esTutor && alumnoSeleccionado
                        ? `Actividades de ${alumnoSeleccionado.firstName} ${alumnoSeleccionado.lastName}: lo hecho y lo pendiente.`
                        : 'Lo hecho y lo pendiente: tareas, trabajos y exámenes con sus fechas y calificaciones.'
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
                    Selecciona un estudiante para consultar sus actividades y evaluaciones.
                </div>
            ) : cargandoAlumno ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                    Cargando actividades...
                </div>
            ) : (
                <ActividadesDelAlumno studentId={studentId} titulo="Mis actividades" />
            )}
        </div>
    );
}

export default function ActividadesPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Cargando actividades...</div>}>
            <ContenidoActividades />
        </Suspense>
    );
}
