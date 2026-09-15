'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Layers, Pencil, GraduationCap } from 'lucide-react';
import { academicYearService, AcademicYear } from '@/services/academic-year.service';
import { classroomService, Classroom } from '@/services/classroom.service';
import GradeAccordion from '@/components/academic/GradeAccordion';
import ClassroomModal from '@/components/classrooms/ClassroomModal';
import AcademicYearModal from '@/components/academic/AcademicYearModal';
import { toast } from 'sonner';
import AcademicStats from '@/components/academic/AcademicStats';
import LapsoSelector from '@/components/academic/LapsoSelector';
import { useAuthStore } from '@/store/auth.store';
import { YearSelector } from '@/components/navigation/YearSelector';

export default function AcademicYearDashboard() {
    const confirmDialog = useConfirm();
    const params = useParams();
    const router = useRouter();
    const cycleIdParam = decodeURIComponent(params.cycleId as string);

    const [year, setYear] = useState<AcademicYear | null>(null);
    const [allCycles, setAllCycles] = useState<AcademicYear[]>([]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([]);
    const [gradeStats, setGradeStats] = useState<Record<number, any>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);
    const { user } = useAuthStore();
    const isAdmin = (user?.role as string) === 'ADMIN' || (user?.role as string) === 'SUPERADMIN';

    const [isClassroomModalOpen, setClassroomModalOpen] = useState(false);
    const [isYearModalOpen, setYearModalOpen] = useState(false);
    const [selectedGradeForCreation, setSelectedGradeForCreation] = useState<number>(1);
    const [classroomToEdit, setClassroomToEdit] = useState<Classroom | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const allYears = await academicYearService.getAcademicYears();
            setAllCycles(allYears);

            const foundYear = allYears.find(y => y.id === cycleIdParam || y.name === cycleIdParam);

            if (!foundYear) {
                setYear(null);
                setLoading(false);
                setError('Año escolar no encontrado');
                return;
            }

            setYear(foundYear);

            // Cargar aulas y estadísticas en paralelo con máxima velocidad
            const [classroomsData, stats] = await Promise.all([
                classroomService.getClassrooms(foundYear.id),
                academicYearService.getAcademicYearStats(foundYear.id, lapsoId)
            ]);

            setClassrooms(Array.isArray(classroomsData) ? classroomsData : classroomsData.classrooms);
            setGradeStats(stats);

        } catch (err) {
            console.error(err);
            toast.error('Error al cargar datos del ciclo escolar');
            setError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setLoading(false);
        }
    }, [cycleIdParam, lapsoId]);

    useEffect(() => {
        if (cycleIdParam) fetchData();
    }, [cycleIdParam, fetchData, lapsoId]);

    const handleBack = () => {
        router.push('/dashboard/academico');
    };

    const handleAddSection = (grade: number) => {
        setSelectedGradeForCreation(grade);
        setClassroomModalOpen(true);
    };

    const classroomsByGrade = useMemo(() => {
        const grouped: Record<number, Classroom[]> = {};
        [1, 2, 3, 4, 5].forEach(g => grouped[g] = []);

        classrooms.forEach(c => {
            if (grouped[c.grade]) grouped[c.grade].push(c);
        });

        Object.keys(grouped).forEach(key => {
            grouped[Number(key)].sort((a, b) => a.section.localeCompare(b.section));
        });

        return grouped;
    }, [classrooms]);

    const handleEditSection = (classroom: Classroom) => {
        setClassroomToEdit(classroom);
        setSelectedGradeForCreation(classroom.grade);
        setClassroomModalOpen(true);
    };

    const handleDeleteSection = async (id: string) => {
        try {
            if (!(await confirmDialog({ title: '¿Estás seguro de eliminar esta sección?' }))) return;
            await classroomService.deleteClassroom(id);
            toast.success('Sección eliminada exitosamente');
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error('Error al eliminar sección');
        }
    };

    const handleModalClose = () => {
        setClassroomModalOpen(false);
        setClassroomToEdit(null);
    };

    const handleModalSuccess = () => {
        handleModalClose();
        fetchData();
    };

    const globalStats = useMemo(() => {
        const statsArray = Object.values(gradeStats);
        if (statsArray.length === 0) return null;

        let totalStudents = 0;
        let totalCapacity = 0;
        let weightedSumAverage = 0;
        let totalRisk = 0;
        let weightedSumAttendance = 0;
        let totalObservations = 0;
        let globalMin = 20;
        let globalMax = 0;
        let hasStudentData = false;

        statsArray.forEach(item => {
            const s = item.stats;
            const [currentStr, capacityStr] = s.occupancy.split('/');
            const current = parseInt(currentStr);
            const capacity = parseInt(capacityStr);

            const avg = s.average;
            const attendance = parseInt(s.attendance.replace('%', ''));

            totalStudents += current;
            totalCapacity += capacity;
            weightedSumAverage += avg * current;
            totalRisk += s.riskCount;
            weightedSumAttendance += attendance * current;
            totalObservations += s.observations;

            if (current > 0) {
                hasStudentData = true;
                if (s.minAverage !== undefined) {
                    if (s.minAverage < globalMin) globalMin = s.minAverage;
                    if (s.maxAverage > globalMax) globalMax = s.maxAverage;
                }
            }
        });

        const finalAvg = totalStudents > 0 ? (weightedSumAverage / totalStudents).toFixed(1) : '0.0';
        const finalAttendance = totalStudents > 0 ? Math.round(weightedSumAttendance / totalStudents) : 0;

        return {
            average: Number(finalAvg),
            minAverage: hasStudentData ? Number(globalMin.toFixed(1)) : 0,
            maxAverage: hasStudentData ? Number(globalMax.toFixed(1)) : 0,
            riskCount: totalRisk,
            occupancy: `${totalStudents}/${totalCapacity}`,
            attendance: `${finalAttendance}%`,
            observations: totalObservations
        };
    }, [gradeStats]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error || !year) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-red-500 font-medium">Error: {error || 'Año escolar no encontrado'}</p>
                <button onClick={() => router.back()} className="flex items-center gap-2 text-indigo-600 hover:underline">
                    <ArrowLeft className="w-4 h-4" /> Volver
                </button>
            </div>
        );
    }

    const cyclesForSelector = allCycles.map(c => ({
        id: c.name,
        name: c.name,
        status: c.status
    }));

    return (
        <div className="min-h-screen bg-gray-50/50 pb-20">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4 mb-4 justify-between">
                        <div className="flex items-center gap-4">
                            <button onClick={handleBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
                                    {year.name}
                                    <YearSelector cycles={cyclesForSelector} />
                                    <LapsoSelector periods={(year.periods || []).map((p) => ({ id: p.id as string, name: p.name }))} value={lapsoId} onChange={setLapsoId} compact />
                                    {isAdmin && (
                                        <button
                                            onClick={() => router.push(`/dashboard/academico/${year.name}/promocion`)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors"
                                            title="Finalizar ciclo escolar (página de promoción con revisión)"
                                        >
                                            <GraduationCap className="w-3.5 h-3.5" />
                                            Finalizar Ciclo Escolar
                                        </button>
                                    )}
                                </h1>
                                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                                    {(() => {
                                        const now = new Date();
                                        const start = new Date(year.startDate);
                                        const end = new Date(year.endDate);
                                        end.setHours(23, 59, 59, 999);

                                        let status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' = 'UPCOMING';
                                        if (now > end) status = 'COMPLETED';
                                        else if (now >= start && now <= end) status = 'ACTIVE';

                                        return (
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold
                                                ${status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                                                    status === 'UPCOMING' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-600'}`}>
                                                {status === 'ACTIVE' ? 'En Curso' :
                                                    status === 'UPCOMING' ? 'Próximo' : 'Finalizado'}
                                            </span>
                                        );
                                    })()}
                                    <span>•</span>
                                    <span>Panel Académico</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setYearModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <Pencil className="w-4 h-4" />
                            Editar
                        </button>
                    </div>

                    <div className="mt-6">
                        <AcademicStats stats={globalStats || undefined} />
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-indigo-600" />
                            Gestión por Niveles
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5].map((grade) => (
                            <GradeAccordion
                                key={grade}
                                grade={grade}
                                classrooms={classroomsByGrade[grade] || []}
                                onAddSection={handleAddSection}
                                onEditSection={handleEditSection}
                                onDeleteSection={handleDeleteSection}
                                academicYearId={year.id}
                                yearSlug={year.name}
                                stats={gradeStats[grade]?.stats}
                            />
                        ))}
                    </div>
                </div>
            </main>

            <ClassroomModal
                isOpen={isClassroomModalOpen}
                onClose={handleModalClose}
                onSuccess={handleModalSuccess}
                defaultYearId={year.id}
                defaultGrade={selectedGradeForCreation}
                classroomToEdit={classroomToEdit}
                existingSections={(classroomsByGrade[selectedGradeForCreation] || []).map(c => c.section)}
            />

            <AcademicYearModal
                isOpen={isYearModalOpen}
                onClose={() => setYearModalOpen(false)}
                existingYears={[]}
                yearToEdit={year}
                onSuccess={() => {
                    setYearModalOpen(false);
                    fetchData();
                }}
            />
        </div>
    );
}
