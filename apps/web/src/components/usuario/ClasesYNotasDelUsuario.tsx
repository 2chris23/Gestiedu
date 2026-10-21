'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PuntajeDelAlumno } from '@/components/profile/PuntajeDelAlumno';
import { Calendar, AlertCircle, GraduationCap, ChevronLeft, Clock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { diferido } from '@/components/common/Diferido';
import { TeacherClass } from './useFichaDelUsuario';
import type { useFichaDelUsuario } from './useFichaDelUsuario';

const StudentCycleAccordion = diferido(() => import('@/components/profile/StudentCycleAccordion'), { alto: 300 });

export function ClasesYNotasDelUsuario({ c }: { c: ReturnType<typeof useFichaDelUsuario> }) {
    const {
        cedula,
        user,
        reglasDeCarga,
        teacherData,
        selectedAcademicYear,
        setSelectedAcademicYear,
        studentAcademicYears,
        filteredClasses,
    } = c;
    // La página no la pinta sin usuario; esto se lo dice también a TypeScript.
    if (!user) return null;

    return (
        <>
            {/* Right Column: Observations & Classes */}
            <div className="lg:col-span-2 space-y-6 animate-in slide-in-from-right duration-500 delay-150">
                {/* Teacher Classes Card - Agrupado por Años Escolar con Promedios y Desplegables de Secciones */}
                {user.role === 'teacher' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <GraduationCap size={20} className="text-indigo-600" />
                                    Rendimiento y Clases por Año
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Selecciona un año para ver sus secciones y acceder directamente al plan de la materia
                                </p>
                            </div>
                            {teacherData.academicYears.length > 0 && (
                                <Select
                                    value={selectedAcademicYear || undefined}
                                    onValueChange={setSelectedAcademicYear}
                                >
                                    <SelectTrigger className="min-w-[170px] bg-gray-50 border-gray-200">
                                        <SelectValue placeholder="Ciclo escolar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teacherData.academicYears.map((year) => (
                                            <SelectItem key={year.id} value={year.id}>
                                                {year.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Resumen Global de Carga Horaria Docente (30-40h semanales) */}
                        {(() => {
                            // El rango recomendado es del liceo (`academicConfig.cargaHoraria`, 30 a 40 por defecto).
                            const { minimo, maximo } = reglasDeCarga;
                            const totalHours = filteredClasses.reduce((sum, c) => sum + (c.hoursPerWeek || 0), 0);
                            const totalBlocks = filteredClasses.reduce((sum, c) => sum + (c.weeklyBlocks || 0), 0);
                            const sinHoras = filteredClasses.filter((c) => !c.hoursPerWeek).length;
                            const isNearLimit = totalHours >= minimo && totalHours <= maximo;
                            const isOverLimit = totalHours > maximo;
                            const percentage = maximo > 0 ? Math.min(Math.round((totalHours / maximo) * 100), 100) : 0;

                            return (
                                <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-2xs space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                                <Calendar className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                    Carga Horaria Semanal
                                                </h4>
                                                <p className="text-sm font-black text-gray-900">
                                                    {totalHours.toFixed(1)}h / semana <span className="text-xs font-normal text-gray-500">({totalBlocks} bloques)</span>
                                                </p>
                                            </div>
                                        </div>
                                        <span className={cn(
                                            "text-xs font-bold px-2.5 py-1 rounded-full border",
                                            isOverLimit
                                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                                : isNearLimit
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        )}>
                                            {isOverLimit ? `Sobrecarga (+${maximo}h)` : isNearLimit ? `En el rango (${minimo}-${maximo}h)` : `Por debajo (<${minimo}h)`}
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-gray-500 font-medium">
                                            <span>
                                                Recomendado por el liceo: {minimo} a {maximo} horas{sinHoras > 0 ? ` · ${sinHoras} sin horas puestas` : ''} ·{' '}
                                                <Link href={`/dashboard/profesores/${encodeURIComponent(cedula)}`} className="font-semibold text-indigo-700 hover:underline">
                                                    Sus horas en Profesores
                                                </Link>
                                            </span>
                                            <span className="font-bold">{percentage}% de jornada máx.</span>
                                        </div>
                                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-500",
                                                    isOverLimit ? "bg-rose-500" : isNearLimit ? "bg-emerald-500" : "bg-indigo-600"
                                                )}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Acordeón / Tarjetas por Grado (Año) */}
                        <div className="space-y-3">
                            {(() => {
                                // Agrupar clases por Grado (1er Año, 2do Año...)
                                const groupedByGrade: Record<number, { gradeName: string; classes: TeacherClass[]; sumAvg: number; count: number; totalHours: number }> = {};
                                const gradeLabels: Record<number, string> = {
                                    1: 'Primer Año',
                                    2: 'Segundo Año',
                                    3: 'Tercer Año',
                                    4: 'Cuarto Año',
                                    5: 'Quinto Año'
                                };

                                filteredClasses.forEach((cls) => {
                                    const g = cls.grade || 1;
                                    if (!groupedByGrade[g]) {
                                        groupedByGrade[g] = {
                                            gradeName: gradeLabels[g] || `${g}º Año`,
                                            classes: [],
                                            sumAvg: 0,
                                            count: 0,
                                            totalHours: 0
                                        };
                                    }
                                    groupedByGrade[g].classes.push(cls);
                                    if (typeof cls.average === 'number') {
                                        groupedByGrade[g].sumAvg += cls.average;
                                        groupedByGrade[g].count += 1;
                                    }
                                    groupedByGrade[g].totalHours += cls.hoursPerWeek || 0;
                                });

                                const gradesList = Object.keys(groupedByGrade).map(Number).sort((a, b) => a - b);

                                if (gradesList.length === 0) {
                                    return (
                                        <div className="text-center py-10">
                                            <p className="text-gray-400 italic text-sm">
                                                No se encontraron clases asignadas para este ciclo escolar.
                                            </p>
                                        </div>
                                    );
                                }

                                return gradesList.map((g) => {
                                    const group = groupedByGrade[g];
                                    const gradeAvg = group.count > 0 ? (group.sumAvg / group.count).toFixed(1) : null;

                                    return (
                                        <div key={g} className="border border-gray-200/80 rounded-xl overflow-hidden shadow-2xs transition-all">
                                            <div className="bg-gradient-to-r from-gray-50 to-indigo-50/30 px-4 py-3.5 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                                                        {g}º
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-gray-900">{group.gradeName}</h4>
                                                        <span className="text-xs text-gray-500 font-medium">
                                                            {group.classes.length} {group.classes.length === 1 ? 'Sección' : 'Secciones'} • {group.totalHours.toFixed(1)}h / sem
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block">
                                                            Promedio Alumnos
                                                        </span>
                                                        <span className="text-sm font-black text-indigo-600">
                                                            {gradeAvg ? `${gradeAvg} pts` : '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Lista de Secciones y Materias asociadas con Link directo */}
                                            <div className="p-3 bg-white grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                                {group.classes.map((c, cIdx) => (
                                                    <Link
                                                        key={cIdx}
                                                        href={`/dashboard/academico/${c.academicYearName}/${c.classroomSlug}`}
                                                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-indigo-50/60 hover:border-indigo-200 transition-all group"
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-sm text-gray-800 group-hover:text-indigo-600 transition-colors">
                                                                    {c.classroom}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-semibold text-gray-600">
                                                                {c.subject}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                                                <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-indigo-700 font-semibold inline-flex items-center gap-1">
                                                                    <Clock size={11} /> {c.hoursPerWeek ? `${c.hoursPerWeek.toFixed(1)}h/sem` : 'sin horas'}
                                                                </span>
                                                                {(c.weeklyBlocks ?? 0) > 0 && <span>({c.weeklyBlocks} bloques)</span>}
                                                            </div>
                                                        </div>

                                                        <div className="text-right flex items-center gap-2">
                                                            <div>
                                                                {/* Sin notas, lo dice: antes enseñaba un 16.5
                                                                    inventado, que en la ficha parecía su promedio. */}
                                                                {typeof c.average === 'number' && c.average > 0 ? (
                                                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 block">
                                                                        {c.average.toFixed(1)} pts
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200 block">
                                                                        Sin notas
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180 group-hover:translate-x-1 transition-all group-hover:text-indigo-600" />
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}
                {/* Su puntaje del cuadro de honor y cuántos puestos subió (2026-10-04). */}
                {user.role === 'student' && <PuntajeDelAlumno studentId={user.cedula} />}
                {/* Rendimiento Académico en Acordeones por Ciclo Escolar */}
                {user.role === 'student' && (
                    <div className="animate-in fade-in duration-700 delay-300">
                        {studentAcademicYears.length > 0 ? (
                            <StudentCycleAccordion
                                studentId={user.cedula}
                                studentName={user.name}
                                cycles={studentAcademicYears}
                                initialOpenCycleId={null}
                            />
                        ) : (
                            <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center">
                                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <AlertCircle size={32} className="text-gray-400" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-600 mb-2">Estudiante Sin Asignar</h3>
                                <p className="text-gray-500 text-sm">Este estudiante aún no ha sido inscrito en ninguna sección.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
