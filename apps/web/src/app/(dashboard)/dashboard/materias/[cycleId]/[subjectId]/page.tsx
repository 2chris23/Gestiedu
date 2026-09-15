'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useSubject } from '@/hooks/useSubjects';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { SubjectHeader } from '@/components/subject/SubjectHeader';
import { SubjectKPIs } from '@/components/subject/SubjectKPIs';
import { SectionDistributionTable } from '@/components/subject/SectionDistributionTable';
import { TeachersSidebar } from '@/components/subject/TeachersSidebar';
import { Loader2, AlertCircle, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function SubjectDashboard() {
    const params = useParams();
    const subjectId = params.subjectId as string;
    const cycleName = params.cycleId as string; // Nombre del año escolar (ej: '2025-2026')

    // Fetch real subject data from database, passing year name
    const { data: subject, isLoading: subjectLoading, error: subjectError } = useSubject(subjectId, cycleName);
    const { data: academicYears, isLoading: yearsLoading } = useAcademicYears();

    // Determine cycles
    const cycles = academicYears?.map(y => ({
        id: y.id,
        name: y.name,
        status: y.status
    })) || [];

    // Match current cycle by name (from URL) instead of ID
    const currentCycleId = cycles.find(c => c.name === cycleName)?.id || cycleName;

    // Loading state
    if (subjectLoading || yearsLoading) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                    <p className="text-gray-600">Cargando información de la materia...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (subjectError || !subject) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Materia no encontrada</h2>
                    <p className="text-gray-600 mb-6">
                        La materia que buscas no existe o fue eliminada.
                    </p>
                    <Link
                        href="/dashboard/materias"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <BookOpen className="w-4 h-4" />
                        Volver al catálogo
                    </Link>
                </div>
            </div>
        );
    }

    // Use real data from API
    const sections = subject.sections || [];
    const teachers = subject.teachers || [];

    const sectionsWithAvg = sections.filter((s: any) => s.average && s.average > 0);
    const averageGrade = sectionsWithAvg.length > 0
        ? Math.round((sectionsWithAvg.reduce((sum: number, s: any) => sum + s.average, 0) / sectionsWithAvg.length) * 10) / 10
        : 0;
    const approvalRate = sectionsWithAvg.length > 0
        ? Math.round((sectionsWithAvg.filter((s: any) => s.average >= 10).length / sectionsWithAvg.length) * 100)
        : 0;

    const metrics = {
        totalStudents: subject.totalStudents || 0,
        averageGrade,
        approvalRate,
        activeSections: subject.sectionCount || sections.length
    };

    return (
        <div className="min-h-screen bg-gray-50/50 pb-12">
            {/* Header with real subject data */}
            <SubjectHeader
                subjectName={subject.name}
                subjectCode={subject.name.substring(0, 3).toUpperCase()}
                subjectColor={subject.color}
                cycles={cycles}
                currentCycleId={currentCycleId}
                subjectId={subjectId}
            />

            <div className="container mx-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* KPIs */}
                <SubjectKPIs {...metrics} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content: Table */}
                    <div className="lg:col-span-2 space-y-6">
                        {sections.length > 0 ? (
                            <SectionDistributionTable
                                sections={sections}
                                subjectId={subject.id}
                                cycleId={cycleName}
                            />
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <BookOpen className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Sin secciones asignadas</h3>
                                    <p className="text-gray-500 mb-4">
                                        Esta materia aún no ha sido asignada a ninguna sección en el ciclo seleccionado.
                                    </p>
                                    <p className="text-sm text-gray-400">
                                        Para asignar esta materia, ve a Académico → Secciones y agrega la materia desde ahí.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar: Teachers */}
                    <div className="space-y-6">
                        {teachers.length > 0 ? (
                            <TeachersSidebar teachers={teachers} />
                        ) : (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <h3 className="text-sm font-semibold text-gray-900 mb-4">Equipo Docente</h3>
                                <p className="text-sm text-gray-500">No hay profesores asignados aún.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
