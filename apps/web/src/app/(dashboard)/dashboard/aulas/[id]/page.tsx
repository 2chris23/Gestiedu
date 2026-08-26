'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    UserPlus,
    Users,
    BookOpen,
    GraduationCap,
    Trash2,
    UserCog
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AddStudentModal } from '@/components/modals';
import AssignTeacherModal from '@/components/academic/AssignTeacherModal';
import { classroomService, Classroom } from '@/services/classroom.service';
import { studentsService } from '@/services/students.service';
import { Card } from '@/components/ui';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentCode?: string;
    email?: string;
    average?: number;
    attendancePercentage?: number;
}

export default function ClassroomDetailPage() {
    const confirmDialog = useConfirm();
    const params = useParams();
    const router = useRouter();
    const classroomId = params.id as string;

    const [classroom, setClassroom] = useState<Classroom | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
    const [isAssignTeacherModalOpen, setIsAssignTeacherModalOpen] = useState(false);

    const fetchClassroomData = useCallback(async () => {
        try {
            setLoading(true);
            const classroomData = await classroomService.getClassroom(classroomId);
            setClassroom(classroomData);

            // Fetch students of this classroom
            const studentsData = await studentsService.getStudentsBySection(classroomId);
            setStudents(Array.isArray(studentsData) ? studentsData : studentsData.students || []);
        } catch (error) {
            console.error('Error fetching classroom:', error);
            toast.error('Error al cargar los datos de la sección');
        } finally {
            setLoading(false);
        }
    }, [classroomId]);

    useEffect(() => {
        if (classroomId) {
            fetchClassroomData();
        }
    }, [classroomId, fetchClassroomData]);

    const handleRemoveStudent = async (studentId: string) => {
        if (!(await confirmDialog({ title: '¿Estás seguro de remover este estudiante de la sección?' }))) return;

        try {
            await fetch(`/api/classrooms/${classroomId}/students/${studentId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            toast.success('Estudiante removido exitosamente');
            fetchClassroomData();
        } catch (error) {
            console.error('Error removing student:', error);
            toast.error('Error al remover estudiante');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!classroom) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Sección no encontrada</p>
                <button
                    onClick={() => router.push('/dashboard/aulas')}
                    className="mt-4 text-blue-600 hover:text-blue-700"
                >
                    Volver a Aulas
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Toaster position="top-right" richColors />

            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/dashboard/aulas')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{classroom.name}</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                {classroom.academicYear?.name || 'Año académico no asignado'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsAssignTeacherModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                            <UserCog className="mr-2 h-4 w-4" />
                            {classroom.teacher ? 'Cambiar Profesor' : 'Asignar Profesor'}
                        </button>
                        <button
                            onClick={() => setIsAddStudentModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                        >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Agregar Estudiante
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Users className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Estudiantes</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {students.length}/{classroom.capacity}
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-50 rounded-lg">
                                <GraduationCap className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Sección</p>
                                <p className="text-2xl font-bold text-gray-900">{classroom.section}</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-50 rounded-lg">
                                <BookOpen className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Grado</p>
                                <p className="text-2xl font-bold text-gray-900">{classroom.grade}°</p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-50 rounded-lg">
                                <UserCog className="h-5 w-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Profesor Guía</p>
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                    {classroom.teacher
                                        ? `${classroom.teacher.firstName} ${classroom.teacher.lastName}`
                                        : 'Sin asignar'}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Students List */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Lista de Estudiantes ({students.length})
                    </h2>
                </div>

                {students.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <Users className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">No hay estudiantes</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Comienza agregando estudiantes a esta sección
                        </p>
                        <button
                            onClick={() => setIsAddStudentModalOpen(true)}
                            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                        >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Agregar Primer Estudiante
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Estudiante
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Código
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Promedio
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Asistencia
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {students.map((student) => (
                                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-10 w-10">
                                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                                                        <span className="text-white font-semibold text-sm">
                                                            {student.firstName[0]}{student.lastName[0]}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {student.firstName} {student.lastName}
                                                    </div>
                                                    <div className="text-sm text-gray-500">{student.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm text-gray-900">{student.studentCode || student.id}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`text-sm font-semibold ${(student.average || 0) >= 14 ? 'text-green-600' :
                                                (student.average || 0) >= 10 ? 'text-yellow-600' :
                                                    'text-red-600'
                                                }`}>
                                                {student.average?.toFixed(1) || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`text-sm font-semibold ${(student.attendancePercentage || 0) >= 90 ? 'text-green-600' :
                                                (student.attendancePercentage || 0) >= 70 ? 'text-yellow-600' :
                                                    'text-red-600'
                                                }`}>
                                                {student.attendancePercentage?.toFixed(0) || '0'}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleRemoveStudent(student.id)}
                                                className="text-red-600 hover:text-red-900 transition-colors"
                                                title="Remover estudiante"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Modals */}
            <AddStudentModal
                isOpen={isAddStudentModalOpen}
                onClose={() => setIsAddStudentModalOpen(false)}
                classroomId={classroomId}
                academicYearId={classroom.academicYearId || ''}
                onSuccess={() => {
                    fetchClassroomData();
                    toast.success('Estudiante agregado exitosamente');
                }}
            />

            <AssignTeacherModal
                isOpen={isAssignTeacherModalOpen}
                onClose={() => setIsAssignTeacherModalOpen(false)}
                classroomId={classroomId}
                classroomName={classroom.name}
                currentTeacher={classroom.teacher}
                onSuccess={() => {
                    fetchClassroomData();
                    toast.success('Profesor asignado exitosamente');
                }}
            />
        </div>
    );
}
