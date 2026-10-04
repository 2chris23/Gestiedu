'use client';

import React from 'react';
import Link from 'next/link';
import { Trophy, ChevronRight, Award, Crown, Medal } from 'lucide-react';

export interface StudentHonorItem {
    id: string;
    name: string;
    avatar?: string | null;
    classroomName: string;
    grade?: number | null;
    section?: string | null;
    averageScore: number;
    attendancePercentage: number;
    incidentsCount: number;
    academicScore: number;
    attendanceScore: number;
    penaltyScore: number;
    totalScore: number;
    position: number;
}

interface CuadroDeHonorProps {
    students?: StudentHonorItem[];
}

function getIniciales(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();
}

export function CuadroDeHonorWidget({ students = [] }: CuadroDeHonorProps) {
    // Nunca alumnos de muestra: un nombre inventado en el Inicio del liceo
    // parece un alumno de verdad. Sin datos, se dice que no hay.
    const activeList = students;
    const st1 = activeList[0];
    const st2 = activeList[1];
    const st3 = activeList[2];
    const remainingStudents = activeList.slice(3, 5);

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition-all hover:shadow-sm">
            {/* Cabecera del Widget */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        <Trophy className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">Cuadro de Honor</h3>
                        <p className="text-xs text-gray-500">Estudiantes destacados del ciclo escolar actual</p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                    <Award className="h-3.5 w-3.5" />
                    Base 100 pts
                </span>
            </div>

            {/* Contenido: Podio y Lista */}
            {activeList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-2">
                        <Trophy className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">Calculando Cuadro de Honor</p>
                    <p className="text-xs text-gray-500 max-w-[260px] mt-1">
                        Aún no hay calificaciones consolidadas en el ciclo activo para generar el podio.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* PODIO TOP 3 (2° Plata - 1° Oro - 3° Bronce) */}
                    <div className="grid grid-cols-3 gap-2.5 items-end pt-3 pb-1">
                        {/* 2.° PLATA (Izquierda, altura media) */}
                        {st2 ? (
                            <Link
                                href={`/dashboard/usuarios/${encodeURIComponent(st2.id)}`}
                                className="group relative flex flex-col items-center justify-between rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/70 via-slate-50/20 to-white p-2.5 text-center shadow-2xs transition-all hover:shadow-sm hover:border-slate-300 min-h-[160px] self-end"
                            >
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-800 border border-slate-300">
                                    <Medal className="h-3 w-3 text-slate-500" />
                                    2.° PLATA
                                </span>

                                <div className="my-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-800 font-bold text-xs border border-slate-300 shadow-2xs group-hover:scale-105 transition-transform">
                                    {getIniciales(st2.name)}
                                </div>

                                <div className="w-full min-w-0 px-1">
                                    <p className="truncate text-xs font-bold text-gray-900 group-hover:text-slate-950" title={st2.name}>
                                        {st2.name}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                        {st2.classroomName}
                                    </p>
                                </div>

                                <div className="mt-1 flex items-center justify-center gap-1">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-900">
                                        {st2.totalScore.toFixed(1)} <span className="text-xs font-semibold text-slate-600">pts</span>
                                    </span>
                                </div>
                            </Link>
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/40 p-2.5 text-center min-h-[160px] self-end">
                                <span className="text-xs font-bold text-gray-600">2.° PLATA</span>
                                <span className="text-xs text-gray-600 mt-2">Disponible</span>
                            </div>
                        )}

                        {/* 1.° ORO (Centro, más alto, corona) */}
                        {st1 && (
                            <Link
                                href={`/dashboard/usuarios/${encodeURIComponent(st1.id)}`}
                                className="group relative flex flex-col items-center justify-between rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50/70 via-amber-50/20 to-white p-3 text-center shadow-xs transition-all hover:shadow-md hover:border-amber-400 min-h-[178px] z-10"
                            >
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center">
                                    <Crown className="h-5 w-5 text-amber-500 fill-amber-400 drop-shadow-xs" />
                                </div>

                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900 border border-amber-300 mt-1">
                                    <Trophy className="h-3 w-3 text-amber-600" />
                                    1.° ORO
                                </span>

                                <div className="my-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-900 font-extrabold text-xs border-2 border-amber-300 shadow-2xs group-hover:scale-105 transition-transform">
                                    {getIniciales(st1.name)}
                                </div>

                                <div className="w-full min-w-0 px-1">
                                    <p className="truncate text-xs font-bold text-gray-900 group-hover:text-amber-950" title={st1.name}>
                                        {st1.name}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                        {st1.classroomName}
                                    </p>
                                </div>

                                <div className="mt-1 flex items-center justify-center gap-1">
                                    <span className="rounded-full bg-amber-100/90 px-2.5 py-0.5 text-xs font-extrabold text-amber-950">
                                        {st1.totalScore.toFixed(1)} <span className="text-xs font-semibold text-amber-800">pts</span>
                                    </span>
                                </div>
                            </Link>
                        )}

                        {/* 3.° BRONCE (Derecha, altura más baja) */}
                        {st3 ? (
                            <Link
                                href={`/dashboard/usuarios/${encodeURIComponent(st3.id)}`}
                                className="group relative flex flex-col items-center justify-between rounded-2xl border border-orange-200 bg-gradient-to-b from-orange-50/70 via-orange-50/20 to-white p-2.5 text-center shadow-2xs transition-all hover:shadow-sm hover:border-orange-300 min-h-[152px] self-end"
                            >
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-extrabold text-orange-900 border border-orange-300">
                                    <Medal className="h-3 w-3 text-orange-600" />
                                    3.° BRONCE
                                </span>

                                <div className="my-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-orange-900 font-bold text-xs border border-orange-300 shadow-2xs group-hover:scale-105 transition-transform">
                                    {getIniciales(st3.name)}
                                </div>

                                <div className="w-full min-w-0 px-1">
                                    <p className="truncate text-xs font-bold text-gray-900 group-hover:text-orange-950" title={st3.name}>
                                        {st3.name}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                        {st3.classroomName}
                                    </p>
                                </div>

                                <div className="mt-1 flex items-center justify-center gap-1">
                                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-extrabold text-orange-950">
                                        {st3.totalScore.toFixed(1)} <span className="text-xs font-semibold text-orange-700">pts</span>
                                    </span>
                                </div>
                            </Link>
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/40 p-2.5 text-center min-h-[152px] self-end">
                                <span className="text-xs font-bold text-gray-600">3.° BRONCE</span>
                                <span className="text-xs text-gray-600 mt-2">Disponible</span>
                            </div>
                        )}
                    </div>

                    {/* Puestos 4 y 5 (sin encabezados innecesarios de resto de ranking) */}
                    {remainingStudents.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                            {remainingStudents.map((st) => {
                                const iniciales = getIniciales(st.name);

                                return (
                                    <Link
                                        key={st.id}
                                        href={`/dashboard/usuarios/${encodeURIComponent(st.id)}`}
                                        className="group flex items-center justify-between gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 p-2 hover:bg-gray-100/70 hover:border-gray-200 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {/* Posición circular */}
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200 text-xs font-bold text-gray-600 shadow-2xs">
                                                {st.position}
                                            </span>

                                            {/* Avatar */}
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-700">
                                                {iniciales}
                                            </div>

                                            {/* Nombre y Sección */}
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-bold text-gray-900 group-hover:text-indigo-900">
                                                    {st.name}
                                                </p>
                                                <p className="truncate text-xs text-gray-500">
                                                    {st.classroomName}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Puntaje y desglose */}
                                        <div className="flex items-center gap-2.5 shrink-0">
                                            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                                                <span>Notas: <strong className="text-gray-700">{st.academicScore}/80</strong></span>
                                                <span>Asist: <strong className="text-gray-700">{st.attendancePercentage}%</strong></span>
                                                {st.incidentsCount > 0 && (
                                                    <span className="text-rose-600 font-semibold">-{st.penaltyScore} pts</span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-extrabold text-gray-900">
                                                    {st.totalScore.toFixed(1)} <span className="text-xs font-medium text-gray-500">pts</span>
                                                </span>
                                            </div>
                                            <ChevronRight className="h-3.5 w-3.5 text-gray-600 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Pie Explicativo de la Fórmula */}
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-xs text-gray-500">
                <span className="text-xs text-gray-500">
                    80% Notas + 20% Asistencia − 5 pts por incidente disciplinario
                </span>
                <Link
                    href="/dashboard/academico"
                    className="flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 transition-colors"
                >
                    <span>Ver expedientes</span>
                    <ChevronRight className="h-3 w-3" />
                </Link>
            </div>
        </div>
    );
}

export default CuadroDeHonorWidget;
