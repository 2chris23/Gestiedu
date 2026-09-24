'use client';

import { Button } from '@/components/ui/button';
import { EncabezadoDePantalla } from '@/components/ui/encabezado-de-pantalla';
import { useState, useEffect } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, BookOpen, Users, Trash2, Edit } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import ClassroomModal from '@/components/classrooms/ClassroomModal';
import { classroomService, Classroom } from '@/services/classroom.service';
import { academicYearService, AcademicYear } from '@/services/academic-year.service';
import TurnoBadge from '@/components/common/TurnoBadge';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

export default function ClassroomsPage() {
    const confirmDialog = useConfirm();
    const router = useRouter();
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [loading, setLoading] = useState(true);
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [selectedYearId, setSelectedYearId] = useState<string>('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            // Fetch years first
            const yearsData = await academicYearService.getAcademicYears();
            setYears(yearsData);

            // Determine year to filter by: selected, or active, or first
            let filterId = selectedYearId;
            if (!filterId) {
                const active = yearsData.find(y => y.status === 'ACTIVE');
                filterId = active ? active.id : (yearsData[0]?.id || '');
                if (filterId) setSelectedYearId(filterId);
            }

            if (filterId) {
                const classData = await classroomService.getClassrooms(filterId);
                setClassrooms(Array.isArray(classData) ? classData : classData.classrooms);
            } else {
                setClassrooms([]);
            }
        } catch (error) {
            console.error(error);
            if (!esQueNoContesta(error)) toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line
    }, [selectedYearId]); // Reload when filter changes

    const handleCreate = () => {
        setSelectedClassroom(null);
        setIsModalOpen(true);
    };

    const handleEdit = (e: React.MouseEvent, classroom: Classroom) => {
        e.stopPropagation(); // Prevent card click
        setSelectedClassroom(classroom);
        setIsModalOpen(true);
    };

    const handleDelete = async (e: React.MouseEvent, id: string, hasStudents: boolean) => {
        e.stopPropagation(); // Prevent card click
        if (hasStudents) {
            toast.error('No se puede eliminar un aula con estudiantes');
            return;
        }
        if (!(await confirmDialog({ title: '¿Eliminar aula?' }))) return;
        try {
            await classroomService.deleteClassroom(id);
            toast.success('Aula eliminada');
            fetchData();
        } catch (e) {
            toast.error('Error al eliminar');
        }
    }

    const handleCardClick = (classroomId: string) => {
        router.push(`/dashboard/aulas/${classroomId}`);
    };

    return (
        <div className="space-y-6">
            <Toaster position="top-right" />

            <EncabezadoDePantalla
                titulo="Aulas y Secciones"
                descripcion="Administra los espacios académicos por año escolar"
                acciones={
                    <>
                        <Select value={selectedYearId || undefined} onValueChange={setSelectedYearId}>
                            <SelectTrigger className="w-full sm:w-48" aria-label="Año escolar">
                                <SelectValue placeholder="Seleccionar Año..." />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(y => (
                                    <SelectItem key={y.id} value={y.id}>{y.name} {y.status === 'ACTIVE' ? '(Activo)' : ''}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleCreate}>
                            <Plus aria-hidden />
                            Nueva Aula
                        </Button>
                    </>
                }
            />

            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {classrooms.map((classroom) => (
                        <div
                            key={classroom.id}
                            onClick={() => handleCardClick(classroom.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleCardClick(classroom.id);
                                }
                            }}
                            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 transition-all hover:shadow-md cursor-pointer hover:border-blue-300"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                        <BookOpen className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-semibold text-gray-900">{classroom.name}</h3>
                                            <TurnoBadge turno={classroom.shift} />
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Profesor: {classroom.teacher ? `${classroom.teacher.firstName} ${classroom.teacher.lastName}` : 'Sin asignar'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-4 mt-2 mb-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500 flex items-center gap-1"><Users className="w-4 h-4" /> Estudiantes</span>
                                    <span className="font-medium text-gray-900">{classroom._count?.students || 0}/{classroom.capacity}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Sección</span>
                                    <span className="font-medium text-gray-900 px-2 py-0.5 bg-gray-100 rounded">{classroom.section}</span>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={(e) => handleEdit(e, classroom)}
                                    className="px-2 py-1 text-gray-600 hover:text-blue-600 transition-colors"
                                    title="Editar aula"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(e) => handleDelete(e, classroom.id, !!classroom._count?.students)}
                                    className={`px-2 py-1 text-gray-600 hover:text-red-600 transition-colors ${classroom._count?.students ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={classroom._count?.students ? 'No se puede eliminar con estudiantes' : 'Eliminar aula'}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {classrooms.length === 0 && (
                        <div className="col-span-full py-12 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                            <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
                            <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay aulas registradas</h3>
                            <p className="mt-1 text-sm text-gray-500">Para el periodo seleccionado.</p>
                        </div>
                    )}
                </div>
            )}

            <ClassroomModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchData}
                classroomToEdit={selectedClassroom}
            />
        </div>
    );
}
