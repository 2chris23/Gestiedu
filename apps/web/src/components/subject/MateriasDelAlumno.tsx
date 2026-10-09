'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, GraduationCap, User } from 'lucide-react';
import { useAlumnoSeleccionado } from '@/hooks/useAlumnoSeleccionado';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';

interface MateriaItem {
    id: string;
    name: string;
    color: string;
    evaluacion?: 'NUMERICA' | 'CUALITATIVA';
    profesor?: string | null;
}

interface MisMateriasResponse {
    seccion: {
        id: string;
        name: string;
    } | null;
    materias: MateriaItem[];
}

export default function MateriasDelAlumno() {
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

    const { data, isLoading: cargandoMaterias } = useQuery<MisMateriasResponse>({
        queryKey: ['misMaterias', studentId],
        queryFn: async () => {
            if (!studentId) return { seccion: null, materias: [] };
            const res = await api.get(`/students/${studentId}/materias`);
            return res.data;
        },
        enabled: Boolean(studentId),
    });

    const deQuien = esTutor && studentId ? `?alumno=${encodeURIComponent(studentId)}` : '';
    const materias = data?.materias ?? [];
    const seccion = data?.seccion;
    const isLoading = cargandoAlumno || (Boolean(studentId) && cargandoMaterias);

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                titulo="Mis Materias"
                descripcion={
                    esTutor && alumnoSeleccionado
                        ? `Materias de ${alumnoSeleccionado.firstName} ${alumnoSeleccionado.lastName} en el ciclo activo.`
                        : 'Las materias de tu año escolar. Toca una materia para entrar a su clase y ver el plan de evaluación.'
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

            {seccion && !requiereSeleccion && (
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <GraduationCap className="h-5 w-5 text-indigo-600" aria-hidden />
                    <span>Sección: {seccion.name}</span>
                </div>
            )}

            {requiereSeleccion ? (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 p-8 text-center text-sm text-indigo-800">
                    Selecciona un estudiante para consultar sus materias.
                </div>
            ) : isLoading ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
                    Cargando materias...
                </div>
            ) : materias.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
                    <BookOpen className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden />
                    <p className="text-sm font-medium text-gray-900">No hay materias asignadas</p>
                    <p className="mt-1 text-xs text-gray-500">
                        Aún no se han configurado materias para esta sección en el ciclo activo.
                    </p>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {materias.map((materia) => (
                        <button
                            key={materia.id}
                            type="button"
                            onClick={() =>
                                router.push(`/dashboard/mi-clase/${encodeURIComponent(materia.id)}${deQuien}`)
                            }
                            className="group flex min-h-[5.5rem] items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-xs transition-all hover:border-indigo-300 hover:shadow-sm"
                        >
                            <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                                <span
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-xs"
                                    style={{ backgroundColor: materia.color || '#4f46e5' }}
                                >
                                    {materia.name.charAt(0)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-gray-900 group-hover:text-indigo-600">
                                        {materia.name}
                                    </p>
                                    {materia.profesor ? (
                                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                                            <User size={13} className="shrink-0 text-gray-400" aria-hidden />
                                            <span className="truncate">{materia.profesor}</span>
                                        </p>
                                    ) : (
                                        <p className="mt-0.5 text-xs text-gray-400 italic">Sin profesor asignado</p>
                                    )}
                                    {materia.evaluacion === 'CUALITATIVA' && (
                                        <span className="mt-1 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                                            Apreciación
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight
                                size={18}
                                className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600"
                                aria-hidden
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
