'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, UserPlus, AlertCircle, ChevronDown, ChevronUp, User, BookOpen, GraduationCap, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssignSubjectTeacherModal } from './AssignSubjectTeacherModal';
import SubjectSectionStudentsModal from './SubjectSectionStudentsModal';
import UserAvatar from '@/components/ui/UserAvatar';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';

interface Section {
    id: string;
    name: string;
    slug?: string;
    grade?: number;
    weeklyBlocks?: number;
    hoursPerWeek?: number;
    teacher?: {
        id?: string;
        name: string;
        email?: string;
        avatar?: string | null;
    } | null;
    schedule: string;
    average: number;
    studentCount: number;
}

interface DistributionTableProps {
    sections: Section[];
    subjectId: string;
    cycleId?: string;
}

const GRADE_NAMES: Record<number, string> = {
    1: 'Primer Año',
    2: 'Segundo Año',
    3: 'Tercer Año',
    4: 'Cuarto Año',
    5: 'Quinto Año',
};

export function SectionDistributionTable({ sections, subjectId, cycleId = '2025-2026' }: DistributionTableProps) {
    const [assigningSection, setAssigningSection] = useState<Section | null>(null);
    const [viewingStudentsSection, setViewingStudentsSection] = useState<Section | null>(null);
    const [expandedGrades, setExpandedGrades] = useState<Record<number, boolean>>({
        1: true,
        2: true,
        3: true,
        4: true,
        5: true,
    });

    const toggleGrade = (grade: number) => {
        setExpandedGrades(prev => ({
            ...prev,
            [grade]: !prev[grade]
        }));
    };

    // Agrupar secciones por grado
    const sectionsByGrade = useMemo(() => {
        const grouped: Record<number, Section[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        sections.forEach(sec => {
            let grade = sec.grade;
            if (!grade) {
                const match = sec.name.match(/(\d+)/);
                grade = match ? parseInt(match[1], 10) : 1;
            }
            if (grouped[grade]) {
                grouped[grade].push(sec);
            } else {
                grouped[grade] = [sec];
            }
        });

        // Ordenar secciones alfabéticamente (A, B, C, D)
        Object.keys(grouped).forEach(k => {
            grouped[Number(k)].sort((a, b) => a.name.localeCompare(b.name));
        });

        return grouped;
    }, [sections]);

    return (
        <>
            <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
                    <div>
                        <h3 className="text-base font-bold text-gray-900">Distribución por Niveles Académicos</h3>
                        <p className="text-xs text-gray-500">Organización por año y secciones asignadas</p>
                    </div>
                    <span className="bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-lg text-xs border border-indigo-100">
                        {sections.length} Secciones Activas
                    </span>
                </div>

                {[1, 2, 3, 4, 5].map((grade) => {
                    const gradeSections = sectionsByGrade[grade] || [];
                    const isExpanded = expandedGrades[grade] ?? true;
                    const totalStudentsInGrade = gradeSections.reduce((sum, s) => sum + s.studentCount, 0);
                    const teachersAssignedCount = gradeSections.filter(s => !!s.teacher).length;

                    return (
                        <div key={grade} className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden transition-all">
                            {/* Cabecera del Año (Click para colapsar/expandir) */}
                            <button
                                type="button"
                                onClick={() => toggleGrade(grade)}
                                className="w-full px-5 py-4 flex items-center justify-between bg-gray-50/60 hover:bg-gray-100/70 transition-colors border-b border-gray-100 text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                                        {grade}º
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-base">{GRADE_NAMES[grade]}</h4>
                                        <p className="text-xs text-gray-500">
                                            {gradeSections.length} {gradeSections.length === 1 ? 'sección' : 'secciones'} • {totalStudentsInGrade} estudiantes
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "text-xs font-semibold px-2.5 py-1 rounded-full border",
                                        teachersAssignedCount === gradeSections.length && gradeSections.length > 0
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-amber-50 text-amber-700 border-amber-200"
                                    )}>
                                        {teachersAssignedCount}/{gradeSections.length} Docentes asignados
                                    </span>
                                    <div className="p-1 rounded-lg bg-white border border-gray-200 text-gray-400">
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                </div>
                            </button>

                            {/* Secciones del Año */}
                            {isExpanded && (
                                <div className="p-3 sm:p-4">
                                    <TablaAdaptable<(typeof gradeSections)[number]>
                                        datos={gradeSections}
                                        clave={(s) => s.id}
                                        vacio={
                                            <p className="text-cuerpo text-tinta-suave">
                                                No hay secciones creadas para este año en este ciclo.
                                            </p>
                                        }
                                        columnas={[
                                            {
                                                id: 'seccion',
                                                titulo: 'Sección',
                                                principal: true,
                                                celda: (section) => (
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900">{section.name}</p>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setViewingStudentsSection(section);
                                                            }}
                                                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600"
                                                            title="Ver estudiantes y sus notas en esta materia"
                                                        >
                                                            <Users size={12} />
                                                            {section.studentCount} Estudiantes
                                                        </button>
                                                    </div>
                                                ),
                                            },
                                            {
                                                id: 'profesor',
                                                titulo: 'Profesor Titular',
                                                celda: (section) =>
                                                    section.teacher ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setAssigningSection(section)}
                                                            className="flex items-center gap-2.5 text-left"
                                                            title="Cambiar profesor"
                                                        >
                                                            <UserAvatar
                                                                name={section.teacher.name}
                                                                src={section.teacher.avatar}
                                                                className="h-8 w-8 shrink-0"
                                                                initialsClassName="text-xs"
                                                            />
                                                            <span className="min-w-0">
                                                                <span className="block truncate text-xs font-semibold text-gray-800">
                                                                    {section.teacher.name}
                                                                </span>
                                                                <span className="block truncate text-xs text-gray-400">
                                                                    {section.teacher.email}
                                                                </span>
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-rose-100 bg-rose-50 px-2.5 py-1 text-rose-600">
                                                            <AlertCircle size={13} />
                                                            <span className="text-xs font-bold">Sin profesor asignado</span>
                                                        </span>
                                                    ),
                                            },
                                            {
                                                id: 'horas',
                                                titulo: 'Carga Horaria',
                                                celda: (section) => {
                                                    const hours =
                                                        section.hoursPerWeek ?? ((section.weeklyBlocks ?? 4) * 45) / 60;
                                                    const blocks = section.weeklyBlocks ?? 4;
                                                    return (
                                                        <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-200/60 bg-gray-50 px-2.5 py-1 text-gray-700">
                                                            <Clock size={13} className="text-indigo-500" />
                                                            <span className="text-xs font-semibold">{hours.toFixed(1)}h / sem</span>
                                                            <span className="text-xs text-gray-400">({blocks} blq)</span>
                                                        </span>
                                                    );
                                                },
                                            },
                                            {
                                                id: 'promedio',
                                                titulo: 'Promedio',
                                                alinear: 'derecha',
                                                celda: (section) => (
                                                    <button
                                                        type="button"
                                                        onClick={() => setViewingStudentsSection(section)}
                                                        title="Ver notas de los estudiantes"
                                                        className={cn(
                                                            'rounded px-2 py-0.5 text-xs font-bold',
                                                            section.average >= 15
                                                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                : section.average >= 10
                                                                  ? 'border border-amber-200 bg-amber-50 text-amber-700'
                                                                  : 'bg-gray-100 text-gray-600'
                                                        )}
                                                    >
                                                        {section.average > 0 ? `${section.average.toFixed(1)} pts` : '—'}
                                                    </button>
                                                ),
                                            },
                                            {
                                                id: 'accion',
                                                titulo: 'Acción',
                                                acciones: true,
                                                alinear: 'derecha',
                                                celda: (section) =>
                                                    section.teacher ? (
                                                        <span className="flex flex-wrap items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setAssigningSection(section)}
                                                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600"
                                                            >
                                                                <User size={12} />
                                                                Cambiar
                                                            </button>
                                                            <Link
                                                                href={`/dashboard/academico/${cycleId}/${
                                                                    cycleId && section.slug?.endsWith(`-${cycleId}`)
                                                                        ? section.slug.slice(0, -(cycleId.length + 1))
                                                                        : section.slug || section.id
                                                                }/${subjectId}`}
                                                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-indigo-600"
                                                            >
                                                                Ver Detalles
                                                                <ArrowRight size={14} />
                                                            </Link>
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setAssigningSection(section)}
                                                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                                                        >
                                                            <UserPlus size={13} />
                                                            Asignar
                                                        </button>
                                                    ),
                                            },
                                        ]}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Modal de Asignación con cálculo predictivo */}
            {assigningSection && (
                <AssignSubjectTeacherModal
                    sectionId={assigningSection.id}
                    sectionName={assigningSection.name}
                    subjectSlug={subjectId}
                    currentTeacherId={assigningSection.teacher?.id}
                    initialWeeklyBlocks={assigningSection.weeklyBlocks}
                    onClose={() => setAssigningSection(null)}
                />
            )}

            {/* Modal de Estudiantes y Notas de la Materia */}
            {viewingStudentsSection && (
                <SubjectSectionStudentsModal
                    isOpen={Boolean(viewingStudentsSection)}
                    onClose={() => setViewingStudentsSection(null)}
                    section={viewingStudentsSection}
                    subjectId={subjectId}
                    cycleId={cycleId}
                />
            )}
        </>
    );
}
