'use client';

import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Calendar, Clock, Users, BookOpen, Edit, Eye,
    ChevronRight, Search, Building2, UserCheck, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useScheduleSummary } from '@/hooks/useSchedules';

export default function HorariosPage() {
    const [view, setView] = useState<'sections' | 'teachers'>('sections');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYearId, setSelectedYearId] = useState<string>('');

    const { data: academicYears, isLoading: isLoadingYears } = useAcademicYears();

    // Auto-select first year if none selected
    const activeYearId = useMemo(() => {
        if (selectedYearId) return selectedYearId;
        if (academicYears && academicYears.length > 0) {
            const active = academicYears.find((y: any) => y.status === 'ACTIVE' || y.isActive);
            return active?.id || academicYears[0].id;
        }
        return '';
    }, [selectedYearId, academicYears]);

    const { data: summaryData, isLoading: isLoadingSummary } = useScheduleSummary(activeYearId);

    const activeYearName = useMemo(() => {
        if (!academicYears) return '';
        const year = academicYears.find((y: any) => y.id === activeYearId);
        return year ? year.name : '';
    }, [academicYears, activeYearId]);

    const sections = summaryData?.sections || [];
    const teachers = summaryData?.teachers || [];

    const filteredSections = sections.filter((s: any) =>
        s.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredTeachers = teachers.filter((t: any) =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalSections = sections.length;
    const completedSections = sections.filter((s: any) => s.completionPercent === 100).length;
    const totalTeachers = teachers.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 rounded-2xl p-8 text-white shadow-xl">
                <div className="flex items-center gap-3 mb-2">
                    <Calendar className="w-8 h-8" />
                    <h1 className="text-3xl font-bold">Gestión de Horarios</h1>
                </div>
                <p className="text-blue-100 text-sm mt-1">
                    Administra los horarios de todas las secciones y profesores del ciclo escolar.
                </p>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                        <p className="text-blue-100 text-xs font-medium">Secciones</p>
                        <p className="text-2xl font-bold">{totalSections}</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                        <p className="text-blue-100 text-xs font-medium">Horarios Completos</p>
                        <p className="text-2xl font-bold">{completedSections}/{totalSections}</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                        <p className="text-blue-100 text-xs font-medium">Profesores Asignados</p>
                        <p className="text-2xl font-bold">{totalTeachers}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setView('sections')}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            view === 'sections'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                        }`}
                    >
                        <Building2 className="w-4 h-4" />
                        Por Secciones
                    </button>
                    <button
                        onClick={() => setView('teachers')}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            view === 'teachers'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                        }`}
                    >
                        <UserCheck className="w-4 h-4" />
                        Por Profesores
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {/* Academic year selector */}
                    <Select value={activeYearId || undefined} onValueChange={setSelectedYearId}>
                        <SelectTrigger className="min-w-[200px]">
                            <SelectValue placeholder="Seleccionar año" />
                        </SelectTrigger>
                        <SelectContent>
                            {academicYears?.map((year: any) => (
                                <SelectItem key={year.id} value={year.id}>
                                    {year.name} {year.isActive ? '(Activo)' : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={view === 'sections' ? 'Buscar sección...' : 'Buscar profesor...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Loading state */}
            {(isLoadingYears || isLoadingSummary) && (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span className="ml-3 text-gray-500">Cargando horarios...</span>
                </div>
            )}

            {/* Sections View */}
            {!isLoadingSummary && view === 'sections' && (
                <div className="space-y-4">
                    {filteredSections.length === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600">No hay secciones</h3>
                            <p className="text-gray-400 text-sm mt-1">No se encontraron secciones para este ciclo escolar.</p>
                        </div>
                    ) : (
                        filteredSections.map((section: any) => (
                            <div
                                key={section.id}
                                className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-200 group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                                <BookOpen className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{section.name}</h3>
                                                <p className="text-sm text-gray-500">
                                                    {section.teacher
                                                        ? `Prof. Guía: ${section.teacher.firstName} ${section.teacher.lastName}`
                                                        : 'Sin profesor guía'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 mt-3 text-sm text-gray-500">
                                            <span className="flex items-center gap-1.5">
                                                <BookOpen className="w-3.5 h-3.5" />
                                                {section.subjectCount} materias
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" />
                                                {section.assignedBlocks}/{section.totalWeeklyBlocks} bloques
                                            </span>
                                            <span className={`flex items-center gap-1.5 font-medium ${
                                                section.completionPercent === 100 ? 'text-green-600' :
                                                section.completionPercent > 50 ? 'text-yellow-600' : 'text-red-500'
                                            }`}>
                                                {section.completionPercent === 100 ? '✅' :
                                                 section.completionPercent > 0 ? '🔄' : '⚠️'}
                                                {section.completionPercent}% completado
                                            </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="mt-3 w-full max-w-md bg-gray-100 rounded-full h-2">
                                            <div
                                                className={`h-2 rounded-full transition-all duration-500 ${
                                                    section.completionPercent === 100 ? 'bg-green-500' :
                                                    section.completionPercent > 50 ? 'bg-yellow-500' : 'bg-red-400'
                                                }`}
                                                style={{ width: `${Math.min(section.completionPercent, 100)}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Link
                                            href={`/dashboard/horario/${activeYearName}/${section.slug?.replace(`-${activeYearName}`, '') || section.id}`}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                        >
                                            <Edit className="w-4 h-4" />
                                            Editar
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Teachers View */}
            {!isLoadingSummary && view === 'teachers' && (
                <div className="space-y-4">
                    {filteredTeachers.length === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600">No hay profesores</h3>
                            <p className="text-gray-400 text-sm mt-1">No se encontraron profesores con materias asignadas.</p>
                        </div>
                    ) : (
                        filteredTeachers.map((teacher: any) => (
                            <div
                                key={teacher.id}
                                className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-lg transition-all duration-200 group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">
                                            {teacher.firstName?.[0]}{teacher.lastName?.[0]}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">
                                                {teacher.firstName} {teacher.lastName}
                                            </h3>
                                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                                <span className="flex items-center gap-1.5">
                                                    <Building2 className="w-3.5 h-3.5" />
                                                    {teacher.sectionCount} {teacher.sectionCount === 1 ? 'sección' : 'secciones'}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {teacher.totalHours}h/semana
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {teacher.totalBlocks} bloques
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                {teacher.sections?.map((sectionName: string, i: number) => (
                                                    <span
                                                        key={i}
                                                        className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full"
                                                    >
                                                        {sectionName}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Link
                                            href={`/dashboard/usuarios/${teacher.id}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                                        >
                                            <Eye className="w-4 h-4" />
                                            Ver Perfil
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
