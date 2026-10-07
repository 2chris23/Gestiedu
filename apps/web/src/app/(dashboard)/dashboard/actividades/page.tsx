'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import ActividadesDelAlumno from '@/components/profile/ActividadesDelAlumno';
import { useQuienSoy } from '@/hooks/useQuienSoy';

function ContenidoActividades() {
    const searchParams = useSearchParams();
    const alumnoQuery = searchParams.get('alumno');
    const { yo } = useQuienSoy();
    const studentId = alumnoQuery || (yo?.role === 'STUDENT' ? yo.id : undefined);

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Actividades y Evaluaciones"
                descripcion="Lo hecho y lo pendiente: tareas, trabajos y exámenes con sus fechas y calificaciones."
            />
            <ActividadesDelAlumno studentId={studentId} titulo="Mis actividades" />
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
