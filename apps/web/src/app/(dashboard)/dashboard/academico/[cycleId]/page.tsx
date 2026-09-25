'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/hooks/useConfirm';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Layers, Pencil, GraduationCap, MoreVertical } from 'lucide-react';
import { academicYearService } from '@/services/academic-year.service';
import { classroomService, Classroom } from '@/services/classroom.service';
import { useAcademicYears } from '@/hooks/useAcademicYears';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GradeAccordion from '@/components/academic/GradeAccordion';
import TurnoBadge from '@/components/common/TurnoBadge';
import { Turno } from '@/lib/turnos';
import ClassroomModal from '@/components/classrooms/ClassroomModal';
import AcademicYearModal from '@/components/academic/AcademicYearModal';
import { toast } from 'sonner';
import AcademicStats from '@/components/academic/AcademicStats';
import LapsoSelector from '@/components/academic/LapsoSelector';
import { useAuthStore } from '@/store/auth.store';
import { esQueNoContesta } from '@/lib/estado-del-servidor';

export default function AcademicYearDashboard() {
    const confirmDialog = useConfirm();
    const params = useParams();
    const router = useRouter();
    const cycleIdParam = decodeURIComponent(params.cycleId as string);

    const [lapsoId, setLapsoId] = useState<string | undefined>(undefined);
    const queryClient = useQueryClient();
    const { user } = useAuthStore();
    const isAdmin = (user?.role as string) === 'ADMIN' || (user?.role as string) === 'SUPERADMIN';

    const [isClassroomModalOpen, setClassroomModalOpen] = useState(false);
    const [isYearModalOpen, setYearModalOpen] = useState(false);
    const [selectedGradeForCreation, setSelectedGradeForCreation] = useState<number>(1);
    const [classroomToEdit, setClassroomToEdit] = useState<Classroom | null>(null);

    /**
     * LOS DATOS, DE LA MEMORIA DE LA APP
     *
     * Se pedían a mano al entrar y se guardaban en el estado de la pantalla:
     * sin conexión no había nada que enseñar, porque lo guardado en el teléfono
     * es lo que pasa por React Query (`MemoriaDelTelefono`). Un administrador
     * sin luz ni internet abría el ciclo y lo encontraba vacío. Ahora se ve el
     * ciclo tal como estaba la última vez que se cargó.
     */
    const ciclos = useAcademicYears();
    const allCycles = ciclos.data ?? [];
    const year = allCycles.find((y) => y.id === cycleIdParam || y.name === cycleIdParam) ?? null;

    const secciones = useQuery({
        // La misma llave que `useClassrooms`: lo que invalide una, invalida la otra.
        queryKey: ['classrooms', year?.id, undefined],
        queryFn: () => classroomService.getClassrooms(year!.id),
        enabled: Boolean(year?.id),
    });
    const classrooms: Classroom[] = useMemo(() => {
        const d = secciones.data as Classroom[] | { classrooms: Classroom[] } | undefined;
        if (!d) return [];
        return Array.isArray(d) ? d : d.classrooms ?? [];
    }, [secciones.data]);

    const cifras = useQuery({
        queryKey: ['academicYearStats', year?.id, lapsoId ?? null],
        queryFn: () => academicYearService.getAcademicYearStats(year!.id, lapsoId),
        enabled: Boolean(year?.id),
        // Al cambiar de lapso se siguen viendo las cifras de antes hasta que
        // lleguen las nuevas, en vez de un salto a cero.
        placeholderData: (anteriores) => anteriores,
    });
    const gradeStats: Record<number, any> = useMemo(() => cifras.data ?? {}, [cifras.data]);

    /** Tras crear, editar o borrar: que se vuelva a pedir lo de esta pantalla. */
    const fetchData = () => {
        queryClient.invalidateQueries({ queryKey: ['academicYears'] });
        queryClient.invalidateQueries({ queryKey: ['classrooms'] });
        queryClient.invalidateQueries({ queryKey: ['academicYearStats'] });
    };

    const handleBack = () => {
        router.push('/dashboard/academico');
    };

    const handleAddSection = (grade: number) => {
        setSelectedGradeForCreation(grade);
        setClassroomModalOpen(true);
    };

    /**
     * FILTRO POR TURNO
     *
     * Un liceo de dos turnos tiene el doble de secciones en esta pantalla, y de
     * dos en dos con el mismo nombre. Con el filtro se mira un turno cada vez.
     * `TODOS` es lo normal; el filtro solo aparece si de verdad hay dos turnos.
     */
    const [turnoElegido, setTurnoElegido] = useState<'TODOS' | Turno>('TODOS');

    const turnosQueHay = useMemo(
        () => Array.from(new Set(classrooms.map((c) => (c.shift as Turno) || 'MANANA'))).sort(),
        [classrooms]
    );

    const classroomsByGrade = useMemo(() => {
        const grouped: Record<number, Classroom[]> = {};
        [1, 2, 3, 4, 5, 6].forEach(g => grouped[g] = []);

        classrooms
            .filter((c) => turnoElegido === 'TODOS' || ((c.shift as Turno) || 'MANANA') === turnoElegido)
            .forEach(c => {
            if (grouped[c.grade]) grouped[c.grade].push(c);
        });

        Object.keys(grouped).forEach(key => {
            grouped[Number(key)].sort((a, b) => a.section.localeCompare(b.section));
        });

        return grouped;
    }, [classrooms, turnoElegido]);

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

    // Solo se espera si no hay NADA que enseñar: con lo guardado en el
    // teléfono, se pinta al instante aunque no haya conexión.
    if (ciclos.isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (!year) {
        const sinConexion = esQueNoContesta(ciclos.error);
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-red-500 font-medium">
                    {sinConexion
                        ? 'Sin conexión, y este ciclo no se había abierto antes en este dispositivo.'
                        : ciclos.error
                          ? 'No se pudo cargar el ciclo escolar.'
                          : 'Año escolar no encontrado'}
                </p>
                <button onClick={() => router.back()} className="flex items-center gap-2 text-indigo-600 hover:underline">
                    <ArrowLeft className="w-4 h-4" /> Volver
                </button>
            </div>
        );
    }

    const estado: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' = (() => {
        const now = new Date();
        const start = new Date(year.startDate);
        const end = new Date(year.endDate);
        end.setHours(23, 59, 59, 999);
        if (now > end) return 'COMPLETED';
        if (now >= start && now <= end) return 'ACTIVE';
        return 'UPCOMING';
    })();
    const ESTADOS = {
        ACTIVE: { texto: 'En curso', clase: 'sm:bg-emerald-50 text-emerald-700 ring-emerald-200' },
        UPCOMING: { texto: 'Próximo', clase: 'sm:bg-blue-50 text-blue-700 ring-blue-200' },
        COMPLETED: { texto: 'Finalizado', clase: 'sm:bg-gray-100 text-gray-600 ring-gray-200' },
    } as const;

    return (
        // Sin fondo ni márgenes propios (ver «SIN CAJA GRIS PROPIA» en la
        // sección): con la franja blanca y su `px-4` encima del margen del marco,
        // todo empezaba 16 px más adentro que en las demás pantallas, y había un
        // segundo `<main>` dentro del primero.
        <div className="space-y-6">
            {/*
                EL ENCABEZADO, EN UNA LÍNEA

                Eran tres filas de botones —el ciclo, un selector para cambiar
                de ciclo, el lapso, «Finalizar Ciclo Escolar» en rojo, el estado,
                «Editar»— más cinco tarjetas, y todo pegado arriba al bajar: en
                un teléfono tapaba media pantalla todo el rato. Ahora:

                · El selector de ciclo, fuera: para ir a otro ciclo se vuelve
                  atrás y se entra en él.
                · Editar y Finalizar, en el menú de los tres puntos. Finalizar un
                  ciclo es de una vez al año y no puede estar a un toque sin
                  querer, en rojo, al lado del lapso.
                · Ya no se queda pegado al bajar.
            */}
            <header>
                <div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleBack}
                            aria-label="Volver a los ciclos escolares"
                            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        {/* El nombre no se encoge: en un teléfono el lapso se lo
                            comía entero y la cabecera no decía qué ciclo era.
                            El estado va debajo, en pequeño, para caber. */}
                        <div className="flex min-w-[5.5rem] flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                            <h1 className="truncate text-seccion font-bold text-gray-900 sm:text-pantalla">{year.name}</h1>
                            <span
                                className={`w-fit shrink-0 text-xs font-semibold sm:rounded-full sm:px-2 sm:py-0.5 sm:ring-1 sm:ring-inset ${ESTADOS[estado].clase}`}
                            >
                                {ESTADOS[estado].texto}
                            </span>
                        </div>
                        <LapsoSelector
                            periods={(year.periods || []).map((p) => ({ id: p.id as string, name: p.name }))}
                            value={lapsoId}
                            onChange={setLapsoId}
                            compact
                        />
                        {isAdmin && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label="Más opciones del ciclo"
                                        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
                                    >
                                        <MoreVertical className="h-5 w-5" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => setYearModalOpen(true)}>
                                        <Pencil className="mr-2 h-4 w-4" /> Editar el ciclo
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={() => router.push(`/dashboard/academico/${year.name}/promocion`)}
                                        className="text-rose-700 focus:text-rose-700"
                                    >
                                        <GraduationCap className="mr-2 h-4 w-4" /> Finalizar el ciclo escolar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    <AcademicStats stats={globalStats || undefined} className="mt-3" />
                </div>
            </header>

            <div>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-indigo-600" />
                            Gestión por Niveles
                        </h2>

                        {turnosQueHay.length > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setTurnoElegido('TODOS')}
                                    aria-pressed={turnoElegido === 'TODOS'}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                        turnoElegido === 'TODOS'
                                            ? 'border-indigo-600 bg-indigo-600 text-white'
                                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                                    }`}
                                >
                                    Todos los turnos
                                </button>
                                {turnosQueHay.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTurnoElegido(t)}
                                        aria-pressed={turnoElegido === t}
                                        className={`rounded-full ${turnoElegido === t ? 'ring-2 ring-indigo-600' : ''}`}
                                    >
                                        <TurnoBadge turno={t} tamano="md" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        {[1, 2, 3, 4, 5, 6].map((grade) => (
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
            </div>

            <ClassroomModal
                isOpen={isClassroomModalOpen}
                onClose={handleModalClose}
                onSuccess={handleModalSuccess}
                defaultYearId={year.id}
                defaultGrade={selectedGradeForCreation}
                classroomToEdit={classroomToEdit}
                existingClassrooms={classroomsByGrade[selectedGradeForCreation] || []}
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
