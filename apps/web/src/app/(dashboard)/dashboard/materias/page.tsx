'use client';

import { Button } from '@/components/ui/button';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    ChevronLeft, Plus, Search, Edit, Trash2, BookOpen,
    Filter, MoreVertical, X, ArrowUpDown, ArrowUp, ArrowDown, Calendar
} from 'lucide-react';
import Link from 'next/link';
import { useSubjects, useCreateSubject, useUpdateSubject, useDeleteSubject } from '@/hooks/useSubjects';
import { useSubjectPalette } from '@/hooks/useInstitute';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CreateSubjectData, UpdateSubjectData, Subject } from '@/services/subjects.service';
import { Pagination } from '@/components/ui';
import { TablaAdaptable } from '@/components/ui/tabla-adaptable';
import { PaletteColorSelector } from '@/components/ui/PaletteColorSelector';
import { toast } from 'sonner';

export default function MateriasPage() {
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [searchTerm, setSearchTerm] = useState('');
    const [gradeFilter, setGradeFilter] = useState<string>('');
    const [selectedYearId, setSelectedYearId] = useState<string>('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
    const [sortField, setSortField] = useState<'name' | 'sectionCount' | 'teacherCount' | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const { data: academicYears, isLoading: isLoadingYears } = useAcademicYears();
    const debouncedSearch = useDebouncedValue(searchTerm, 300);

    // Predeterminado: ciclo activo
    useEffect(() => {
        if (academicYears && academicYears.length > 0 && !selectedYearId) {
            const active = academicYears.find(y => y.status === 'ACTIVE');
            setSelectedYearId(active?.id || academicYears[0].id);
        }
    }, [academicYears, selectedYearId]);

    const { data: subjectsData, isLoading } = useSubjects({
        page,
        limit,
        search: debouncedSearch,
        grade: gradeFilter,
        academicYearId: selectedYearId === 'all' ? undefined : (selectedYearId || undefined)
    });
    const createMutation = useCreateSubject();
    const updateMutation = useUpdateSubject();
    const deleteMutation = useDeleteSubject();

    const subjects = useMemo(() => subjectsData?.subjects ?? [], [subjectsData]);

    // Obtener nombre del ciclo seleccionado para URLs legibles
    const selectedYear = academicYears?.find(y => y.id === selectedYearId);
    const selectedCycleName = selectedYear?.name || '';
    const hasAcademicYears = !isLoadingYears && !!academicYears && academicYears.length > 0;

    // Función de ordenamiento
    const handleSort = (field: 'name' | 'sectionCount' | 'teacherCount') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Ordenar materias
    const sortedSubjects = useMemo(() => {
        if (!sortField) return subjects;

        return [...subjects].sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortDirection === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }

            return 0;
        });
    }, [subjects, sortField, sortDirection]);
    const pagination = subjectsData ? {
        currentPage: subjectsData.page,
        totalPages: subjectsData.totalPages,
        total: subjectsData.total
    } : null;

    const handleCreateSubject = async (data: CreateSubjectData) => {
        await createMutation.mutateAsync(data);
        setIsCreateModalOpen(false);
    };

    const handleUpdateSubject = async (data: UpdateSubjectData) => {
        if (!selectedSubject) return;
        await updateMutation.mutateAsync({ id: selectedSubject.id, data });
        setIsEditModalOpen(false);
        setSelectedSubject(null);
    };

    const handleDeleteSubject = async () => {
        if (!selectedSubject) return;
        await deleteMutation.mutateAsync(selectedSubject.id);
        setIsDeleteModalOpen(false);
        setSelectedSubject(null);
    };

    return (
        <div className="space-y-6">
            <EncabezadoDePantalla
                migas={
                    <nav aria-label="Ruta" className="flex items-center gap-2 text-sm text-gray-600">
                        <Link href="/dashboard" className="hover:text-gray-900">Inicio</Link>
                        <span aria-hidden>/</span>
                        <span className="font-medium text-gray-900">Materias</span>
                    </nav>
                }
                titulo="Catálogo de Materias"
                descripcion="Gestiona el catálogo global de materias del sistema"
                acciones={
                    <Button onClick={() => setIsCreateModalOpen(true)}>
                        <Plus aria-hidden />
                        Nueva Materia
                    </Button>
                }
            />

            {/* No academic years state */}
            {!isLoadingYears && (!academicYears || academicYears.length === 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
                    <Calendar className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">
                        No hay ciclos académicos configurados
                    </h2>
                    <p className="text-gray-600 mb-4 max-w-md mx-auto">
                        Para asignar materias a secciones primero debes crear un ciclo académico (año escolar).
                    </p>
                    <Link
                        href="/dashboard/academico"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Crear Ciclo Académico
                    </Link>
                </div>
            )}

            {/* Filters */}
            {hasAcademicYears && (
            <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre o código..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    {/* Academic Year Filter */}
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <Select value={selectedYearId || undefined} onValueChange={setSelectedYearId}>
                            <SelectTrigger className="w-full pl-10">
                                <SelectValue placeholder="Seleccionar año" />
                            </SelectTrigger>
                            <SelectContent>
                                {academicYears?.map((year) => (
                                    <SelectItem key={year.id} value={year.id}>
                                        {year.name} {year.status === 'ACTIVE' ? '(Actual)' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 sm:p-5">
                    <TablaAdaptable<(typeof sortedSubjects)[number]>
                        datos={sortedSubjects}
                        cargando={isLoading}
                        clave={(m) => m.id}
                        orden={sortField ? { por: sortField, hacia: sortDirection } : null}
                        alOrdenar={(por) => handleSort(por as 'name' | 'sectionCount' | 'teacherCount')}
                        vacio={<p className="text-cuerpo text-tinta-suave">No hay materias registradas</p>}
                        columnas={[
                            {
                                id: 'name',
                                titulo: 'Materia',
                                principal: true,
                                ordenable: true,
                                celda: (m) => (
                                    <Link
                                        href={`/dashboard/materias/${selectedCycleName}/${m.slug}`}
                                        className="group flex items-center gap-3"
                                    >
                                        <span
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-white"
                                            style={{ backgroundColor: m.color }}
                                        >
                                            {m.name.charAt(0)}
                                        </span>
                                        <span className="min-w-0 truncate font-medium text-gray-900 group-hover:text-indigo-600">
                                            {m.name}
                                        </span>
                                    </Link>
                                ),
                            },
                            {
                                id: 'sectionCount',
                                titulo: 'Secciones',
                                ordenable: true,
                                alinear: 'derecha',
                                celda: (m) => <span className="text-sm text-gray-900">{m.sectionCount || 0}</span>,
                            },
                            {
                                id: 'teacherCount',
                                titulo: 'Profesores',
                                ordenable: true,
                                alinear: 'derecha',
                                celda: (m) => <span className="text-sm text-gray-900">{m.teacherCount || 0}</span>,
                            },
                            {
                                id: 'acciones',
                                titulo: 'Acciones',
                                acciones: true,
                                alinear: 'derecha',
                                celda: (m) => (
                                    <span className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedSubject(m);
                                                setIsEditModalOpen(true);
                                            }}
                                            title="Editar materia"
                                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                                        >
                                            <Edit className="h-4 w-4" />
                                            <span className="sr-only">Editar</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedSubject(m);
                                                setIsDeleteModalOpen(true);
                                            }}
                                            title="Eliminar materia"
                                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            <span className="sr-only">Eliminar</span>
                                        </button>
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>

                {pagination && pagination.totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-200">
                        <Pagination
                            currentPage={pagination.currentPage}
                            totalPages={pagination.totalPages}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </div>
            </>
            )}

            {/* Create Modal */}
            {isCreateModalOpen && (
                <SubjectFormModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onSubmit={handleCreateSubject}
                    title="Nueva Materia"
                />
            )}

            {/* Edit Modal */}
            {isEditModalOpen && selectedSubject && (
                <SubjectFormModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedSubject(null);
                    }}
                    onSubmit={handleUpdateSubject}
                    title="Editar Materia"
                    initialData={selectedSubject}
                />
            )}

            {/* Delete Modal */}
            {isDeleteModalOpen && selectedSubject && (
                <DeleteConfirmModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => {
                        setIsDeleteModalOpen(false);
                        setSelectedSubject(null);
                    }}
                    onConfirm={handleDeleteSubject}
                    subjectName={selectedSubject.name}
                    isLoading={deleteMutation.isPending}
                />
            )}
        </div>
    );
}

// Subject Form Modal Component
function SubjectFormModal({
    isOpen,
    onClose,
    onSubmit,
    title,
    initialData,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; color: string }) => Promise<void>;
    title: string;
    initialData?: Subject;
}) {
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        color: initialData?.color || '#3B82F6',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
            <div className="flex items-center justify-center min-h-full p-4 text-center">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true" onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClose();
                    }
                }} />

                <div className="relative w-full max-w-lg bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all">
                    <form onSubmit={handleSubmit}>
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-gray-900">{title}</h3>
                                <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700">
                                    <X className="w-5 h-5" aria-hidden />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="subjectName" className="block text-sm font-medium text-gray-700 mb-1">
                                        Nombre de la materia *
                                    </label>
                                    <input
                                        id="subjectName"
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Ej: Matemáticas"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="subjectColor" className="block text-sm font-medium text-gray-700 mb-2">
                                        Color de la materia
                                    </label>
                                    <PaletteColorSelector
                                        id="subjectColor"
                                        selectedColor={formData.color}
                                        onSelectColor={(color) => setFormData({ ...formData, color: color })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                            <button
                                type="submit"
                                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                            >
                                {initialData ? 'Actualizar' : 'Crear'} Materia
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full sm:w-auto mt-3 sm:mt-0 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </div >
        </div >
    );
}

// Delete Confirmation Modal
function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    subjectName,
    isLoading,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    subjectName: string;
    isLoading: boolean;
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Borrar materia">
            <div className="flex items-center justify-center min-h-full p-4 text-center">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true" onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClose();
                    }
                }} />

                <div className="relative w-full max-w-lg bg-white rounded-2xl text-left overflow-hidden shadow-xl transform transition-all">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                <Trash2 className="h-6 w-6 text-red-600" />
                            </div>
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">
                                    Eliminar Materia
                                </h3>
                                <div className="mt-2">
                                    <p className="text-sm text-gray-500">
                                        ¿Estás seguro de que deseas eliminar la materia <strong>{subjectName}</strong>?
                                        Esta acción no se puede deshacer.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isLoading}
                            className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Eliminando...' : 'Eliminar'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="w-full sm:w-auto mt-3 sm:mt-0 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
