'use client';

import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Calendar, Clock, Users, BookOpen, Edit,
    ChevronRight, ChevronDown, Search, Building2, UserCheck, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useScheduleSummary } from '@/hooks/useSchedules';
import { cn } from '@/lib/utils';

const GRADE_NAMES: Record<number, string> = {
    1: 'Primer Año',
    2: 'Segundo Año',
    3: 'Tercer Año',
    4: 'Cuarto Año',
    5: 'Quinto Año',
};

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

    const [openGrades, setOpenGrades] = useState<Record<number, boolean>>({});

    const toggleGrade = (grade: number) => {
        setOpenGrades(prev => ({
            ...prev,
            [grade]: !prev[grade]
        }));
    };

    const expandAll = (grades: number[]) => {
        const next: Record<number, boolean> = {};
        grades.forEach(g => { next[g] = true; });
        setOpenGrades(next);
    };

    const collapseAll = () => {
        setOpenGrades({});
    };

    const availableGrades = useMemo(() => {
        const set = new Set<number>();
        sections.forEach((s: any) => {
            if (typeof s.grade === 'number') set.add(s.grade);
        });
        if (set.size === 0) return [1, 2, 3, 4, 5];
        return Array.from(set).sort((a, b) => a - b);
    }, [sections]);

    return (
        <div className="space-y-6">
            {/* Era un degradado de 30 px de título con las tres cifras encima,
                el único así junto con Eventos: las demás pantallas empiezan con
                título y descripción sobre el fondo. Las cifras siguen, en
                tarjetas como las del Panel. */}
            <EncabezadoDePantalla
                titulo="Gestión de Horarios"
                descripcion="Administra los horarios de todas las secciones y profesores del ciclo escolar."
            />
            <dl className="grid grid-cols-3 gap-3">
                {[
                    ['Secciones', `${totalSections}`],
                    ['Horarios completos', `${completedSections}/${totalSections}`],
                    ['Profesores asignados', `${totalTeachers}`],
                ].map(([rotulo, cifra]) => (
                    <div key={rotulo} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
                        <dt className="text-xs font-medium text-gray-600">{rotulo}</dt>
                        <dd className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">{cifra}</dd>
                    </div>
                ))}
            </dl>

            {/* Controls. `sm:flex-wrap`: en una tableta (768 px) los botones de
                vista, el año y el buscador no caben en una fila y empujaban la
                pantalla 4 px de lado (MOVIL-03); ahora el buscador baja. */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-4">
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

                {/* En el teléfono esto se apila: el selector de año y el buscador
                    medían juntos más que la pantalla y la empujaban hacia el
                    lado, así que toda la pantalla se movía al arrastrar. */}
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    {/* Academic year selector */}
                    <Select value={activeYearId || undefined} onValueChange={setSelectedYearId}>
                        <SelectTrigger className="w-full sm:min-w-[200px]">
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
                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={view === 'sections' ? 'Buscar sección...' : 'Buscar profesor...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm sm:w-64 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                    {/* Header bar with counter and expand/collapse actions */}
                    {filteredSections.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">
                                {availableGrades.length} niveles académicos • {filteredSections.length} secciones en total
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => expandAll(availableGrades)}
                                    className="whitespace-nowrap text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                                >
                                    Expandir todos
                                </button>
                                <span className="text-gray-300">•</span>
                                <button
                                    type="button"
                                    onClick={collapseAll}
                                    className="whitespace-nowrap text-gray-500 hover:text-gray-700 font-medium transition-colors"
                                >
                                    Colapsar todos
                                </button>
                            </div>
                        </div>
                    )}

                    {filteredSections.length === 0 ? (
                        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600">No hay secciones</h3>
                            <p className="text-gray-400 text-sm mt-1">No se encontraron secciones para este ciclo escolar.</p>
                        </div>
                    ) : (
                        availableGrades.map((grade) => {
                            const gradeSections = filteredSections.filter((s: any) => s.grade === grade);
                            if (gradeSections.length === 0 && searchTerm.trim().length > 0) return null;

                            const totalAssigned = gradeSections.reduce((sum: number, s: any) => sum + (s.assignedBlocks || 0), 0);
                            const totalWeekly = gradeSections.reduce((sum: number, s: any) => sum + (s.totalWeeklyBlocks || 0), 0);
                            const percent = totalWeekly > 0
                                ? Math.round((totalAssigned / totalWeekly) * 100)
                                : (gradeSections.length > 0 ? Math.round(gradeSections.reduce((sum: number, s: any) => sum + (s.completionPercent || 0), 0) / gradeSections.length) : 0);
                            const completedCount = gradeSections.filter((s: any) => s.completionPercent === 100).length;
                            const isOpen = searchTerm.trim().length > 0 ? true : !!openGrades[grade];

                            return (
                                <div
                                    key={grade}
                                    className={cn(
                                        "border rounded-2xl bg-white shadow-xs transition-all duration-300 overflow-hidden",
                                        isOpen ? "ring-2 ring-indigo-500/10 border-indigo-200 shadow-sm" : "border-gray-200 hover:border-indigo-200"
                                    )}
                                >
                                    {/* Header (Trigger) */}
                                    <div
                                        onClick={() => toggleGrade(grade)}
                                        className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 cursor-pointer bg-white hover:bg-gray-50/70 transition-colors select-none"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleGrade(grade);
                                            }
                                        }}
                                    >
                                        {/* Left: Grade Badge + Name + Subtitle */}
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className={cn(
                                                "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 transition-colors",
                                                isOpen ? "bg-indigo-600 text-white shadow-xs" : "bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100"
                                            )}>
                                                {grade}°
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-bold text-lg text-gray-900">
                                                        {grade}° {GRADE_NAMES[grade] || `Año ${grade}`}
                                                    </h3>
                                                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                                        {gradeSections.length} {gradeSections.length === 1 ? 'sección' : 'secciones'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                                                    <span className="flex items-center gap-1.5">
                                                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                        {totalAssigned}/{totalWeekly} bloques semanales
                                                    </span>
                                                    <span className="hidden sm:inline text-gray-300">•</span>
                                                    <span className="hidden sm:inline">
                                                        {completedCount}/{gradeSections.length} horarios completos
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Completion Percentage & Progress Bar & Chevron */}
                                        <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-28 sm:w-36 hidden sm:block">
                                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-2 rounded-full transition-all duration-500",
                                                                percent === 100 ? "bg-emerald-500" : percent > 50 ? "bg-amber-500" : "bg-rose-500"
                                                            )}
                                                            style={{ width: `${Math.min(percent, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className={cn(
                                                    "text-xs font-bold px-2.5 py-1 rounded-lg border shadow-2xs flex items-center gap-1.5",
                                                    percent === 100
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                        : percent > 50
                                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                                            : "bg-rose-50 text-rose-700 border-rose-200"
                                                )}>
                                                    {percent === 100 ? '✅' : percent > 0 ? '🔄' : '⚠️'}
                                                    {percent}% completado
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 group-hover:text-indigo-700 pl-1">
                                                <span className="hidden md:inline">{isOpen ? 'Ocultar secciones' : 'Ver secciones'}</span>
                                                <div className={cn(
                                                    "p-1.5 rounded-lg transition-all duration-200",
                                                    isOpen ? "bg-indigo-50 text-indigo-600 rotate-180" : "bg-gray-50 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                                                )}>
                                                    <ChevronDown size={18} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Accordion Body: Sections List */}
                                    {isOpen && (
                                        <div className="animate-in slide-in-from-top-2 duration-300 border-t border-gray-100 bg-gray-50/50 p-5 space-y-3">
                                            {gradeSections.length === 0 ? (
                                                <p className="text-sm text-gray-400 text-center py-4">No hay secciones registradas para este año.</p>
                                            ) : (
                                                gradeSections.map((section: any) => (
                                                    <div
                                                        key={section.id}
                                                        className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all duration-200 group/sec"
                                                    >
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-3 mb-1.5">
                                                                    <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                                        <BookOpen className="w-4 h-4" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <h4 className="text-base font-bold text-gray-900 truncate">{section.name}</h4>
                                                                        <p className="text-xs text-gray-500 truncate">
                                                                            {section.teacher
                                                                                ? `Prof. Guía: ${section.teacher.firstName} ${section.teacher.lastName}`
                                                                                : 'Sin profesor guía'}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-4 sm:gap-6 mt-2.5 text-xs text-gray-500 flex-wrap">
                                                                    <span className="flex items-center gap-1.5">
                                                                        <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                                                                        {section.subjectCount} materias
                                                                    </span>
                                                                    <span className="flex items-center gap-1.5">
                                                                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                                        {section.assignedBlocks}/{section.totalWeeklyBlocks} bloques
                                                                    </span>
                                                                    <span className={cn(
                                                                        "flex items-center gap-1 font-semibold",
                                                                        section.completionPercent === 100 ? 'text-emerald-600' :
                                                                        section.completionPercent > 50 ? 'text-amber-600' : 'text-rose-500'
                                                                    )}>
                                                                        {section.completionPercent === 100 ? '✅' :
                                                                         section.completionPercent > 0 ? '🔄' : '⚠️'}
                                                                        {section.completionPercent}% completado
                                                                    </span>
                                                                </div>

                                                                {/* Progress bar */}
                                                                <div className="mt-2.5 w-full max-w-md bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                    <div
                                                                        className={cn(
                                                                            "h-1.5 rounded-full transition-all duration-500",
                                                                            section.completionPercent === 100 ? 'bg-emerald-500' :
                                                                            section.completionPercent > 50 ? 'bg-amber-500' : 'bg-rose-400'
                                                                        )}
                                                                        style={{ width: `${Math.min(section.completionPercent, 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2 shrink-0 sm:self-center">
                                                                <Link
                                                                    href={`/dashboard/horario/${activeYearName}/${section.slug?.replace(`-${activeYearName}`, '') || section.id}`}
                                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-2xs"
                                                                >
                                                                    <Edit className="w-3.5 h-3.5" />
                                                                    Ver Horario
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
                        })
                    )}
                </div>
            )}

            {/* Teachers View */}
            {!isLoadingSummary && view === 'teachers' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredTeachers.length === 0 ? (
                        <div className="sm:col-span-2 xl:col-span-3 bg-white rounded-xl p-12 text-center border border-gray-100">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600">No hay profesores</h3>
                            <p className="text-gray-400 text-sm mt-1">No se encontraron profesores con materias asignadas.</p>
                        </div>
                    ) : (
                        filteredTeachers.map((teacher: any) => (
                            <Link
                                key={teacher.id}
                                href={`/dashboard/horarios/profesor/${teacher.id}`}
                                className="group flex flex-col bg-white rounded-xl border border-gray-100 p-5 hover:shadow-lg hover:border-indigo-200 transition-all duration-200"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 shrink-0 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">
                                        {teacher.firstName?.[0]}{teacher.lastName?.[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-base font-bold text-gray-900 leading-tight group-hover:text-indigo-700 transition-colors">
                                            {teacher.firstName} {teacher.lastName}
                                        </h3>
                                        <span className="text-xs text-gray-400">
                                            {teacher.totalHours}h/semana
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                            <Building2 className="w-3 h-3" />
                                            {teacher.sectionCount === 1 ? 'Sección' : 'Secciones'}
                                        </span>
                                        <span className="text-lg font-bold text-gray-900">{teacher.sectionCount}</span>
                                    </div>
                                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                                        <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                            <Calendar className="w-3 h-3" />
                                            Bloques
                                        </span>
                                        <span className="text-lg font-bold text-gray-900">{teacher.totalBlocks}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                    {teacher.sections?.slice(0, 4).map((sectionName: string, i: number) => (
                                        <span
                                            key={i}
                                            className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[11px] font-medium rounded-full"
                                        >
                                            {sectionName}
                                        </span>
                                    ))}
                                    {teacher.sections?.length > 4 && (
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-medium rounded-full">
                                            +{teacher.sections.length - 4}
                                        </span>
                                    )}
                                </div>

                                <span className="mt-4 pt-3 border-t border-gray-100 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                                    <Edit className="w-4 h-4" />
                                    Ver Horario
                                </span>
                            </Link>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
